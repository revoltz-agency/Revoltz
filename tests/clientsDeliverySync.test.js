import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeClientsDeliveryState, mergeWebsiteDeliveryState, mergeClientOnboardingState, mergeClientActivityState } from '../src/lib/clientsDeliverySync.js';

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

test('Client Onboarding merge keeps cloud-only clients and prefers local checklist edits', () => {
  assert.deepEqual(mergeClientOnboardingState(
    { shared: { done: { 0: true }, notes: 'Local notes' }, local: { done: {}, notes: '' } },
    { shared: { done: {}, notes: 'Old cloud notes' }, cloud: { done: { 1: true }, notes: 'Cloud only' } },
  ), {
    shared: { done: { 0: true }, notes: 'Local notes' },
    cloud: { done: { 1: true }, notes: 'Cloud only' },
    local: { done: {}, notes: '' },
  });
});

test('Client Onboarding merge tolerates malformed values and caps stored client records', () => {
  const many = Object.fromEntries(Array.from({ length: 1005 }, (_, index) => [`client-${index}`, { notes: '' }]));
  const merged = mergeClientOnboardingState({ invalid: null }, many);
  assert.equal(Object.keys(merged).length, 1000);
  assert.equal(Object.hasOwn(merged, 'client-1004'), true);
  assert.equal(Object.hasOwn(merged, 'invalid'), false);
  assert.deepEqual(mergeClientOnboardingState([], null), {});
});

test('Client Activity Log merge preserves cloud-only records and local edits', () => {
  assert.deepEqual(mergeClientActivityState(
    [{ id: 'shared', client: 'Local client', summary: 'Local edit' }, { id: 'local', client: 'Local client' }],
    [{ id: 'shared', client: 'Cloud client', summary: 'Old value' }, { id: 'cloud', client: 'Cloud only' }],
  ), [
    { id: 'shared', client: 'Local client', summary: 'Local edit' },
    { id: 'cloud', client: 'Cloud only' },
    { id: 'local', client: 'Local client' },
  ]);
});

test('Client Activity Log merge ignores malformed records and caps the history', () => {
  const records = Array.from({ length: 2005 }, (_, index) => ({ id: `activity-${index}`, client: 'Client' }));
  const merged = mergeClientActivityState([...records, null, { id: 'bad', client: ' ' }], []);
  assert.equal(merged.length, 2000);
  assert.equal(merged.at(-1).id, 'activity-2004');
  assert.deepEqual(mergeClientActivityState(null, { id: 'not-an-array', client: 'Invalid' }), []);
});
