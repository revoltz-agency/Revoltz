// Integration tests against REAL PostgreSQL.
//
// ⚠️ SAFETY FIRST — read before running.
//
// These tests are SKIPPED unless BOTH of these are set:
//     DATABASE_URL            your connection string
//     AUDIT_INTEGRATION_TEST=1
//
// Point DATABASE_URL at a THROWAWAY database or a throwaway Neon BRANCH, never
// at production. The suite additionally REFUSES TO RUN AT ALL if the target
// database already contains expired audit_requests, because both the inbox list
// endpoint and the retention purge delete expired rows and that would destroy
// data this suite did not create.
//
// Other safety properties:
//   * schema is created with CREATE TABLE IF NOT EXISTS only (never ALTER/DROP);
//   * every row it deletes is one it inserted, tracked by id;
//   * only the session rows it created are removed.
//
// Where to configure DATABASE_URL (never paste it into chat, never commit it):
//   1. Shell for the run:  DATABASE_URL='...' AUDIT_INTEGRATION_TEST=1 npm test
//   2. Gitignored .env:    /home/user/Revoltz/.env  (.env/.env.* are gitignored)
//   3. Your host's secret manager for deployed environments (Render dashboard).
//
// Requires a production build first:  npm ci && npm run build

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { closeDatabase, ensureSchema, queryDatabase } from '../../server/db.js';
import {
  deleteAuditRequest,
  getAuditRequest,
  insertAuditRequest,
  listAuditRequests,
  purgeExpiredAuditRequests,
  updateAuditRequestStatus,
} from '../../server/auditInboxStore.js';
import { validateAuditRequest } from '../../server/auditInbox.js';
import {
  createOwnerSession,
  hashOwnerPassword,
  revokeOwnerSession,
  resolveOwnerSession,
} from '../../server/session.js';
import { sha256Hex } from '../../server/security.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const ENV_ENABLED = Boolean(process.env.DATABASE_URL) && process.env.AUDIT_INTEGRATION_TEST === '1';

// ---------------------------------------------------------------------------
// Safety gate (evaluated once, at load, before any test is even defined)
// ---------------------------------------------------------------------------

let skipReason = 'set DATABASE_URL and AUDIT_INTEGRATION_TEST=1 to run against real PostgreSQL';
let preexistingRows = 0;
let preexistingExpired = 0;

if (ENV_ENABLED) {
  try {
    if (!existsSync(path.join(rootDir, 'dist', 'index.html'))) {
      skipReason = 'run `npm run build` first: the integration server serves dist/ in production mode';
    } else {
      await ensureSchema();
      const [all, expired] = await Promise.all([
        queryDatabase('SELECT count(*)::int AS total FROM audit_requests'),
        queryDatabase("SELECT count(*)::int AS total FROM audit_requests WHERE retention_expires_at < now()"),
      ]);
      preexistingRows = all.rows[0].total;
      preexistingExpired = expired.rows[0].total;
      console.log(`[integration] audit_requests: ${preexistingRows} row(s), ${preexistingExpired} already expired`);

      if (preexistingExpired > 0) {
        skipReason =
          `the target database already has ${preexistingExpired} expired audit_requests. ` +
          'This suite (and the inbox list endpoint) deletes expired rows, so running it would ' +
          'delete data it did not create. Point DATABASE_URL at an empty database or a fresh branch.';
      } else if (preexistingRows > 0) {
        console.warn(
          `[integration] NOTE: ${preexistingRows} pre-existing row(s) present. ` +
          'The suite will read them but will only delete rows it creates itself.',
        );
      }
    }
  } catch (error) {
    skipReason = `could not connect to the database: ${error.message}`;
  }
}

const ENABLED = ENV_ENABLED && skipReason.startsWith('set DATABASE_URL');

/** Wrapper that skips unless the suite is explicitly enabled AND safe. */
const t = (name, fn) => test(name, { skip: !ENABLED && skipReason }, fn);

