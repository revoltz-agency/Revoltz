// Owner authentication for the Audit Inbox.
//
// Design (per the approved Stage 2 requirement):
//   * Server-side sessions in Postgres. The browser only ever holds an opaque
//     random token inside an HttpOnly cookie; it cannot read it with JavaScript.
//   * The session cookie is HttpOnly, Secure in production, SameSite=Strict,
//     Path=/, and carries a Max-Age equal to the idle TTL.
//   * Expiry is two-layered: a short idle lifetime that renews on use, and an
//     absolute ceiling that never renews.
//   * Logout performs server-side revocation, not just cookie deletion.
//   * State-changing requests must pass an Origin allowlist check AND a
//     double-submit CSRF token bound to the session row.
//   * Password and token comparisons are timing-safe.
//
// Not implemented (deliberate limitations, reported in docs/AUDIT_INBOX.md):
// accounts, roles, MFA, password rotation UI, and any audit trail of owner
// actions. There is exactly one operator credential.

import crypto from 'node:crypto';

import { ensureSchema, queryDatabase } from './db.js';
import {
  isSecureRequest,
  originAllowed,
  randomToken,
  readCookie,
  serializeCookie,
  sha256Hex,
  timingSafeEqualStrings,
} from './security.js';

export const SESSION_COOKIE = 'agencyos_audit_session';
export const CSRF_COOKIE = 'agencyos_audit_csrf';

const SCRYPT_PARAMS = { N: 16_384, r: 8, p: 1, keylen: 64, maxmem: 64 * 1024 * 1024 };
const HASH_PREFIX = 'scrypt';

const DEFAULT_IDLE_MINUTES = 480; // 8 hours
const DEFAULT_ABSOLUTE_MINUTES = 1_440; // 24 hours
export const MIN_PASSWORD_LENGTH = 12;

