import test from 'node:test';
import assert from 'node:assert/strict';
import { workspaceFailureMode, workspaceModuleFailureState } from '../src/lib/workspaceAccess.js';

test('unauthenticated workspace sessions show sign-in, not local mode', () => {
  assert.equal(workspaceFailureMode(401, true), 'anonymous');
  assert.equal(workspaceFailureMode(401, false), 'anonymous');
});

test('local-only mode requires explicit opt-in and a known unavailable-database response', () => {
  assert.equal(workspaceFailureMode(503, true), 'local');
  assert.equal(workspaceFailureMode(503, false), 'unavailable');
  assert.equal(workspaceFailureMode(500, true), 'unavailable');
  assert.equal(workspaceFailureMode(undefined, true), 'unavailable');
});


test('module navigation fails closed when hosted organization settings are unavailable', () => {
  assert.deepEqual(workspaceModuleFailureState(503, false), {
    growth_sales: false,
    clients_delivery: false,
    finance_reports: false,
    tools: false,
  });
  assert.equal(workspaceModuleFailureState(401, false), null, 'pre-login organization checks should not permanently hide modules');
  assert.equal(workspaceModuleFailureState(503, true), null, 'explicit local-only installs may keep local modules visible');
});


test('the app uses one authentication gate and announces account changes across tabs', async () => {
  const { readFile } = await import('node:fs/promises');
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /<WorkspaceAccess><AgencyOSApp\s*\/>\s*<\/WorkspaceAccess>/);
  assert.match(app, /agencyos-workspace-session/);
  assert.match(app, /event\.data\.userId !== userId/);
  assert.match(app, /window\.location\.reload\(\)/);
  const authGate = await readFile(new URL('../src/components/WorkspaceAuthGate.jsx', import.meta.url), 'utf8');
  assert.match(authGate, /type: 'session-changed', userId: null/);
});
