// Pure Audit Inbox logic: validation, retention maths and the purge statement.
//
// This module has NO database import so it can be unit-tested without a live
// Postgres instance. Every SQL string it exposes uses $1/$2 placeholders only.

/** Default retention for audit requests, in days. */
export const AUDIT_RETENTION_DAYS_DEFAULT = 89;

/** Hard bounds so a bad env var cannot disable or explode retention. */
export const AUDIT_RETENTION_DAYS_MIN = 1;
export const AUDIT_RETENTION_DAYS_MAX = 3_650;

export const AUDIT_STATUSES = ['new', 'in_progress', 'closed', 'spam'];

export const AUDIT_STATUS_LABELS = {
  new: 'New',
  in_progress: 'In progress',
  closed: 'Closed',
  spam: 'Spam',
};

/** Which status transitions the owner may make. Terminal states stay terminal. */
export const AUDIT_STATUS_TRANSITIONS = {
  new: ['in_progress', 'closed', 'spam'],
  in_progress: ['closed', 'spam', 'new'],
  closed: ['new', 'in_progress'],
  spam: [],
};

const FIELD_LIMITS = {
  name: 120,
  business: 160,
  email: 254,
  service: 120,
  message: 3_000,
};

/** UUIDv4 shape (any version nibble accepted; we only need a safe identifier). */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanText(value, maxLength) {
  if (value == null) return '';
  const text = String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  return text.slice(0, maxLength);
}

export function isAuditRequestId(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

/**
 * Reads the configured retention window, clamping to safe bounds.
 *
 * A missing, blank or non-numeric value falls back to 89 days rather than
 * disabling retention, so a typo can never silently retain data forever.
 */
export function retentionDaysFromEnv(rawValue) {
  if (rawValue === undefined || rawValue === null || String(rawValue).trim() === '') {
    return AUDIT_RETENTION_DAYS_DEFAULT;
  }
  const parsed = Number.parseInt(String(rawValue).trim(), 10);
  if (!Number.isFinite(parsed)) return AUDIT_RETENTION_DAYS_DEFAULT;
  return Math.min(AUDIT_RETENTION_DAYS_MAX, Math.max(AUDIT_RETENTION_DAYS_MIN, parsed));
}

/** Expiry timestamp for a request created at `createdAt` (Date or ISO string). */
export function retentionExpiryFor(createdAt, retentionDays = AUDIT_RETENTION_DAYS_DEFAULT, now = null) {
  const base = createdAt instanceof Date ? createdAt : new Date(createdAt ?? (now instanceof Date ? now : new Date()));
  const safeBase = Number.isNaN(base.getTime()) ? (now instanceof Date ? now : new Date()) : base;
  const days = Number.isFinite(retentionDays)
    ? Math.min(AUDIT_RETENTION_DAYS_MAX, Math.max(AUDIT_RETENTION_DAYS_MIN, Math.trunc(retentionDays)))
    : AUDIT_RETENTION_DAYS_DEFAULT;
  return new Date(safeBase.getTime() + days * 24 * 60 * 60 * 1000);
}

export function isPastRetention(expiresAt, now = new Date()) {
  if (!expiresAt) return false;
  const expiry = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  if (Number.isNaN(expiry.getTime())) return false;
  return expiry.getTime() <= now.getTime();
}

/** Whole days until expiry; 0 once expired or unparseable-but-present. */
export function daysUntilRetention(expiresAt, now = new Date()) {
  if (!expiresAt) return null;
  const expiry = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  if (Number.isNaN(expiry.getTime())) return null;
  const ms = expiry.getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

/**
 * Validates an inbound audit request.
 *
 * Returns { valid, errors, values }. `values` always contains trimmed,
 * length-capped strings so callers can pass them straight to a bound query.
 */
export function validateAuditRequest(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const values = {
    name: cleanText(source.name, FIELD_LIMITS.name),
    business: cleanText(source.business, FIELD_LIMITS.business),
    email: cleanText(source.email, FIELD_LIMITS.email),
    service: cleanText(source.service, FIELD_LIMITS.service),
    message: cleanText(source.message, FIELD_LIMITS.message),
  };
  const errors = {};
  if (!values.name) errors.name = 'Enter your name.';
  if (!values.business) errors.business = 'Enter your business name.';
  if (!values.email) errors.email = 'Enter an email address so we can reply.';
  else if (values.email.length > FIELD_LIMITS.email || !EMAIL_PATTERN.test(values.email)) {
    errors.email = 'Enter a valid email address.';
  }
  if (!values.message) errors.message = 'Tell us what you would like to improve.';
  return { valid: Object.keys(errors).length === 0, errors, values };
}

/**
 * The retention purge, as a parameterized statement.
 *
 * `DELETE` is hard deletion: audit requests are short-lived enquiry records and
 * the policy is to remove them, not archive them. The statement is returned as
 * data so tests can assert it is parameterized without touching a database.
 */
export function auditRetentionPurgeStatement(now = new Date()) {
  return {
    text: 'DELETE FROM audit_requests WHERE retention_expires_at < $1',
    values: [now instanceof Date ? now.toISOString() : new Date(now).toISOString()],
  };
}

/** Human-readable summary of the retention policy, for UI and docs. */
export function auditRetentionSummary(retentionDays = AUDIT_RETENTION_DAYS_DEFAULT) {
  const days = retentionDaysFromEnv(retentionDays);
  return {
    retentionDays: days,
    statement: `Audit requests are scheduled for deletion ${days} days after they are received.`,
  };
}
