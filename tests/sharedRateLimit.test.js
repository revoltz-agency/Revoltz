import test from 'node:test';
import assert from 'node:assert/strict';
import { __setPoolForTests } from '../server/db.js';
import { checkSharedRateLimit, resetSharedRateLimit } from '../server/sharedRateLimit.js';
import { sha256Hex } from '../server/security.js';

const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;

function useDatabase() {
  process.env.DATABASE_URL = 'postgres://example.invalid/agencyos-test';
  const calls = [];
  const buckets = new Map();
  const pool = {
    calls,
    on() {},
    async end() {},
    async query(text, values = []) {
      calls.push({ text, values });
      if (/^\s*(CREATE (TABLE|INDEX) IF NOT EXISTS|ALTER TABLE organization_subscriptions|INSERT INTO organizations|INSERT INTO organization_memberships|INSERT INTO organization_subscriptions|INSERT INTO organization_modules|INSERT INTO organization_workspace_data)/i.test(text)) {
        return { rows: [], rowCount: 0 };
      }
      if (text.includes('INSERT INTO shared_rate_limit_buckets')) {
        const [key, now, windowMs] = values;
        const previous = buckets.get(key);
        const start = previous && new Date(previous.startedAt).getTime() > new Date(now).getTime() - windowMs
          ? previous.startedAt
          : now;
        const count = start === now ? 1 : previous.count + 1;
        buckets.set(key, { startedAt: start, count });
        return { rows: [{ hit_count: count, window_started_at: start }], rowCount: 1 };
      }
      if (text.includes('DELETE FROM shared_rate_limit_buckets')) {
        return { rows: [], rowCount: buckets.delete(values[0]) ? 1 : 0 };
      }
      throw new Error('Unexpected SQL: ' + text);
    },
  };
  __setPoolForTests(pool);
  return { calls, buckets };
}

test.after(() => {
  __setPoolForTests(null);
  if (ORIGINAL_DATABASE_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = ORIGINAL_DATABASE_URL;
});

test('shared rate limiter uses hashed keys and returns bounded retry information', async () => {
  const db = useDatabase();
  const now = new Date('2026-10-15T12:00:00.000Z');
  for (let i = 0; i < 2; i++) {
    const result = await checkSharedRateLimit('account:private@example.test', { windowMs: 60_000, limit: 2, now });
    assert.equal(result.allowed, true);
    assert.equal(result.remaining, 1 - i);
  }
  const blocked = await checkSharedRateLimit('account:private@example.test', { windowMs: 60_000, limit: 2, now });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.equal(blocked.retryAfterSeconds, 60);
  assert.equal(db.buckets.has(sha256Hex('account:private@example.test')), true);
  assert.equal(JSON.stringify(db.calls).includes('private@example.test'), false, 'raw email must not be persisted in SQL parameters');
  assert.ok(db.calls.some((call) => call.text.includes('ON CONFLICT (bucket_key) DO UPDATE')));
});

test('shared rate limiter resets only the requested bucket', async () => {
  const db = useDatabase();
  const now = new Date('2026-10-15T12:00:00.000Z');
  await checkSharedRateLimit('account:first@example.test', { limit: 5, now });
  await checkSharedRateLimit('account:second@example.test', { limit: 5, now });
  await resetSharedRateLimit('account:first@example.test');
  assert.equal(db.buckets.has(sha256Hex('account:first@example.test')), false);
  assert.equal(db.buckets.has(sha256Hex('account:second@example.test')), true);
});

test('rate-limit SQL expires buckets and atomically resets an elapsed window', async () => {
  const db = useDatabase();
  await checkSharedRateLimit('account:window@example.test', { windowMs: 900_000, limit: 20 });
  const insert = db.calls.find((call) => call.text.includes('INSERT INTO shared_rate_limit_buckets'));
  assert.match(insert.text, /window_started_at <= \$2::timestamptz - \(\$3::bigint \* interval '1 millisecond'\)/);
  assert.match(insert.text, /expires_at/);
  assert.deepEqual(insert.values, [sha256Hex('account:window@example.test'), insert.values[1], 900_000]);
});
