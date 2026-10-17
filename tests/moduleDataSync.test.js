import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeRecordsById, saveOrganizationModulePatch } from '../src/lib/moduleDataSync.js';

function jsonResponse(status, body) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}

test('module patch preserves sibling keys and sends the current revision', async () => {
  const calls = [];
  const fetchImpl = async (_url, options = {}) => {
    calls.push(options);
    if (!options.method) return jsonResponse(200, {
      state: { salesPackages: [{ id: 'pkg-1' }], dealTracker: { 'pkg-1': { stage: 'Won' } } },
      updatedAt: '2026-10-17T10:00:00.000Z',
    });
    return jsonResponse(200, { saved: true, updatedAt: '2026-10-17T10:00:01.000Z' });
  };

  const result = await saveOrganizationModulePatch('growth_sales', { dealTracker: { 'pkg-2': { stage: 'Draft' } } }, {
    fetchImpl,
    csrfToken: 'test-csrf',
  });

  assert.equal(result.saved, true);
  const request = JSON.parse(calls[1].body);
  assert.equal(request.expectedUpdatedAt, '2026-10-17T10:00:00.000Z');
  assert.deepEqual(request.state.salesPackages, [{ id: 'pkg-1' }]);
  assert.deepEqual(request.state.dealTracker, { 'pkg-2': { stage: 'Draft' } });
  assert.equal(calls[1].headers['X-Workspace-CSRF'], 'test-csrf');
});

test('module patch retries sibling-write conflicts without discarding sibling keys', async () => {
  let reads = 0;
  let writes = 0;
  const fetchImpl = async (_url, options = {}) => {
    if (!options.method) {
      reads += 1;
      return jsonResponse(200, reads === 1
        ? { state: { invoiceTracker: [] }, updatedAt: 'r1' }
        : { state: { invoiceTracker: [], expenseTracker: [{ id: 'e1' }] }, updatedAt: 'r2' });
    }
    writes += 1;
    return writes === 1
      ? jsonResponse(409, { code: 'WORKSPACE_REVISION_CONFLICT', error: 'revision conflict' })
      : jsonResponse(200, { saved: true, updatedAt: 'r3' });
  };

  const result = await saveOrganizationModulePatch('finance_reports', { invoiceTracker: [{ id: 'i1' }] }, { fetchImpl, csrfToken: 'csrf' });
  assert.equal(result.saved, true);
  assert.equal(reads, 2);
  assert.equal(writes, 2);
});

test('module patch refuses to overwrite a concurrently changed key', async () => {
  let reads = 0;
  const fetchImpl = async (_url, options = {}) => {
    if (!options.method) {
      reads += 1;
      return jsonResponse(200, reads === 1
        ? { state: { invoiceTracker: [{ id: 'old' }] }, updatedAt: 'r1' }
        : { state: { invoiceTracker: [{ id: 'new' }] }, updatedAt: 'r2' });
    }
    return jsonResponse(409, { code: 'WORKSPACE_REVISION_CONFLICT', error: 'revision conflict' });
  };

  await assert.rejects(
    saveOrganizationModulePatch('finance_reports', { invoiceTracker: [{ id: 'local' }] }, { fetchImpl, csrfToken: 'csrf' }),
    (error) => error.code === 'WORKSPACE_REVISION_CONFLICT',
  );
});

test('module patch rejects unknown module keys', async () => {
  await assert.rejects(saveOrganizationModulePatch('not-a-module', {}, { fetchImpl: async () => { throw new Error('should not fetch'); } }));
});

test('record merging preserves local-only records but prefers cloud copies for duplicate IDs', () => {
  const merged = mergeRecordsById(
    [{ id: 'shared', value: 'stale local' }, { id: 'local-only', value: 'local' }],
    [{ id: 'shared', value: 'latest cloud' }, { id: 'cloud-only', value: 'cloud' }],
  );
  assert.deepEqual(merged, [
    { id: 'local-only', value: 'local' },
    { id: 'shared', value: 'latest cloud' },
    { id: 'cloud-only', value: 'cloud' },
  ]);
});
