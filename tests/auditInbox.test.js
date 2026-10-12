import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AUDIT_RETENTION_DAYS_DEFAULT,
  AUDIT_RETENTION_DAYS_MAX,
  AUDIT_RETENTION_DAYS_MIN,
  AUDIT_STATUS_TRANSITIONS,
  AUDIT_STATUSES,
  auditRetentionPurgeStatement,
  auditRetentionSummary,
  daysUntilRetention,
  isAuditRequestId,
  isPastRetention,
  retentionDaysFromEnv,
  retentionExpiryFor,
  validateAuditRequest,
} from '../server/auditInbox.js';

// ---------------------------------------------------------------------------
// Additional requirement 2: validate every incoming field
// ---------------------------------------------------------------------------

test('the default retention window is 89 days', () => {
  assert.equal(AUDIT_RETENTION_DAYS_DEFAULT, 89);
  assert.equal(retentionDaysFromEnv(undefined), 89);
  assert.equal(retentionDaysFromEnv(''), 89);
  assert.equal(retentionDaysFromEnv('   '), 89);
});

test('a malformed retention setting falls back to 89 days instead of disabling retention', () => {
  assert.equal(retentionDaysFromEnv('not-a-number'), 89);
  assert.equal(retentionDaysFromEnv('0'), AUDIT_RETENTION_DAYS_MIN);
  assert.equal(retentionDaysFromEnv('-30'), AUDIT_RETENTION_DAYS_MIN);
  assert.equal(retentionDaysFromEnv('999999'), AUDIT_RETENTION_DAYS_MAX);
  assert.equal(retentionDaysFromEnv('89'), 89);
  assert.equal(retentionDaysFromEnv('30'), 30);
});

test('validateAuditRequest accepts a complete enquiry and trims + caps every field', () => {
  const result = validateAuditRequest({
    name: '  Priya  ',
    business: '  North Star Cafe  ',
    email: ' priya@northstar.example ',
    service: ' Website design & development ',
    message: '  We get traffic but no enquiries.  ',
  });
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, {});
  assert.equal(result.values.name, 'Priya');
  assert.equal(result.values.business, 'North Star Cafe');
  assert.equal(result.values.email, 'priya@northstar.example');
  assert.equal(result.values.service, 'Website design & development');
  assert.equal(result.values.message, 'We get traffic but no enquiries.');
});

test('validateAuditRequest rejects blank required fields', () => {
  const result = validateAuditRequest({ name: '', business: '', email: '', message: '' });
  assert.equal(result.valid, false);
  assert.ok(result.errors.name);
  assert.ok(result.errors.business);
  assert.ok(result.errors.email);
  assert.ok(result.errors.message);
  // service is optional
  assert.equal(result.errors.service, undefined);
});

test('validateAuditRequest rejects malformed email addresses', () => {
  for (const email of ['nope', 'nope@', '@example.com', 'a b@example.com', 'a@example']) {
    const result = validateAuditRequest({
      name: 'A', business: 'B', email, message: 'M',
    });
    assert.equal(result.valid, false, email);
    assert.match(result.errors.email, /valid email/i, email);
  }
});

test('validateAuditRequest caps over-long fields instead of rejecting the row', () => {
  const result = validateAuditRequest({
    name: 'x'.repeat(500),
    business: 'y'.repeat(500),
    email: `${'z'.repeat(200)}@example.com`,
    service: 's'.repeat(500),
    message: 'm'.repeat(10_000),
  });
  assert.ok(result.values.name.length <= 120);
  assert.ok(result.values.business.length <= 160);
  assert.ok(result.values.email.length <= 254);
  assert.ok(result.values.service.length <= 120);
  assert.ok(result.values.message.length <= 3_000);
  // The capped email is still syntactically valid, so the row is accepted.
  assert.equal(result.errors.email, undefined);
});

test('validateAuditRequest is total against hostile input', () => {
  for (const input of [undefined, null, 0, 'text', [], { name: 1, email: {} }]) {
    const result = validateAuditRequest(input);
    assert.equal(typeof result.valid, 'boolean');
    assert.equal(typeof result.errors, 'object');
    assert.equal(typeof result.values.message, 'string');
  }
});

test('control characters are stripped from every field', () => {
  const result = validateAuditRequest({
    name: 'Pri\u0000ya', business: 'Cafe\u0007', email: 'p@example.com',
    service: 'Web\u001b[31m', message: 'Hello\u0000world',
  });
  assert.equal(result.values.name, 'Priya');
  assert.equal(result.values.business, 'Cafe');
  assert.equal(result.values.service, 'Web[31m');
  assert.equal(result.values.message, 'Helloworld');
});

