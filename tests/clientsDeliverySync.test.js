import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeClientsDeliveryState } from '../src/lib/clientsDeliverySync.js';

test('Clients & Delivery project merge keeps cloud-only projects and local edits', () => {
  const merged = mergeClientsDeliveryState(
    [{ id: 'shared', title: 'Local title' }, { id: 'local-only', title: 'Local only' }],
    [{ id: 'shared', title: 'Old cloud title' }, { id: 'cloud-only', title: 'Cloud only' }],
  );
  assert.deepEqual(merged, [
    { id: 'shared', title: 'Local title' },
    { id: 'cloud-only', title: 'Cloud only' },
    { id: 'local-only', title: 'Local only' },
  ]);
});

test('Clients & Delivery project merge ignores malformed records and enforces the 500-project bound', () => {
  const local = Array.from({ length: 510 }, (_, index) => ({ id: `local-${index}`, title: `Local ${index}` }));
  const merged = mergeClientsDeliveryState([...local, null, { id: 'bad-title', title: ' ' }], [{ id: 'cloud', title: 'Cloud only' }]);
  assert.equal(merged.length, 500);
  assert.equal(merged.at(-1).id, 'local-509');
  assert.equal(merged.some(project => project.id === 'cloud'), false);
});

test('Clients & Delivery merge tolerates malformed storage values', () => {
  assert.deepEqual(mergeClientsDeliveryState(null, { id: 'not-an-array', title: 'Invalid' }), []);
  assert.deepEqual(mergeClientsDeliveryState([{ id: 'ok', title: 'Valid' }, { id: 3, title: 'Invalid ID' }], null), [
    { id: 'ok', title: 'Valid' },
  ]);
});