function minutesFromEnv(name, fallback) {
  const parsed = Number.parseInt(String(process.env[name] || '').trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export function sessionIdleMs() {
  return minutesFromEnv('AUDIT_SESSION_IDLE_MINUTES', DEFAULT_IDLE_MINUTES) * 60_000;
}

export function sessionAbsoluteMs() {
  return minutesFromEnv('AUDIT_SESSION_ABSOLUTE_MINUTES', DEFAULT_ABSOLUTE_MINUTES) * 60_000;
}

/** Comma-separated allowlist from AUDIT_ALLOWED_ORIGINS (e.g. https://app.example.com). */
export function allowedOrigins() {
  return String(process.env.AUDIT_ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

/** True only when a well-formed owner password hash is configured. */
export function isOwnerAuthConfigured() {
  return Boolean(parseConfiguredHash());
}

function parseConfiguredHash() {
  const raw = String(process.env.AUDIT_OWNER_PASSWORD_HASH || '').trim();
  if (!raw) return null;
  // Expected: scrypt$<saltHex>$<hashHex>
  const parts = raw.split('$');
  if (parts.length !== 3 || parts[0] !== HASH_PREFIX) return null;
  const [, saltHex, hashHex] = parts;
  if (!/^[0-9a-f]+$/i.test(saltHex) || !/^[0-9a-f]+$/i.test(hashHex)) return null;
  return { saltHex, hashHex };
}

/**
 * Derives a storable scrypt hash for a password.
 *
 * Exported for scripts/hash-audit-password.mjs only; the server never calls it
 * with a user-supplied password at runtime except through verifyOwnerPassword.
 */
export function hashOwnerPassword(password, salt = crypto.randomBytes(16)) {
  const derived = crypto.scryptSync(String(password), salt, SCRYPT_PARAMS.keylen, {
    N: SCRYPT_PARAMS.N,
    r: SCRYPT_PARAMS.r,
    p: SCRYPT_PARAMS.p,
    maxmem: SCRYPT_PARAMS.maxmem,
  });
  return `${HASH_PREFIX}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

/** Timing-safe verification against AUDIT_OWNER_PASSWORD_HASH. */
export function verifyOwnerPassword(password) {
  const configured = parseConfiguredHash();
  if (!configured) return false;
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) return false;
  try {
    const derived = crypto.scryptSync(password, Buffer.from(configured.saltHex, 'hex'), configured.hashHex.length / 2, {
      N: SCRYPT_PARAMS.N,
      r: SCRYPT_PARAMS.r,
      p: SCRYPT_PARAMS.p,
      maxmem: SCRYPT_PARAMS.maxmem,
    });
    return timingSafeEqualStrings(derived.toString('hex'), configured.hashHex);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

/**
 * Creates a session row and returns the values the route needs to set cookies.
 *
 * The raw token is returned exactly once; only its SHA-256 digest is persisted.
 */
export async function createOwnerSession({ now = new Date() } = {}) {
  await ensureSchema();
  const token = randomToken(32);
  const csrfToken = randomToken(24);
  const idleMs = sessionIdleMs();
  const absoluteMs = Math.max(sessionAbsoluteMs(), idleMs);
  const expiresAt = new Date(now.getTime() + idleMs);
  const absoluteExpiresAt = new Date(now.getTime() + absoluteMs);
  await queryDatabase(
    `INSERT INTO audit_sessions
       (token_hash, csrf_hash, created_at, expires_at, absolute_expires_at, last_used_at)
     VALUES ($1, $2, $3, $4, $5, $3)`,
    [
      sha256Hex(token),
      sha256Hex(csrfToken),
      now.toISOString(),
      expiresAt.toISOString(),
      absoluteExpiresAt.toISOString(),
    ],
  );
  return { token, csrfToken, expiresAt, absoluteExpiresAt };
}

/**
 * Resolves the session for a request, or null when unauthenticated/expired.
 *
 * Renews the idle expiry when it is used, never past the absolute ceiling. The
 * id and last_used_at are refreshed in one UPDATE so a stolen-but-revoked
 * session cannot be silently resurrected.
 */
export async function resolveOwnerSession(req, { now = new Date(), renew = true } = {}) {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return null;
  await ensureSchema();
  const result = await queryDatabase(
    `SELECT id, token_hash, csrf_hash, created_at, expires_at, absolute_expires_at
     FROM audit_sessions
     WHERE token_hash = $1 AND revoked_at IS NULL`,
    [sha256Hex(token)],
  );
  const row = result.rows[0];
  if (!row) return null;

  const expiresAt = new Date(row.expires_at);
  const absoluteExpiresAt = new Date(row.absolute_expires_at);
  if (!(expiresAt.getTime() > now.getTime())) return null;
  if (!(absoluteExpiresAt.getTime() > now.getTime())) return null;

  if (renew) {
    const renewedIdle = new Date(Math.min(now.getTime() + sessionIdleMs(), absoluteExpiresAt.getTime()));
    await queryDatabase(
      'UPDATE audit_sessions SET last_used_at = $2, expires_at = $3 WHERE id = $1',
      [row.id, now.toISOString(), renewedIdle.toISOString()],
    );
  }

  return {
    id: row.id,
    csrfHash: row.csrf_hash,
    expiresAt: expiresAt.toISOString(),
    absoluteExpiresAt: absoluteExpiresAt.toISOString(),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

/** Server-side revocation. Returns true when a live row was revoked. */
export async function revokeOwnerSession(req, { now = new Date() } = {}) {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return false;
  await ensureSchema();
  const result = await queryDatabase(
    'UPDATE audit_sessions SET revoked_at = $2 WHERE token_hash = $1 AND revoked_at IS NULL',
    [sha256Hex(token), now.toISOString()],
  );
  return Number(result.rowCount) > 0;
}

/** Revokes every live session (used by logout-all and credential rotation). */
export async function revokeAllOwnerSessions({ now = new Date() } = {}) {
  await ensureSchema();
  const result = await queryDatabase(
    'UPDATE audit_sessions SET revoked_at = $1 WHERE revoked_at IS NULL',
    [now.toISOString()],
  );
  return Number(result.rowCount) || 0;
}

// ---------------------------------------------------------------------------
// Cookie helpers
// ---------------------------------------------------------------------------

export function buildSessionCookie(token, req, maxAgeSeconds) {
  return serializeCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isSecureRequest(req),
    sameSite: 'strict',
    path: '/',
    maxAge: maxAgeSeconds,
  });
}

/** Readable by design: the SPA must echo this value in the X-Audit-CSRF header. */
export function buildCsrfCookie(csrfToken, req, maxAgeSeconds) {
  return serializeCookie(CSRF_COOKIE, csrfToken, {
    httpOnly: false,
    secure: isSecureRequest(req),
    sameSite: 'strict',
    path: '/',
    maxAge: maxAgeSeconds,
  });
}

export function buildClearCookies(req) {
  const secure = isSecureRequest(req);
  return [
    serializeCookie(SESSION_COOKIE, '', { httpOnly: true, secure, sameSite: 'strict', path: '/', maxAge: 0 }),
    serializeCookie(CSRF_COOKIE, '', { httpOnly: false, secure, sameSite: 'strict', path: '/', maxAge: 0 }),
  ];
}

// ---------------------------------------------------------------------------
// Request guards
// ---------------------------------------------------------------------------

/**
 * Origin check for state-changing browser requests.
 *
 * Fails closed: when AUDIT_ALLOWED_ORIGINS is empty every cross-origin write is
 * rejected, and a request with no Origin header is treated as same-origin
 * (non-browser clients such as curl).
 */
export function passesOriginCheck(req) {
  return originAllowed(req, allowedOrigins(), { allowMissing: true });
}

/**
 * Double-submit CSRF check.
 *
 * Compares the X-Audit-CSRF header against the readable CSRF cookie, then
 * verifies the cookie value against the hash bound to the session row. Both
 * comparisons are timing-safe.
 */
export function passesCsrfCheck(req, session) {
  if (!session) return false;
  const header = String(req?.headers?.['x-audit-csrf'] || '').trim();
  const cookie = readCookie(req, CSRF_COOKIE);
  if (!header || !cookie) return false;
  if (!timingSafeEqualStrings(header, cookie)) return false;
  return timingSafeEqualStrings(sha256Hex(cookie), session.csrfHash);
}

/** Reads the raw CSRF cookie value so the SPA can be told what to echo back. */
export function csrfCookieValue(req) {
  return readCookie(req, CSRF_COOKIE);
}
