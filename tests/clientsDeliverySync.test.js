import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeClientsDeliveryState, mergeWebsiteDeliveryState } from '../src/lib/clientsDeliverySync.js';

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

test('Website Delivery merge keeps cloud-only projects and prefers local edits by ID', () => {
  assert.deepEqual(mergeWebsiteDeliveryState(
    [{ id: 'shared', client: 'Local client', phase: 'Launched' }, { id: 'local-only', client: 'Local only' }],
    [{ id: 'shared', client: 'Old cloud client', phase: 'In progress' }, { id: 'cloud-only', client: 'Cloud only' }],
  ), [
    { id: 'shared', client: 'Local client', phase: 'Launched' },
    { id: 'cloud-only', client: 'Cloud only' },
    { id: 'local-only', client: 'Local only' },
  ]);
});

test('Website Delivery merge ignores malformed records and caps projects at 500', () => {
  const local = Array.from({ length: 510 }, (_, index) => ({ id: `local-${index}`, client: `Client ${index}` }));
  const merged = mergeWebsiteDeliveryState([...local, null, { id: 'bad-client', client: ' ' }], [{ id: 'cloud', client: 'Cloud client' }]);
  assert.equal(merged.length, 500);
  assert.equal(merged.at(-1).id, 'local-509');
  assert.equal(merged.some((item) => item.id === 'cloud'), false);
  assert.deepEqual(mergeWebsiteDeliveryState(null, { id: 'not-an-array', client: 'Invalid' }), []);
});
