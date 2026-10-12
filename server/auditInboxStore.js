// SQL layer for the Audit Inbox.
//
// Every statement uses bound parameters. Identifiers are fixed literals; no user
// input ever reaches the SQL text. Results are mapped to plain JSON-safe shapes
// so the transport layer cannot leak driver internals.

import { ensureSchema, queryDatabase } from './db.js';
import {
  AUDIT_STATUS_TRANSITIONS,
  AUDIT_STATUSES,
  auditRetentionPurgeStatement,
  isAuditRequestId,
  retentionDaysFromEnv,
  retentionExpiryFor,
} from './auditInbox.js';

const MAX_LIST_LIMIT = 200;

function toApi(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    business: row.business,
    email: row.email,
    service: row.service || '',
    message: row.message,
    status: row.status,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    retentionExpiresAt: row.retention_expires_at instanceof Date
      ? row.retention_expires_at.toISOString()
      : row.retention_expires_at,
  };
}

async function runEnsureSchema() {
  await ensureSchema();
}

/** Inserts a validated audit request and returns the stored row. */
export async function insertAuditRequest(values, { retentionDays, now = new Date() } = {}) {
  await runEnsureSchema();
  const days = retentionDaysFromEnv(retentionDays);
  const expiresAt = retentionExpiryFor(now, days, now);
  const result = await queryDatabase(
    `INSERT INTO audit_requests
       (name, business, email, service, message, status, created_at, updated_at, retention_expires_at)
     VALUES ($1, $2, $3, $4, $5, 'new', $6, $6, $7)
     RETURNING id, name, business, email, service, message, status,
               created_at, updated_at, retention_expires_at`,
    [
      values.name,
      values.business,
      values.email,
      values.service,
      values.message,
      now.toISOString(),
      expiresAt.toISOString(),
    ],
  );
  return toApi(result.rows[0]);
}

export async function listAuditRequests({ limit = 100 } = {}) {
  await runEnsureSchema();
  const safeLimit = Math.min(MAX_LIST_LIMIT, Math.max(1, Number.parseInt(limit, 10) || 100));
  const result = await queryDatabase(
    `SELECT id, name, business, email, service, message, status,
            created_at, updated_at, retention_expires_at
     FROM audit_requests
     ORDER BY created_at DESC
     LIMIT $1`,
    [safeLimit],
  );
  return result.rows.map(toApi);
}

export async function getAuditRequest(id) {
  if (!isAuditRequestId(id)) return null;
  await runEnsureSchema();
  const result = await queryDatabase(
    `SELECT id, name, business, email, service, message, status,
            created_at, updated_at, retention_expires_at
     FROM audit_requests WHERE id = $1`,
    [id],
  );
  return toApi(result.rows[0]);
}

/**
 * Moves a request to a new status.
 *
 * Returns the updated row, or null when the id is missing / the transition is
 * not permitted by AUDIT_STATUS_TRANSITIONS.
 */
export async function updateAuditRequestStatus(id, status, { now = new Date() } = {}) {
  if (!isAuditRequestId(id)) return null;
  if (!AUDIT_STATUSES.includes(status)) return null;
  await runEnsureSchema();
  const current = await getAuditRequest(id);
  if (!current) return null;
  const allowed = AUDIT_STATUS_TRANSITIONS[current.status] || [];
  if (current.status !== status && !allowed.includes(status)) return null;
  const result = await queryDatabase(
    `UPDATE audit_requests
     SET status = $2, updated_at = $3
     WHERE id = $1
     RETURNING id, name, business, email, service, message, status,
               created_at, updated_at, retention_expires_at`,
    [id, status, now.toISOString()],
  );
  return toApi(result.rows[0]);
}

export async function deleteAuditRequest(id) {
  if (!isAuditRequestId(id)) return false;
  await runEnsureSchema();
  const result = await queryDatabase('DELETE FROM audit_requests WHERE id = $1', [id]);
  return result.rowCount === 1;
}

/**
 * Hard-deletes every request past its retention expiry.
 *
 * This is the same statement the scheduled job runs. Calling it opportunistically
 * is defence-in-depth only — it is NOT evidence that a scheduled cleanup is
 * operational, because it only runs when someone happens to open the inbox.
 */
export async function purgeExpiredAuditRequests({ now = new Date() } = {}) {
  await runEnsureSchema();
  const statement = auditRetentionPurgeStatement(now);
  const result = await queryDatabase(statement.text, statement.values);
  return Number(result.rowCount) || 0;
}

export async function countAuditRequests() {
  await runEnsureSchema();
  const result = await queryDatabase('SELECT count(*)::int AS total FROM audit_requests');
  return Number(result.rows[0]?.total) || 0;
}

/** Count of rows already past their retention expiry (i.e. awaiting deletion). */
export async function countExpiredAuditRequests({ now = new Date() } = {}) {
  await runEnsureSchema();
  const result = await queryDatabase(
    'SELECT count(*)::int AS total FROM audit_requests WHERE retention_expires_at < $1',
    [now.toISOString()],
  );
  return Number(result.rows[0]?.total) || 0;
}