if (ENV_ENABLED && !ENABLED) {
  console.warn(`[integration] SKIPPING: ${skipReason}`);
  await closeDatabase().catch(() => {});
}

// Throwaway password for the ephemeral localhost server this suite spawns. It is
// NOT a credential: it never leaves this process, the matching scrypt hash is
// generated in-memory at startup, and the server is killed when the test ends.
// Real deployments set AUDIT_OWNER_PASSWORD_HASH in the host's secret manager.
const TEST_PASSWORD = 'integration-test-password';
const createdIds = new Set();
const createdSessionHashes = new Set();

/** Tracks every id the suite creates so cleanup only ever removes its own rows. */
function track(row) {
  if (row?.id) createdIds.add(row.id);
  return row;
}

test.after(async () => {
  if (!ENABLED) return;
  for (const id of createdIds) {
    await queryDatabase('DELETE FROM audit_requests WHERE id = $1', [id]).catch(() => {});
  }
  for (const hash of createdSessionHashes) {
    await queryDatabase('DELETE FROM audit_sessions WHERE token_hash = $1', [hash]).catch(() => {});
  }
  console.log(`[integration] cleanup: removed ${createdIds.size} request row(s) and ${createdSessionHashes.size} session row(s) created by this suite`);
  await closeDatabase().catch(() => {});
});

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

t('schema creates both tables with the expected columns', async () => {
  const { rows } = await queryDatabase(`
    SELECT table_name, column_name, is_nullable
    FROM information_schema.columns
    WHERE table_name IN ('audit_requests', 'audit_sessions')
    ORDER BY table_name, column_name
  `);
  const columns = (table) => rows.filter((r) => r.table_name === table).map((r) => r.column_name);

  for (const expected of ['id', 'name', 'business', 'email', 'service', 'message', 'status', 'created_at', 'updated_at', 'retention_expires_at']) {
    assert.ok(columns('audit_requests').includes(expected), `audit_requests.${expected} missing`);
  }
  for (const expected of ['id', 'token_hash', 'csrf_hash', 'created_at', 'expires_at', 'absolute_expires_at', 'revoked_at', 'last_used_at']) {
    assert.ok(columns('audit_sessions').includes(expected), `audit_sessions.${expected} missing`);
  }
  // retention_expires_at must be NOT NULL, otherwise retention could be bypassed by a null.
  const expiry = rows.find((r) => r.table_name === 'audit_requests' && r.column_name === 'retention_expires_at');
  assert.equal(expiry.is_nullable, 'NO');
});

// ---------------------------------------------------------------------------
// CRUD against real PostgreSQL
// ---------------------------------------------------------------------------

t('insert, read, list and delete a real audit request', async () => {
  const { values } = validateAuditRequest({
    name: 'Integration Tester',
    business: 'Real Postgres Cafe',
    email: 'integration@example.com',
    service: 'Website design & development',
    message: 'Testing the Audit Inbox against real PostgreSQL.',
  });

  const stored = track(await insertAuditRequest(values, { retentionDays: 89 }));
  assert.ok(stored.id, 'a UUID was generated by the database');
  assert.equal(stored.status, 'new');
  assert.equal(stored.business, 'Real Postgres Cafe');

  // 89-day retention computed and persisted.
  const created = new Date(stored.createdAt).getTime();
  const expires = new Date(stored.retentionExpiresAt).getTime();
  assert.equal(Math.round((expires - created) / 86_400_000), 89);

  const fetched = await getAuditRequest(stored.id);
  assert.equal(fetched.email, 'integration@example.com');

  const all = await listAuditRequests({ limit: 200 });
  assert.ok(all.some((row) => row.id === stored.id));

  assert.equal(await deleteAuditRequest(stored.id), true);
  assert.equal(await getAuditRequest(stored.id), null);
  createdIds.delete(stored.id);
});

