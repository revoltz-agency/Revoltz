import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { WORKSPACE_STORAGE_KEYS } from '../src/lib/workspaceStorageKeys.js';

test('business workspace records are included in account sync and backup', async () => {
  const authGate = await readFile(new URL('../src/components/WorkspaceAuthGate.jsx', import.meta.url), 'utf8');
  const backup = await readFile(new URL('../src/components/DataBackup.jsx', import.meta.url), 'utf8');
  const requiredKeys = [
    'agencyos:business-profile:v1',
    'agencyos:business-team:v1',
    'agencyos:coaching-center:v1',
  ];

  assert.equal(new Set(WORKSPACE_STORAGE_KEYS).size, WORKSPACE_STORAGE_KEYS.length, 'workspace keys must be unique');
  const backupKeys = [...backup.matchAll(/'((?:agencyos):[^']+)'/g)].map((match) => match[1]);
  for (const key of backupKeys) {
    assert.ok(WORKSPACE_STORAGE_KEYS.includes(key), `${key} is backed up but must also be synchronized to the account`);
  }
  for (const key of requiredKeys) {
    assert.ok(WORKSPACE_STORAGE_KEYS.includes(key), `${key} must be synchronized to the account`);
    assert.ok(backup.includes(`'${key}'`), `${key} must be included in a backup`);
  }
  assert.ok(authGate.includes('new Set(WORKSPACE_STORAGE_KEYS)'), 'the account sync must use the central workspace key list');
});

test('workspace sync failures are visible and retry when the connection returns', async () => {
  const authGate = await readFile(new URL('../src/components/WorkspaceAuthGate.jsx', import.meta.url), 'utf8');
  assert.ok(authGate.includes("reportSyncStatus('saving')"), 'pending writes should be shown as saving');
  assert.ok(authGate.includes("reportSyncStatus('offline')"), 'failed writes should not be presented as cloud-saved');
  assert.ok(authGate.includes("window.addEventListener('online', retryWhenOnline)"), 'sync should retry after connectivity returns');
  assert.match(authGate, /Not synced — changes are saved only in this browser/);
  assert.match(authGate, /All changes saved to your account/);
});



test('legacy unscoped browser data is moved into one account before global keys are removed', async () => {
  const authGate = await readFile(new URL('../src/components/WorkspaceAuthGate.jsx', import.meta.url), 'utf8');
  const seedIndex = authGate.indexOf('native.setItem.call(window.localStorage, prefix + key, value)');
  const removeIndex = authGate.indexOf('for (const key of LEGACY_WORKSPACE_KEYS) native.removeItem.call(window.localStorage, key)');
  const syncIndex = authGate.indexOf('if (hasLegacyState || hasPendingSnapshot) scheduleSync()');

  assert.ok(seedIndex >= 0 && removeIndex > seedIndex, 'copy legacy values into the signed-in account namespace before removing global keys');
  assert.ok(syncIndex > removeIndex, 'schedule cloud migration after global keys have been removed');
  assert.match(authGate, /Keeping them around until cloud sync succeeds could expose/);
  assert.doesNotMatch(authGate, /let migrationPending = Object\.keys\(legacyState\)\.length > 0/);
});


test('pending offline workspace writes survive reload and can be explicitly discarded on conflict', async () => {
  const authGate = await readFile(new URL('../src/components/WorkspaceAuthGate.jsx', import.meta.url), 'utf8');
  assert.match(authGate, /agencyos:workspace-pending:/);
  assert.match(authGate, /baseRevision: cloudRevision/);
  assert.match(authGate, /if \(hasPendingSnapshot\) \{/);
  assert.match(authGate, /mergedState = hasPendingSnapshot \? cachedState/);
  assert.match(authGate, /native\.removeItem\.call\(window\.localStorage, pendingKey\)/);
  assert.match(authGate, /agencyos:discard-cloud-conflict/);
  assert.match(authGate, /Discard local edits &amp; reload cloud/);
});
