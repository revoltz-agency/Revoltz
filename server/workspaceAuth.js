// Multi-user workspace authentication and cloud workspace persistence.
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { ensureSchema, ensureWorkspaceOrganization, queryDatabase } from './db.js';
import { isSecureRequest, randomToken, readCookie, serializeCookie, sha256Hex, timingSafeEqualStrings } from './security.js';

const scrypt = promisify(crypto.scrypt);
export const WORKSPACE_SESSION_COOKIE = 'agencyos_workspace_session';
export const WORKSPACE_CSRF_COOKIE = 'agencyos_workspace_csrf';
export const MIN_WORKSPACE_PASSWORD_LENGTH = 12;
const IDLE_MS = 14 * 24 * 60 * 60 * 1000;
const ABSOLUTE_MS = 30 * 24 * 60 * 60 * 1000;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase().slice(0, 254) : '';
}
function validEmail(value) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
async function hashPassword(password, salt = crypto.randomBytes(16)) {
  const derived = await scrypt(password, salt, 64, SCRYPT_OPTIONS);
  return `scrypt$${salt.toString('hex')}$${Buffer.from(derived).toString('hex')}`;
}
async function verifyPassword(password, encoded) {
  const parts = String(encoded || '').split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt' || !/^[0-9a-f]{32}$/i.test(parts[1]) || !/^[0-9a-f]{128}$/i.test(parts[2])) return false;
  try {
    const derived = await scrypt(password, Buffer.from(parts[1], 'hex'), 64, SCRYPT_OPTIONS);
    return timingSafeEqualStrings(Buffer.from(derived).toString('hex'), parts[2]);
  } catch { return false; }
}
function safeUser(row) {
  return row ? { id: row.id, name: row.name, email: row.email, createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at } : null;
}
export async function registerWorkspaceUser({ name, email, password }) {
  await ensureSchema();
  const cleanName = typeof name === 'string' ? name.trim().slice(0, 100) : '';
  const cleanEmail = normalizeEmail(email);
  if (cleanName.length < 2) throw Object.assign(new Error('Enter your name (at least 2 characters).'), { statusCode: 400 });
  if (!validEmail(cleanEmail)) throw Object.assign(new Error('Enter a valid email address.'), { statusCode: 400 });
  if (typeof password !== 'string' || password.length < MIN_WORKSPACE_PASSWORD_LENGTH || password.length > 128) {
    throw Object.assign(new Error('Use a password between 12 and 128 characters.'), { statusCode: 400 });
  }
  const passwordHash = await hashPassword(password);
  let createdUserId = null;
  try {
    const result = await queryDatabase(
      'INSERT INTO workspace_users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email, created_at',
      [cleanName, cleanEmail, passwordHash],
    );
    const user = safeUser(result.rows[0]);
    createdUserId = user.id;
    await ensureWorkspaceOrganization(user.id, user.name);
    return user;
  } catch (error) {
    // Organization provisioning spans several queries. If it fails after the
    // user row was inserted, remove any partially-created organization first
    // (its dependent rows cascade), then remove the account so the email can
    // be used for a clean retry instead of leaving an unusable orphan.
    if (createdUserId) {
      try {
        await queryDatabase('DELETE FROM organizations WHERE owner_user_id = $1', [createdUserId]);
      } catch (cleanupError) {
        console.error('[workspace-auth] organization cleanup after registration failure:', cleanupError?.message || cleanupError);
      }
      try {
        await queryDatabase('DELETE FROM workspace_users WHERE id = $1', [createdUserId]);
      } catch (cleanupError) {
        console.error('[workspace-auth] account cleanup after registration failure:', cleanupError?.message || cleanupError);
      }
    }
    if (!createdUserId && error?.code === '23505') {
      throw Object.assign(new Error('An account with this email already exists. Sign in instead.'), { statusCode: 409 });
    }
    throw error;
  }
}
export async function authenticateWorkspaceUser({ email, password }) {
  await ensureSchema();
  const cleanEmail = normalizeEmail(email);
  if (!validEmail(cleanEmail) || typeof password !== 'string' || !password || password.length > 128) return null;
  const result = await queryDatabase(
    'SELECT id, name, email, password_hash, created_at FROM workspace_users WHERE email = $1',
    [cleanEmail],
  );
  const row = result.rows[0];
  // Perform a same-cost derivation for unknown addresses to reduce account enumeration timing differences.
  const valid = row ? await verifyPassword(password, row.password_hash) : await hashPassword(password).then(() => false);
  if (!valid) return null;
  // Repair any account created before organization initialization was added.
  await ensureWorkspaceOrganization(row.id, row.name);
  return safeUser(row);
}
export async function createWorkspaceSession(userId, now = new Date()) {
  await ensureSchema();
  const token = randomToken(32);
  const csrfToken = randomToken(24);
  const expiresAt = new Date(now.getTime() + IDLE_MS);
  const absoluteExpiresAt = new Date(now.getTime() + ABSOLUTE_MS);
  await queryDatabase(
    'INSERT INTO workspace_sessions (user_id, token_hash, csrf_hash, expires_at, absolute_expires_at, last_used_at) VALUES ($1, $2, $3, $4, $5, $6)',
    [userId, sha256Hex(token), sha256Hex(csrfToken), expiresAt.toISOString(), absoluteExpiresAt.toISOString(), now.toISOString()],
  );
  return { token, csrfToken, expiresAt, absoluteExpiresAt };
}
export async function resolveWorkspaceSession(req, { renew = true, now = new Date() } = {}) {
  const token = readCookie(req, WORKSPACE_SESSION_COOKIE);
  if (!token) return null;
  await ensureSchema();
  const result = await queryDatabase(
    `SELECT s.id AS session_id, s.csrf_hash, s.expires_at, s.absolute_expires_at,
            u.id, u.name, u.email, u.created_at
     FROM workspace_sessions s JOIN workspace_users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.revoked_at IS NULL`,
    [sha256Hex(token)],
  );
  const row = result.rows[0];
  if (!row || new Date(row.expires_at).getTime() <= now.getTime() || new Date(row.absolute_expires_at).getTime() <= now.getTime()) return null;
  if (renew) {
    const expiresAt = new Date(Math.min(now.getTime() + IDLE_MS, new Date(row.absolute_expires_at).getTime()));
    await queryDatabase('UPDATE workspace_sessions SET last_used_at = $2, expires_at = $3 WHERE id = $1 AND revoked_at IS NULL', [row.session_id, now.toISOString(), expiresAt.toISOString()]);
  }
  return { user: safeUser(row), csrfHash: row.csrf_hash, sessionId: row.session_id };
}
export async function revokeWorkspaceSession(req, now = new Date()) {
  const token = readCookie(req, WORKSPACE_SESSION_COOKIE);
  if (!token) return false;
  await ensureSchema();
  const result = await queryDatabase('UPDATE workspace_sessions SET revoked_at = $2 WHERE token_hash = $1 AND revoked_at IS NULL', [sha256Hex(token), now.toISOString()]);
  return Number(result.rowCount) > 0;
}
export function workspaceSessionCookie(token, req, maxAge = IDLE_MS / 1000) {
  return serializeCookie(WORKSPACE_SESSION_COOKIE, token, { httpOnly: true, secure: isSecureRequest(req), sameSite: 'strict', path: '/', maxAge });
}
export function workspaceCsrfCookie(token, req, maxAge = IDLE_MS / 1000) {
  return serializeCookie(WORKSPACE_CSRF_COOKIE, token, { httpOnly: false, secure: isSecureRequest(req), sameSite: 'strict', path: '/', maxAge });
}
export function clearWorkspaceCookies(req) {
  const secure = isSecureRequest(req);
  return [
    serializeCookie(WORKSPACE_SESSION_COOKIE, '', { httpOnly: true, secure, sameSite: 'strict', path: '/', maxAge: 0 }),
    serializeCookie(WORKSPACE_CSRF_COOKIE, '', { httpOnly: false, secure, sameSite: 'strict', path: '/', maxAge: 0 }),
  ];
}
export function workspaceOriginAllowed(req) {
  const origin = String(req.headers.origin || '').trim();
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    const host = String(req.headers.host || '').toLowerCase();
    const forwarded = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
    const protocol = req.secure || forwarded === 'https' ? 'https:' : 'http:';
    return parsed.host.toLowerCase() === host && parsed.protocol === protocol;
  } catch { return false; }
}
export function workspaceCsrfAllowed(req, session) {
  const header = String(req.headers['x-workspace-csrf'] || '').trim();
  const cookie = readCookie(req, WORKSPACE_CSRF_COOKIE);
  return Boolean(session && header && cookie && timingSafeEqualStrings(header, cookie) && timingSafeEqualStrings(sha256Hex(cookie), session.csrfHash));
}
async function resolveWorkspaceOrganizationId(userId) {
  const result = await queryDatabase(
    `SELECT organization_id
     FROM organization_memberships
     WHERE user_id = $1
     ORDER BY CASE WHEN role = 'owner' THEN 0 ELSE 1 END, created_at ASC
     LIMIT 1`,
    [userId],
  );
  const organizationId = result.rows[0]?.organization_id;
  if (!organizationId) {
    throw Object.assign(new Error('No organization is available for this workspace account.'), { statusCode: 403 });
  }
  return organizationId;
}

export async function readWorkspaceState(userId) {
  await ensureSchema();
  const result = await queryDatabase(
    `SELECT d.state, d.updated_at
     FROM organization_workspace_data d
     JOIN organization_memberships m ON m.organization_id = d.organization_id
     WHERE m.user_id = $1
     ORDER BY CASE WHEN m.role = 'owner' THEN 0 ELSE 1 END, m.created_at ASC
     LIMIT 1`,
    [userId],
  );
  return { state: result.rows[0]?.state && typeof result.rows[0].state === 'object' ? result.rows[0].state : {}, updatedAt: result.rows[0]?.updated_at || null };
}

export async function writeWorkspaceState(userId, state) {
  await ensureSchema();
  const organizationId = await resolveWorkspaceOrganizationId(userId);
  await queryDatabase(
    `INSERT INTO organization_workspace_data (organization_id, state, updated_at) VALUES ($1, $2::jsonb, now())
     ON CONFLICT (organization_id) DO UPDATE SET state = EXCLUDED.state, updated_at = now()`,
    [organizationId, JSON.stringify(state)],
  );
  return { saved: true };
}
