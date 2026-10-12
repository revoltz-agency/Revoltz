import test from 'node:test';
import assert from 'node:assert/strict';

import { __setPoolForTests, sslOptionFor } from '../server/db.js';
import {
  countAuditRequests,
  countExpiredAuditRequests,
  deleteAuditRequest,
  getAuditRequest,
  insertAuditRequest,
  listAuditRequests,
  purgeExpiredAuditRequests,
  updateAuditRequestStatus,
} from '../server/auditInboxStore.js';

// No PostgreSQL is available in CI/sandbox, so the SQL layer is exercised
// against an instrumented pool. This proves parameterization — the property
// that matters for injection safety — without needing a live database.

// Neon and every other managed provider require TLS; a loopback dev database
// does not. Getting this backwards either breaks production or fails locally.
// (A real TLS handshake is not testable here — the embedded PostgreSQL build
// used for integration tests has no OpenSSL — so the decision logic is pinned.)
function withEnv(patch, fn) {
  const saved = {};
  for (const [k, v] of Object.entries(patch)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test('TLS is required for remote hosts and not for loopback', () => {
  const remote = 'postgresql://u:p@ep-cool.eu-central-1.aws.neon.tech/neondb';
  withEnv({ DATABASE_SSL: undefined, DATABASE_SSL_REJECT_UNAUTHORIZED: undefined }, () => {
    assert.deepEqual(sslOptionFor(remote), { rejectUnauthorized: true }, 'remote host must use TLS');
    assert.equal(sslOptionFor('postgresql://u:p@localhost:5432/db'), false);
    assert.equal(sslOptionFor('postgresql://u:p@127.0.0.1:5432/db'), false);
  });
});

test('DATABASE_SSL overrides the host-based default', () => {
  const remote = 'postgresql://u:p@ep-cool.eu-central-1.aws.neon.tech/neondb';
  withEnv({ DATABASE_SSL: 'require' }, () => {
    assert.deepEqual(sslOptionFor(remote), { rejectUnauthorized: true });
  });
  withEnv({ DATABASE_SSL: 'off' }, () => {
    assert.equal(sslOptionFor(remote), false, 'explicit off is honoured even remotely');
  });
  withEnv({ DATABASE_SSL: 'require', DATABASE_SSL_REJECT_UNAUTHORIZED: 'false' }, () => {
    assert.deepEqual(sslOptionFor(remote), { rejectUnauthorized: false });
  });
});

test('an unparseable connection string falls back to no TLS', () => {
  withEnv({ DATABASE_SSL: undefined }, () => {
    assert.equal(sslOptionFor('not-a-url'), false);
  });
});

function createFakePool(responder) {
  const calls = [];
  return {
    calls,
    on() {},
    async query(text, values = []) {
      calls.push({ text, values });
      return responder ? (responder(text, values) || { rows: [], rowCount: 0 }) : { rows: [], rowCount: 0 };
    },
    async end() {},
  };
}

function row(overrides = {}) {
  return {
    id: '3f0c1e2a-4b5d-4c6e-8f90-1a2b3c4d5e6f',
    name: 'Priya',
    business: 'North Star Cafe',
    email: 'priya@northstar.example',
    service: 'Website',
    message: 'No enquiries',
    status: 'new',
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-01-01T00:00:00.000Z'),
    retention_expires_at: new Date('2026-03-31T00:00:00.000Z'),
    ...overrides,
  };
}

const ORIGINAL_URL = process.env.DATABASE_URL;
process.env.DATABASE_URL = 'postgres://example.invalid/testdb';

test.after(() => {
  __setPoolForTests(null);
  process.env.DATABASE_URL = ORIGINAL_URL;
});

// ---------------------------------------------------------------------------
// Schema creation is idempotent and non-destructive
// ---------------------------------------------------------------------------

test('schema initialization only issues IF NOT EXISTS DDL and never destroys data', async () => {
  const pool = createFakePool();
  __setPoolForTests(pool);
  const { ensureSchema } = await import('../server/db.js');
  await ensureSchema();
  await ensureSchema(); // memoized: no second batch

  assert.ok(pool.calls.length >= 2, 'creates the tables and indexes');
  for (const { text, values } of pool.calls) {
    assert.deepEqual(values, [], 'DDL must not carry parameters');
    assert.match(text, /^\s*(CREATE TABLE IF NOT EXISTS|CREATE INDEX IF NOT EXISTS)\s/);
    assert.doesNotMatch(text, /\bDROP\b|\bTRUNCATE\b|\bALTER\b|\bDELETE\b|\bUPDATE\b/i);
  }
  const ddl = pool.calls.map((call) => call.text).join('\n');
  assert.match(ddl, /audit_requests/);
  assert.match(ddl, /audit_sessions/);
  assert.match(ddl, /retention_expires_at\s+timestamptz\s+NOT\s+NULL/);
  // Sessions store digests only, never raw tokens.
  assert.match(ddl, /token_hash\s+text\s+NOT\s+NULL\s+UNIQUE/);
  assert.match(ddl, /csrf_hash\s+text\s+NOT\s+NULL/);
  // Two-layer expiry.
  assert.match(ddl, /expires_at\s+timestamptz\s+NOT\s+NULL/);
  assert.match(ddl, /absolute_expires_at\s+timestamptz\s+NOT\s+NULL/);
  assert.match(ddl, /revoked_at/);
});

// ---------------------------------------------------------------------------
// Every data statement is parameterized
// ---------------------------------------------------------------------------

test('insert binds every user value and interpolates none of them', async () => {
  const pool = createFakePool((text) => (/RETURNING/.test(text) ? { rows: [row()] } : undefined));
  __setPoolForTests(pool);

  const hostile = "Robert'); DROP TABLE audit_requests;--";
  const stored = await insertAuditRequest({
    name: hostile,
    business: 'North Star Cafe',
    email: 'priya@northstar.example',
    service: 'Website',
    message: 'No enquiries',
  }, { retentionDays: 89, now: new Date('2026-01-01T00:00:00.000Z') });

  const insert = pool.calls.find((call) => /INSERT INTO audit_requests/.test(call.text));
  assert.ok(insert);
  assert.equal(insert.text.includes(hostile), false, 'value must never appear in SQL text');
  assert.equal(insert.text.includes('DROP TABLE'), false);
  assert.match(insert.text, /\$1, \$2, \$3, \$4, \$5/);
  assert.equal(insert.values[0], hostile);
  assert.equal(insert.values.length, 7, '5 fields + created_at + retention_expires_at');
  // 89 days after 2026-01-01 is 2026-03-31.
  assert.equal(insert.values[6], '2026-03-31T00:00:00.000Z');
  assert.equal(stored.status, 'new');
  assert.equal(stored.retentionExpiresAt, '2026-03-31T00:00:00.000Z');
});

test('list binds and clamps the limit', async () => {
  const pool = createFakePool((text) => (/\bLIMIT\b/.test(text) ? { rows: [row()] } : undefined));
  __setPoolForTests(pool);

  await listAuditRequests({ limit: 500 });
  assert.deepEqual(pool.calls.at(-1).values, [200]);
  // 0 is falsy, so it falls back to the default; a negative value is clamped up.
  await listAuditRequests({ limit: 0 });
  assert.deepEqual(pool.calls.at(-1).values, [100]);
  await listAuditRequests({ limit: -5 });
  assert.deepEqual(pool.calls.at(-1).values, [1]);
  await listAuditRequests({ limit: 'nonsense' });
  assert.deepEqual(pool.calls.at(-1).values, [100]);
  await listAuditRequests({});
  assert.deepEqual(pool.calls.at(-1).values, [100]);
  const selects = pool.calls.filter((call) => /SELECT[\s\S]*FROM audit_requests/.test(call.text));
  assert.equal(selects.length, 5);
  for (const call of selects) assert.match(call.text, /LIMIT \$1/);
});

test('get binds the id and rejects a malformed id before touching the database', async () => {
  const pool = createFakePool();
  __setPoolForTests(pool);

  assert.equal(await getAuditRequest('not-a-uuid'), null);
  assert.equal(pool.calls.length, 0, 'no query for an invalid id');

  await getAuditRequest('3f0c1e2a-4b5d-4c6e-8f90-1a2b3c4d5e6f');
  const select = pool.calls.at(-1);
  assert.match(select.text, /WHERE id = \$1/);
  assert.deepEqual(select.values, ['3f0c1e2a-4b5d-4c6e-8f90-1a2b3c4d5e6f']);
});

test('status updates validate the id, the status and the transition', async () => {
  // A closed request can move to in_progress.
  const pool = createFakePool((text) => ({
    rows: /RETURNING/.test(text)
      ? [row({ status: 'in_progress' })]
      : [row({ status: 'closed' })],
  }));
  __setPoolForTests(pool);

  assert.equal(await updateAuditRequestStatus('bad-id', 'closed'), null);
  assert.equal(await updateAuditRequestStatus('3f0c1e2a-4b5d-4c6e-8f90-1a2b3c4d5e6f', 'not-a-status'), null);
  assert.equal(pool.calls.length, 0, 'invalid input short-circuits before any query');

  const updated = await updateAuditRequestStatus('3f0c1e2a-4b5d-4c6e-8f90-1a2b3c4d5e6f', 'in_progress', {
    now: new Date('2026-02-01T00:00:00.000Z'),
  });
  assert.equal(updated.status, 'in_progress');
  const update = pool.calls.find((call) => /UPDATE audit_requests/.test(call.text));
  assert.match(update.text, /WHERE id = \$1/);
  assert.deepEqual(update.values, ['3f0c1e2a-4b5d-4c6e-8f90-1a2b3c4d5e6f', 'in_progress', '2026-02-01T00:00:00.000Z']);

  // Spam is terminal: from spam, nothing is allowed.
  const spamPool = createFakePool(() => ({ rows: [row({ status: 'spam' })] }));
  __setPoolForTests(spamPool);
  const blocked = await updateAuditRequestStatus('3f0c1e2a-4b5d-4c6e-8f90-1a2b3c4d5e6f', 'new');
  assert.equal(blocked, null);
  assert.equal(spamPool.calls.some((call) => /UPDATE audit_requests/.test(call.text)), false);
});

test('delete binds the id and rejects a malformed id without querying', async () => {
  const pool = createFakePool(() => ({ rowCount: 1 }));
  __setPoolForTests(pool);

  assert.equal(await deleteAuditRequest('nope'), false);
  assert.equal(pool.calls.length, 0);

  assert.equal(await deleteAuditRequest('3f0c1e2a-4b5d-4c6e-8f90-1a2b3c4d5e6f'), true);
  const del = pool.calls.at(-1);
  assert.match(del.text, /^DELETE FROM audit_requests WHERE id = \$1$/);
  assert.deepEqual(del.values, ['3f0c1e2a-4b5d-4c6e-8f90-1a2b3c4d5e6f']);
});

test('the retention purge binds now and hard-deletes past-expiry rows', async () => {
  const pool = createFakePool(() => ({ rowCount: 4 }));
  __setPoolForTests(pool);

  const now = new Date('2026-06-01T00:00:00.000Z');
  const deleted = await purgeExpiredAuditRequests({ now });
  assert.equal(deleted, 4);

  const purge = pool.calls.find((call) => /DELETE FROM audit_requests/.test(call.text));
  assert.ok(purge);
  assert.equal(purge.text.includes('2026-06-01'), false, 'no interpolated timestamp');
  assert.match(purge.text, /WHERE retention_expires_at < \$1/);
  assert.deepEqual(purge.values, ['2026-06-01T00:00:00.000Z']);
  // Hard delete, matching the documented policy — no soft-delete flag.
  assert.doesNotMatch(purge.text, /SET deleted_at|UPDATE/i);
});

test('counts are parameterized and default to zero', async () => {
  const pool = createFakePool((text) => (/count\(\*\)/.test(text) ? { rows: [{ total: 3 }] } : undefined));
  __setPoolForTests(pool);

  assert.equal(await countAuditRequests(), 3);
  const now = new Date('2026-06-01T00:00:00.000Z');
  assert.equal(await countExpiredAuditRequests({ now }), 3);
  const expiredCall = pool.calls.at(-1);
  assert.match(expiredCall.text, /retention_expires_at < \$1/);
  assert.deepEqual(expiredCall.values, ['2026-06-01T00:00:00.000Z']);

  const empty = createFakePool();
  __setPoolForTests(empty);
  assert.equal(await countAuditRequests(), 0);
  assert.equal(await countExpiredAuditRequests({ now }), 0);
});

test('no statement anywhere interpolates a value into SQL text', async () => {
  const pool = createFakePool((text) => ({
    rows: /RETURNING/.test(text) ? [row()] : [],
    rowCount: 1,
  }));
  __setPoolForTests(pool);

  const id = '3f0c1e2a-4b5d-4c6e-8f90-1a2b3c4d5e6f';
  await insertAuditRequest({
    name: "O'Brien'); DROP TABLE audit_requests;--",
    business: 'North Star Cafe',
    email: 'priya@northstar.example',
    service: 'Website',
    message: 'No enquiries yet',
  }, { now: new Date('2026-01-01T00:00:00.000Z') });
  await listAuditRequests({ limit: 10 });
  await getAuditRequest(id);
  await deleteAuditRequest(id);
  await purgeExpiredAuditRequests({ now: new Date('2026-06-01T00:00:00.000Z') });
  await countAuditRequests();
  await countExpiredAuditRequests({ now: new Date('2026-06-01T00:00:00.000Z') });

  for (const { text, values } of pool.calls) {
    if (!values.length) {
      // DDL or a constant-only statement: must not carry literals from callers.
      assert.doesNotMatch(text, /2026-|@example|North Star/);
      continue;
    }
    for (const value of values) {
      if (typeof value !== 'string') continue;
      // Short values can appear as incidental substrings of SQL keywords, so
      // only distinctive values are asserted on.
      if (value.length < 8) continue;
      assert.equal(text.includes(value), false, `value leaked into SQL text: ${value}`);
    }
  }
});