t('status transitions are enforced by real rows and spam is terminal', async () => {
  const { values } = validateAuditRequest({
    name: 'Status Tester', business: 'Status Cafe', email: 'status@example.com', message: 'Status flow',
  });
  const row = track(await insertAuditRequest(values, { retentionDays: 89 }));
  assert.equal(row.status, 'new');

  assert.equal((await updateAuditRequestStatus(row.id, 'in_progress'))?.status, 'in_progress');
  assert.equal((await updateAuditRequestStatus(row.id, 'closed'))?.status, 'closed');
  assert.equal((await updateAuditRequestStatus(row.id, 'new'))?.status, 'new');
  assert.equal((await updateAuditRequestStatus(row.id, 'spam'))?.status, 'spam');

  // Terminal: no transition out of spam, and no bad-status writes.
  assert.equal(await updateAuditRequestStatus(row.id, 'new'), null);
  assert.equal(await updateAuditRequestStatus(row.id, 'not-a-status'), null);
  assert.equal(await updateAuditRequestStatus('not-a-uuid', 'closed'), null);

  assert.equal((await getAuditRequest(row.id)).status, 'spam');
});

t('hostile input is stored verbatim as data and never executed as SQL', async () => {
  const payload = "O'Brien'); DROP TABLE audit_requests;--";
  const { values } = validateAuditRequest({
    name: payload, business: 'Injection Cafe', email: 'inj@example.com', message: payload,
  });
  const row = track(await insertAuditRequest(values, { retentionDays: 89 }));
  assert.equal(row.name, payload);
  // The table still exists: the payload was data, not code.
  const { rows } = await queryDatabase('SELECT count(*)::int AS total FROM audit_requests');
  assert.ok(rows[0].total >= 1);
});

// ---------------------------------------------------------------------------
// Sessions against real PostgreSQL
// ---------------------------------------------------------------------------

t('owner sessions are created, resolved, renewed and revoked in the database', async () => {
  const { token, csrfToken } = await createOwnerSession({});
  createdSessionHashes.add(sha256Hex(token));
  const request = { headers: { cookie: `agencyos_audit_session=${token}` } };

  const session = await resolveOwnerSession(request);
  assert.ok(session, 'a freshly created session resolves');
  assert.equal(session.csrfHash, sha256Hex(csrfToken), 'CSRF token is bound to the session row');
  assert.ok(new Date(session.absoluteExpiresAt) > new Date(session.expiresAt), 'absolute ceiling exceeds idle expiry');

  // The raw token is never stored.
  const raw = await queryDatabase('SELECT count(*)::int AS total FROM audit_sessions WHERE token_hash = $1', [token]);
  assert.equal(raw.rows[0].total, 0, 'raw token is not persisted');
  const byHash = await queryDatabase('SELECT count(*)::int AS total FROM audit_sessions WHERE token_hash = $1', [sha256Hex(token)]);
  assert.equal(byHash.rows[0].total, 1, 'only the digest is persisted');

  // Revocation is server-side, not just cookie deletion.
  assert.equal(await revokeOwnerSession(request), true);
  assert.equal(await resolveOwnerSession(request), null, 'a revoked session no longer resolves');
  assert.equal(await revokeOwnerSession(request), false, 'double revocation is a no-op');
});

t('an expired session never resolves', async () => {
  const { token } = await createOwnerSession({ now: new Date('2020-01-01T00:00:00.000Z') });
  createdSessionHashes.add(sha256Hex(token));
  const request = { headers: { cookie: `agencyos_audit_session=${token}` } };
  assert.equal(await resolveOwnerSession(request, { renew: false }), null);
  assert.equal(await resolveOwnerSession(request), null);
});

// ---------------------------------------------------------------------------
// Retention purge against real PostgreSQL
// ---------------------------------------------------------------------------