// ---------------------------------------------------------------------------
// Additional requirement 2 + 3: id and status validation
// ---------------------------------------------------------------------------

test('audit request ids are validated as UUIDs', () => {
  assert.equal(isAuditRequestId('3f0c1e2a-4b5d-4c6e-8f90-1a2b3c4d5e6f'), true);
  assert.equal(isAuditRequestId('3F0C1E2A-4B5D-4C6E-8F90-1A2B3C4D5E6F'), true);
  for (const bad of ['', 'not-a-uuid', "1' OR '1'='1", '3f0c1e2a4b5d4c6e8f901a2b3c4d5e6f', null, undefined, 42, {}]) {
    assert.equal(isAuditRequestId(bad), false, String(bad));
  }
});

test('status values are a closed set and spam is terminal', () => {
  assert.deepEqual(AUDIT_STATUSES, ['new', 'in_progress', 'closed', 'spam']);
  assert.deepEqual(AUDIT_STATUS_TRANSITIONS.spam, []);
  for (const status of AUDIT_STATUS_TRANSITIONS.new) assert.ok(AUDIT_STATUSES.includes(status));
  // A closed request can be reopened, but spam cannot be.
  assert.ok(AUDIT_STATUS_TRANSITIONS.closed.includes('new'));
  assert.equal(AUDIT_STATUS_TRANSITIONS.spam.length, 0);
});

// ---------------------------------------------------------------------------
// Additional requirement 3: 89-day retention maths
// ---------------------------------------------------------------------------

const CREATED = new Date('2026-01-01T00:00:00.000Z');

test('retention expiry is created_at plus the retention window', () => {
  const expiry = retentionExpiryFor(CREATED, 89);
  assert.equal(expiry.toISOString(), '2026-03-31T00:00:00.000Z');
  assert.equal(retentionExpiryFor(CREATED, 1).toISOString(), '2026-01-02T00:00:00.000Z');
});

test('retention boundary is inclusive of the expiry instant at 89 days', () => {
  const expiry = retentionExpiryFor(CREATED, 89);

  // Day 88 -> retained.
  assert.equal(isPastRetention(expiry, new Date('2026-03-30T00:00:00.000Z')), false);
  // Exactly at expiry -> due for deletion (<= comparison).
  assert.equal(isPastRetention(expiry, new Date('2026-03-31T00:00:00.000Z')), true);
  // Day 90 -> due for deletion.
  assert.equal(isPastRetention(expiry, new Date('2026-04-01T00:00:00.000Z')), true);

  assert.equal(daysUntilRetention(expiry, new Date('2026-01-01T00:00:00.000Z')), 89);
  assert.equal(daysUntilRetention(expiry, new Date('2026-03-31T00:00:00.000Z')), 0);
  assert.equal(daysUntilRetention(null), null);
});

test('retention maths is clamped and total', () => {
  // A nonsense window cannot disable retention.
  const expiry = retentionExpiryFor(CREATED, Number.NaN);
  assert.equal(expiry.toISOString(), retentionExpiryFor(CREATED, 89).toISOString());
  // An unparseable created date falls back to `now` rather than throwing.
  const now = new Date('2026-05-05T00:00:00.000Z');
  assert.equal(retentionExpiryFor('not-a-date', 10, now).toISOString(), '2026-05-15T00:00:00.000Z');
  assert.equal(isPastRetention('garbage', now), false);
  assert.equal(isPastRetention(null), false);
});

test('the purge statement is parameterized and hard-deletes past-expiry rows', () => {
  const now = new Date('2026-06-01T00:00:00.000Z');
  const statement = auditRetentionPurgeStatement(now);
  // No interpolated value in the SQL text.
  assert.equal(statement.text.includes('2026-06-01'), false);
  assert.match(statement.text, /^\s*DELETE FROM audit_requests WHERE retention_expires_at < \$1\s*$/);
  assert.deepEqual(statement.values, ['2026-06-01T00:00:00.000Z']);
  // It is a hard delete, matching the documented policy.
  assert.match(statement.text, /DELETE FROM audit_requests/);
  assert.doesNotMatch(statement.text, /UPDATE|SET deleted_at/i);
});

test('the retention summary states the window plainly', () => {
  const summary = auditRetentionSummary(89);
  assert.equal(summary.retentionDays, 89);
  assert.match(summary.statement, /89 days/);
  assert.match(summary.statement, /deletion/i);
});
