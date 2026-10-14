import test from 'node:test';
import assert from 'node:assert/strict';
import { __setPoolForTests } from '../server/db.js';
import {
  WORKSPACE_CSRF_COOKIE,
  WORKSPACE_SESSION_COOKIE,
  authenticateWorkspaceUser,
  clearWorkspaceCookies,
  createWorkspaceSession,
  readWorkspaceState,
  registerWorkspaceUser,
  resolveWorkspaceSession,
  revokeWorkspaceSession,
  workspaceCsrfAllowed,
  workspaceCsrfCookie,
  workspaceSessionCookie,
  writeWorkspaceState,
} from '../server/workspaceAuth.js';
import { sha256Hex } from '../server/security.js';

const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;
const USER_ID = '3f0c1e2a-4b5d-4c6e-8f90-1a2b3c4d5e6f';

function workspaceDatabase() {
  const calls = [];
  const users = new Map();
  const sessions = new Map();
  const states = new Map();
  const organizationStates = new Map();
  const organizations = new Map();
  const pool = {
    calls,
    on() {},
    async end() {},
    async query(text, values = []) {
      calls.push({ text, values });
      if (/^\s*(CREATE (TABLE|INDEX) IF NOT EXISTS|ALTER TABLE organization_subscriptions)/i.test(text)) return { rows: [], rowCount: 0 };
      // Schema backfills are no-ops in this in-memory database; focused
      // organization helper queries below exercise per-user provisioning.
      if (/^\s*INSERT INTO organizations\s*\(name, owner_user_id\)\s*SELECT/i.test(text)) return { rows: [], rowCount: 0 };
      if (/^\s*INSERT INTO organization_memberships\s*\(organization_id, user_id, role\)\s*SELECT/i.test(text)) return { rows: [], rowCount: 0 };
      if (/^\s*INSERT INTO organization_subscriptions\s*\(organization_id, plan_key, status\)\s*SELECT/i.test(text)) return { rows: [], rowCount: 0 };
      if (/^\s*INSERT INTO organization_modules\s*\(organization_id, module_key, enabled\)\s*SELECT o\.id/i.test(text)) return { rows: [], rowCount: 0 };
      if (text.includes('INSERT INTO organization_workspace_data') && text.includes('SELECT o.id, wd.state')) return { rows: [], rowCount: 0 };
      if (text.includes('INSERT INTO organizations (name, owner_user_id)')) {
        const [name, userId] = values;
        if (!organizations.has(userId)) organizations.set(userId, { id: 'org-' + userId, name, owner_user_id: userId });
        return { rows: [], rowCount: 1 };
      }
      if (text.includes('SELECT id FROM organizations WHERE owner_user_id')) {
        const organization = organizations.get(values[0]);
        return { rows: organization ? [{ id: organization.id }] : [], rowCount: organization ? 1 : 0 };
      }
      if (text.includes('INSERT INTO organization_memberships')) return { rows: [], rowCount: 1 };
      if (text.includes('INSERT INTO organization_subscriptions')) return { rows: [], rowCount: 1 };
      if (text.includes('INSERT INTO organization_modules')) return { rows: [], rowCount: 4 };
      if (text.includes('FROM organization_memberships') && text.includes('SELECT organization_id')) {
        const organization = organizations.get(values[0]);
        return { rows: organization ? [{ organization_id: organization.id }] : [], rowCount: organization ? 1 : 0 };
      }

      if (text.includes('INSERT INTO workspace_users')) {
        const [name, email, passwordHash] = values;
        if (users.has(email)) throw Object.assign(new Error('duplicate email'), { code: '23505' });
        const row = { id: USER_ID, name, email, password_hash: passwordHash, created_at: new Date('2026-01-01T00:00:00.000Z') };
        users.set(email, row);
        return { rows: [{ id: row.id, name: row.name, email: row.email, created_at: row.created_at }], rowCount: 1 };
      }

      if (text.includes('FROM workspace_users WHERE email')) {
        const row = users.get(values[0]);
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
      }

      if (text.includes('INSERT INTO workspace_sessions')) {
        const [userId, tokenHash, csrfHash, expiresAt, absoluteExpiresAt, lastUsedAt] = values;
        sessions.set(tokenHash, { id: 'session-id', user_id: userId, token_hash: tokenHash, csrf_hash: csrfHash, expires_at: expiresAt, absolute_expires_at: absoluteExpiresAt, last_used_at: lastUsedAt, revoked_at: null });
        return { rows: [], rowCount: 1 };
      }

      if (text.includes('FROM workspace_sessions s JOIN workspace_users')) {
        const session = sessions.get(values[0]);
        const user = [...users.values()].find((item) => item.id === session?.user_id);
        return { rows: session && user && !session.revoked_at ? [{ session_id: session.id, csrf_hash: session.csrf_hash, expires_at: session.expires_at, absolute_expires_at: session.absolute_expires_at, id: user.id, name: user.name, email: user.email, created_at: user.created_at }] : [], rowCount: session && user ? 1 : 0 };
      }

      if (text.includes('UPDATE workspace_sessions SET last_used_at')) {
        const session = [...sessions.values()].find((item) => item.id === values[0]);
        if (session) { session.last_used_at = values[1]; session.expires_at = values[2]; }
        return { rows: [], rowCount: session ? 1 : 0 };
      }

      if (text.includes('UPDATE workspace_sessions SET revoked_at')) {
        const session = sessions.get(values[0]);
        if (session && !session.revoked_at) session.revoked_at = values[1];
        return { rows: [], rowCount: session && session.revoked_at ? 1 : 0 };
      }

      if (text.includes('FROM organization_workspace_data d')) {
        const organization = organizations.get(values[0]);
        const row = organization ? organizationStates.get(organization.id) : null;
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
      }

      if (text.includes('INSERT INTO organization_workspace_data (organization_id, state, updated_at) VALUES')) {
        organizationStates.set(values[0], { state: JSON.parse(values[1]), updated_at: new Date('2026-01-02T00:00:00.000Z') });
        return { rows: [], rowCount: 1 };
      }

      throw new Error(`Unexpected workspace SQL: ${text}`);
    },
  };
  return { calls, pool, users, sessions, states, organizations, organizationStates };
}