t('the retention purge deletes a real past-expiry row', async (ctx) => {
  // Belt and braces: the load-time gate already guarantees zero pre-existing
  // expired rows, but re-check before running a statement that DELETEs.
  const { rows } = await queryDatabase("SELECT count(*)::int AS total FROM audit_requests WHERE retention_expires_at < now()");
  if (rows[0].total > 0) {
    ctx.skip('expired rows appeared that this suite did not create; refusing to purge');
    return;
  }

  const { values } = validateAuditRequest({
    name: 'Expiry Tester', business: 'Expiry Cafe', email: 'expiry@example.com', message: 'To be purged',
  });
  const row = track(await insertAuditRequest(values, { retentionDays: 89 }));
  // Force this row past its expiry — only a row this suite created.
  await queryDatabase("UPDATE audit_requests SET retention_expires_at = now() - interval '1 day' WHERE id = $1", [row.id]);

  const deleted = await purgeExpiredAuditRequests({});
  assert.equal(deleted, 1);
  assert.equal(await getAuditRequest(row.id), null);
  createdIds.delete(row.id);
});

// ---------------------------------------------------------------------------
// Full HTTP end-to-end through the real Express server
// ---------------------------------------------------------------------------

function startServer(port) {
  return spawn(process.execPath, ['server/index.js'], {
    cwd: rootDir,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      DATABASE_URL: process.env.DATABASE_URL,
      AUDIT_OWNER_PASSWORD_HASH: hashOwnerPassword(TEST_PASSWORD),
      // Test-only server process. This flag stays false in every deployed config.
      AUDIT_PUBLIC_INTAKE_ENABLED: 'true',
      AUDIT_RETENTION_DAYS: '89',
      AUDIT_ALLOWED_ORIGINS: `http://127.0.0.1:${port}`,
      AUDIT_SESSION_IDLE_MINUTES: '480',
      AUDIT_SESSION_ABSOLUTE_MINUTES: '1440',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function waitForServer(base, child) {
  for (let i = 0; i < 80; i += 1) {
    if (child.exitCode !== null) throw new Error(`server exited early with code ${child.exitCode}`);
    try {
      const r = await fetch(`${base}/api/config`, { signal: AbortSignal.timeout(1000) });
      if (r.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('server did not become ready');
}

function cookieHeaderFrom(res) {
  const raw = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  return raw.map((c) => c.split(';')[0]).join('; ');
}

function readCookie(raw, name) {
  const match = (raw || '').split('; ').find((p) => p.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : '';
}

t('end-to-end HTTP flow: login, CSRF, origin, intake, status, delete, logout', async () => {
  const port = 5300 + Math.floor(Math.random() * 300);
  const base = `http://127.0.0.1:${port}`;
  const child = startServer(port);
  try {
    await waitForServer(base, child);

    const post = (p, { body, headers = {}, origin } = {}) => fetch(`${base}${p}`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'Content-Type': 'application/json',
        ...(origin ? { Origin: origin } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    // --- unauthenticated ---
    const unauth = await fetch(`${base}/api/audit/requests`);
    assert.equal(unauth.status, 401);

    // --- bad password ---
    const badLogin = await post('/api/audit/session', { body: { password: 'wrong-password-here' } });
    assert.equal(badLogin.status, 401);

    // --- cross-origin login is rejected (Origin checked before rate limiting) ---
    const crossOrigin = await post('/api/audit/session', { body: { password: TEST_PASSWORD }, origin: 'https://evil.example' });
    assert.equal(crossOrigin.status, 403);

    // --- good login (same-origin) ---
    const login = await post('/api/audit/session', { body: { password: TEST_PASSWORD }, origin: base });
    assert.equal(login.status, 201);
    const setCookies = login.headers.getSetCookie();
    const sessionCookie = setCookies.find((c) => c.startsWith('agencyos_audit_session='));
    assert.ok(sessionCookie, 'session cookie issued');
    assert.match(sessionCookie, /HttpOnly/, 'session cookie is HttpOnly');
    assert.match(sessionCookie, /SameSite=Strict/i);
    assert.doesNotMatch(sessionCookie, /Secure/, 'no Secure flag over plain HTTP');
    assert.ok(readCookie(cookieHeaderFrom(login), 'agencyos_audit_session').length > 20, 'session token is long');

    const csrf = readCookie(cookieHeaderFrom(login), 'agencyos_audit_csrf');
    assert.ok(csrf, 'CSRF cookie issued and readable by the SPA');
    const cookies = cookieHeaderFrom(login);

    // --- authenticated list ---
    const list = await fetch(`${base}/api/audit/requests`, { headers: { Cookie: cookies } });
    assert.equal(list.status, 200);
    const listBody = await list.json();
    assert.ok(Array.isArray(listBody.requests));
    assert.equal(listBody.retentionDays, 89);

    // --- public intake (enabled on this test process only) ---
    const invalid = await post('/api/audit/requests', { body: { name: '', email: 'bad' } });
    assert.equal(invalid.status, 400);

    const accepted = await post('/api/audit/requests', {
      body: { name: 'HTTP Tester', business: 'HTTP Cafe', email: 'http@example.com', service: 'Website', message: 'End-to-end' },
    });
    assert.equal(accepted.status, 202);
    const acceptedBody = await accepted.json();
    createdIds.add(acceptedBody.id);

    // --- CSRF enforced on state-changing calls ---
    const noCsrf = await fetch(`${base}/api/audit/requests/${acceptedBody.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookies, Origin: base },
      body: JSON.stringify({ status: 'in_progress' }),
    });
    assert.equal(noCsrf.status, 403, 'a state-changing call without the CSRF header is refused');

    const badCsrf = await fetch(`${base}/api/audit/requests/${acceptedBody.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookies, Origin: base, 'X-Audit-CSRF': 'wrong' },
      body: JSON.stringify({ status: 'in_progress' }),
    });
    assert.equal(badCsrf.status, 403);

    // --- valid CSRF ---
    const patched = await fetch(`${base}/api/audit/requests/${acceptedBody.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookies, Origin: base, 'X-Audit-CSRF': csrf },
      body: JSON.stringify({ status: 'in_progress' }),
    });
    assert.equal(patched.status, 200);
    assert.equal((await patched.json()).request.status, 'in_progress');

    // --- bad id is a 400, not a 500 ---
    const badId = await fetch(`${base}/api/audit/requests/nope`, {
      method: 'DELETE', headers: { Cookie: cookies, Origin: base, 'X-Audit-CSRF': csrf },
    });
    assert.equal(badId.status, 400);

    // --- retention status is honest ---
    const retention = await fetch(`${base}/api/audit/retention`, { headers: { Cookie: cookies } });
    assert.equal(retention.status, 200);
    const retentionBody = await retention.json();
    assert.equal(retentionBody.retentionDays, 89);
    assert.equal(retentionBody.scheduledCleanup.configured, true);
    assert.equal(retentionBody.scheduledCleanup.deployed, false);
    assert.equal(retentionBody.scheduledCleanup.operational, false);

    // --- delete ---
    const removed = await fetch(`${base}/api/audit/requests/${acceptedBody.id}`, {
      method: 'DELETE', headers: { Cookie: cookies, Origin: base, 'X-Audit-CSRF': csrf },
    });
    assert.equal(removed.status, 200);
    createdIds.delete(acceptedBody.id);

    // --- logout revokes server-side ---
    const logout = await post('/api/audit/session/logout', { headers: { Cookie: cookies, 'X-Audit-CSRF': csrf }, origin: base });
    assert.equal(logout.status, 200);
    const cleared = (logout.headers.getSetCookie() || []).map((c) => c.split(';')[0]).join('; ');
    assert.match(cleared, /agencyos_audit_session=;/, 'session cookie cleared');

    const afterLogout = await fetch(`${base}/api/audit/requests`, { headers: { Cookie: cookies } });
    assert.equal(afterLogout.status, 401, 'the revoked session no longer authenticates');
  } finally {
    child.kill('SIGTERM');
  }
});
