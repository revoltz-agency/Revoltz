import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { closeDatabase, __setPoolForTests } from '../server/db.js';
import { checkSharedRateLimit, resetSharedRateLimit } from '../server/sharedRateLimit.js';

const TEST_DATABASE_URL = String(process.env.AGENCYOS_TEST_DATABASE_URL || '').trim();
const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;

test('PostgreSQL rate limiter atomically coordinates concurrent hits', { skip: !TEST_DATABASE_URL }, async () => {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  __setPoolForTests(null);
  const key = `integration-test:${randomUUID()}`;
  try {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => checkSharedRateLimit(key, {
        windowMs: 60_000,
        limit: 3,
      })),
    );

    assert.equal(results.filter((result) => result.allowed).length, 3);
    assert.equal(results.filter((result) => !result.allowed).length, 2);
    assert.deepEqual(
      results.map((result) => result.remaining).sort((a, b) => a - b),
      [0, 0, 0, 1, 2],
    );
    assert.ok(results.filter((result) => !result.allowed).every((result) => result.retryAfterSeconds > 0));
  } finally {
    await resetSharedRateLimit(key).catch(() => {});
    await closeDatabase();
    __setPoolForTests(null);
    if (ORIGINAL_DATABASE_URL === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = ORIGINAL_DATABASE_URL;
  }
});