function useWorkspaceDatabase() {
  process.env.DATABASE_URL = 'postgres://example.invalid/agencyos-test';
  const database = workspaceDatabase();
  __setPoolForTests(database.pool);
  return database;
}

test.after(() => {
  __setPoolForTests(null);
  if (ORIGINAL_DATABASE_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = ORIGINAL_DATABASE_URL;
});

test('workspace registration normalizes input, hashes passwords, and returns only safe user fields', async () => {
  const db = useWorkspaceDatabase();
  const user = await registerWorkspaceUser({ name: '  Priya  ', email: ' PRIYA@Example.test ', password: 'a-strong-test-password' });

  assert.equal(user.name, 'Priya');
  assert.equal(user.email, 'priya@example.test');
  assert.equal(user.id, USER_ID);
  assert.equal('password_hash' in user, false);
  const insert = db.calls.find((call) => call.text.includes('INSERT INTO workspace_users'));
  assert.equal(insert.values[0], 'Priya');
  assert.equal(insert.values[1], 'priya@example.test');
  assert.match(insert.values[2], /^scrypt\$/);
  assert.notEqual(insert.values[2], 'a-strong-test-password');
});

test('workspace registration rejects invalid inputs and maps duplicate email to a conflict', async () => {
  const db = useWorkspaceDatabase();
  await assert.rejects(registerWorkspaceUser({ name: 'P', email: 'p@example.test', password: 'short' }), { statusCode: 400 });
  assert.equal(db.calls.some((call) => call.text.includes('INSERT INTO workspace_users')), false);

  await registerWorkspaceUser({ name: 'Priya', email: 'p@example.test', password: 'a-strong-test-password' });
  await assert.rejects(registerWorkspaceUser({ name: 'Priya', email: 'P@EXAMPLE.TEST', password: 'a-strong-test-password' }), { statusCode: 409 });
});

test('workspace sign-in accepts the correct password and refuses an incorrect one', async () => {
  useWorkspaceDatabase();
  await registerWorkspaceUser({ name: 'Priya', email: 'priya@example.test', password: 'a-strong-test-password' });

  const user = await authenticateWorkspaceUser({ email: ' PRIYA@EXAMPLE.TEST ', password: 'a-strong-test-password' });
  assert.equal(user.email, 'priya@example.test');
  assert.equal('password_hash' in user, false);
  assert.equal(await authenticateWorkspaceUser({ email: 'priya@example.test', password: 'incorrect-password' }), null);
});

test('workspace session cookies are secure, CSRF-bound, renewable, and revocable', async () => {
  const db = useWorkspaceDatabase();
  await registerWorkspaceUser({ name: 'Priya', email: 'priya@example.test', password: 'a-strong-test-password' });
  const now = new Date('2026-01-01T00:00:00.000Z');
  const session = await createWorkspaceSession(USER_ID, now);
  const storedSession = [...db.sessions.values()][0];
  assert.equal(storedSession.token_hash, sha256Hex(session.token));
  assert.notEqual(storedSession.token_hash, session.token);

  const request = {
    secure: true,
    headers: {
      cookie: `${WORKSPACE_SESSION_COOKIE}=${session.token}; ${WORKSPACE_CSRF_COOKIE}=${session.csrfToken}`,
      'x-forwarded-proto': 'https',
      'x-workspace-csrf': session.csrfToken,
    },
  };
  const cookie = workspaceSessionCookie(session.token, request);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(workspaceCsrfCookie(session.csrfToken, request), /Secure/);

  const resolved = await resolveWorkspaceSession(request, { now: new Date(now.getTime() + 1000) });
  assert.equal(resolved.user.id, USER_ID);
  assert.equal(workspaceCsrfAllowed(request, resolved), true);
  assert.equal(workspaceCsrfAllowed({ ...request, headers: { ...request.headers, 'x-workspace-csrf': 'wrong' } }, resolved), false);
  assert.ok(new Date(storedSession.expires_at).getTime() > session.expiresAt.getTime() - 1000);

  assert.equal(await revokeWorkspaceSession(request, new Date(now.getTime() + 2000)), true);
  assert.equal(await resolveWorkspaceSession(request, { now: new Date(now.getTime() + 3000) }), null);
  assert.ok(clearWorkspaceCookies(request).every((value) => /Max-Age=0/.test(value)));
});

test('workspace state is upserted and read back for its account only', async () => {
  const db = useWorkspaceDatabase();
  await registerWorkspaceUser({ name: 'Priya', email: 'priya@example.test', password: 'a-strong-test-password' });
  const state = { 'agencyos:business-profile:v1': { name: 'North Star Cafe' }, employees: [{ name: 'Example Worker', salary: 0 }] };

  assert.deepEqual(await writeWorkspaceState(USER_ID, state), { saved: true });
  assert.deepEqual((await readWorkspaceState(USER_ID)).state, state);
  assert.deepEqual((await readWorkspaceState('another-user-id')).state, {});

  const write = db.calls.find((call) => call.text.includes('INSERT INTO organization_workspace_data (organization_id, state, updated_at) VALUES'));
  assert.deepEqual(write.values, ['org-' + USER_ID, JSON.stringify(state)]);
  assert.match(write.text, /ON CONFLICT \(organization_id\) DO UPDATE/);
  assert.match(db.calls.find((call) => call.text.includes('FROM organization_workspace_data d')).text, /JOIN organization_memberships m ON m\.organization_id = d\.organization_id/);
  assert.match(db.calls.find((call) => call.text.includes('SELECT organization_id')).text, /WHERE user_id = \$1/);
  assert.equal(db.organizationStates.get('org-' + USER_ID).state['agencyos:business-profile:v1'].name, 'North Star Cafe');
});
