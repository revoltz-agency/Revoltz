// PostgreSQL access for the Audit Inbox.
//
// Design constraints:
//   * Nothing here runs at import time. The pool is created on first use, so the
//     server still boots (and every pre-existing route still works) when
//     DATABASE_URL is not configured.
//   * Every query goes through queryDatabase() with $1/$2 placeholders. Callers
//     must never interpolate user input into SQL text.
//   * Schema creation is idempotent and non-destructive (CREATE TABLE IF NOT
//     EXISTS / CREATE INDEX IF NOT EXISTS only). There is no DROP and no
//     migration runner.

import pg from 'pg';

let pool = null;
let schemaReady = null;

/** True when DATABASE_URL holds a non-blank value. */
export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim());
}

/** Exported for tests: the TLS decision is easy to get silently wrong. */
export function sslOptionFor(connectionString) {
  const configured = String(process.env.DATABASE_SSL || '').trim().toLowerCase();
  if (configured === 'off' || configured === 'false' || configured === 'disable') return false;
  if (configured === 'require' || configured === 'on' || configured === 'true') {
    return { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' };
  }
  // Unset: require TLS for remote hosts (Neon and every other managed provider
  // need it) but not for a loopback development database.
  let host = '';
  try {
    host = new URL(connectionString).hostname.toLowerCase();
  } catch {
    host = '';
  }
  const isLoopback = ['localhost', '127.0.0.1', '::1', ''].includes(host);
  if (isLoopback) return false;
  return { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' };
}

/** Returns the shared pool, creating it on first call. Throws when unconfigured. */
export function getPool() {
  if (!isDatabaseConfigured()) {
    const error = new Error('DATABASE_URL is not configured.');
    error.statusCode = 503;
    throw error;
  }
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL.trim();
  pool = new pg.Pool({
    connectionString,
    ssl: sslOptionFor(connectionString),
    max: Math.min(10, Math.max(1, Number.parseInt(process.env.DATABASE_POOL_MAX || '5', 10) || 5)),
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  });
  // Never let an idle-client error take the process down.
  pool.on('error', (error) => {
    console.error('[db] idle client error:', error?.message || error);
  });
  return pool;
}

/** Runs a parameterized query. `values` are bound by the driver, never inlined. */
export async function queryDatabase(text, values = []) {
  return getPool().query(text, values);
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

// Audit requests are stored entirely separately from prospect CRM data, which
// lives in the operator's browser localStorage and never reaches the server.
const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS audit_requests (
     id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     name                  text        NOT NULL,
     business              text        NOT NULL,
     email                 text        NOT NULL,
     service               text        NOT NULL DEFAULT '',
     message               text        NOT NULL,
     status                text        NOT NULL DEFAULT 'new',
     created_at            timestamptz NOT NULL DEFAULT now(),
     updated_at            timestamptz NOT NULL DEFAULT now(),
     retention_expires_at  timestamptz NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS audit_requests_retention_idx
     ON audit_requests (retention_expires_at)`,
  `CREATE INDEX IF NOT EXISTS audit_requests_created_idx
     ON audit_requests (created_at DESC)`,
  // Owner sessions. Only the SHA-256 digests of the session token and of the
  // CSRF token are stored, so a database leak does not hand over usable
  // credentials. `expires_at` is the idle expiry (renewed on use);
  // `absolute_expires_at` is the hard ceiling a session can never outlive.
  `CREATE TABLE IF NOT EXISTS audit_sessions (
     id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     token_hash          text        NOT NULL UNIQUE,
     csrf_hash           text        NOT NULL,
     created_at          timestamptz NOT NULL DEFAULT now(),
     expires_at          timestamptz NOT NULL,
     absolute_expires_at timestamptz NOT NULL,
     revoked_at          timestamptz,
     last_used_at        timestamptz
   )`,
  `CREATE INDEX IF NOT EXISTS audit_sessions_expires_idx
     ON audit_sessions (expires_at)`,
  `CREATE TABLE IF NOT EXISTS workspace_users (
     id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     name          text        NOT NULL,
     email         text        NOT NULL UNIQUE,
     password_hash text        NOT NULL,
     created_at    timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS workspace_sessions (
     id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id             uuid        NOT NULL REFERENCES workspace_users(id),
     token_hash          text        NOT NULL UNIQUE,
     csrf_hash           text        NOT NULL,
     created_at          timestamptz NOT NULL DEFAULT now(),
     expires_at          timestamptz NOT NULL,
     absolute_expires_at timestamptz NOT NULL,
     revoked_at          timestamptz,
     last_used_at        timestamptz
   )`,
  `CREATE INDEX IF NOT EXISTS workspace_sessions_user_idx ON workspace_sessions (user_id)`,
  `CREATE INDEX IF NOT EXISTS workspace_sessions_expires_idx ON workspace_sessions (expires_at)`,
  `CREATE TABLE IF NOT EXISTS workspace_data (
     user_id    uuid PRIMARY KEY REFERENCES workspace_users(id),
     state      jsonb       NOT NULL DEFAULT '{}'::jsonb,
     updated_at timestamptz NOT NULL DEFAULT now()
   )`,
  // SaaS foundation: a workspace owner receives an organization automatically.
  // This keeps current single-user accounts working while enabling future teams.
  `CREATE TABLE IF NOT EXISTS organizations (
     id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     name               text NOT NULL,
     owner_user_id      uuid NOT NULL UNIQUE REFERENCES workspace_users(id),
     created_at         timestamptz NOT NULL DEFAULT now(),
     updated_at         timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS organization_memberships (
     organization_id    uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
     user_id            uuid NOT NULL REFERENCES workspace_users(id) ON DELETE CASCADE,
     role               text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
     created_at         timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY (organization_id, user_id)
   )`,
  `CREATE INDEX IF NOT EXISTS organization_memberships_user_idx
     ON organization_memberships (user_id)`,
  // Module preferences are organization-scoped; server-side entitlements will
  // later determine which modules may be enabled for each subscription plan.
  `CREATE TABLE IF NOT EXISTS organization_modules (
     organization_id    uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
     module_key         text NOT NULL,
     enabled            boolean NOT NULL DEFAULT true,
     settings           jsonb NOT NULL DEFAULT '{}'::jsonb,
     updated_at         timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY (organization_id, module_key)
   )`,
  `CREATE TABLE IF NOT EXISTS organization_subscriptions (
     id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     organization_id            uuid NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
     plan_key                   text NOT NULL DEFAULT 'starter',
     status                     text NOT NULL DEFAULT 'inactive'
                                CHECK (status IN ('inactive', 'created', 'authenticated', 'active', 'pending', 'halted', 'cancelled', 'completed', 'expired', 'past_due')),
     razorpay_customer_id       text,
     razorpay_subscription_id   text UNIQUE,
     current_period_start       timestamptz,
     current_period_end         timestamptz,
     cancel_at_period_end       boolean NOT NULL DEFAULT false,
     created_at                 timestamptz NOT NULL DEFAULT now(),
     updated_at                 timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS organization_subscriptions_status_idx
     ON organization_subscriptions (status)`,
  // Webhook event IDs provide an idempotency boundary: duplicate deliveries
  // must not apply the same subscription transition twice.
  `CREATE TABLE IF NOT EXISTS payment_webhook_events (
     event_id             text PRIMARY KEY,
     provider             text NOT NULL DEFAULT 'razorpay',
     event_type           text NOT NULL,
     payload              jsonb NOT NULL DEFAULT '{}'::jsonb,
     received_at          timestamptz NOT NULL DEFAULT now(),
     processed_at         timestamptz
   )`,
  // Non-destructive backfill for existing accounts. Existing data and sessions
  // remain untouched; every pre-existing user gets one owner organization.
  `INSERT INTO organizations (name, owner_user_id)
     SELECT left(name || '''s workspace', 200), id
     FROM workspace_users
     ON CONFLICT (owner_user_id) DO NOTHING`,
  `INSERT INTO organization_memberships (organization_id, user_id, role)
     SELECT id, owner_user_id, 'owner'
     FROM organizations
     ON CONFLICT (organization_id, user_id) DO NOTHING`,
  `INSERT INTO organization_subscriptions (organization_id, plan_key, status)
     SELECT id, 'starter', 'inactive'
     FROM organizations
     ON CONFLICT (organization_id) DO NOTHING`,
];

/**
 * Creates the Audit Inbox tables if they are missing.
 *
 * Memoized per process: repeated calls are free. Safe to run concurrently.
 * Requires gen_random_uuid(), which is built into PostgreSQL 13+.
 */
export function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      for (const statement of SCHEMA_STATEMENTS) {
        await queryDatabase(statement);
      }
      return true;
    })().catch((error) => {
      // Allow a later request to retry after a transient failure.
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

/**
 * Test seam: swaps the pool for a stub so the SQL layer can be asserted
 * without a live PostgreSQL instance. Never called by the application.
 */
export function __setPoolForTests(next) {
  pool = next || null;
  schemaReady = null;
}

/** Closes the pool. Used by graceful shutdown and tests. */
export async function closeDatabase() {
  if (!pool) return;
  const existing = pool;
  pool = null;
  schemaReady = null;
  await existing.end().catch(() => {});
}
