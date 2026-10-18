import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeClientsDeliveryState, mergeWebsiteDeliveryState, mergeClientOnboardingState, mergeClientActivityState, mergeClientRetentionState } from '../src/lib/clientsDeliverySync.js';

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

test('Client Retention merge preserves cloud-only accounts and prefers local edits', () => {
  assert.deepEqual(mergeClientRetentionState(
    [{ id: 'shared', client: 'Local name', status: 'Active' }, { id: 'local', client: 'Local only' }],
    [{ id: 'shared', client: 'Cloud name', status: 'At risk' }, { id: 'cloud', client: 'Cloud only' }],
  ), [
    { id: 'shared', client: 'Local name', status: 'Active' },
    { id: 'cloud', client: 'Cloud only' },
    { id: 'local', client: 'Local only' },
  ]);
});

test('Client Retention merge ignores malformed records and caps accounts at 1,000', () => {
  const records = Array.from({ length: 1005 }, (_, index) => ({ id: `client-${index}`, client: `Client ${index}` }));
  const merged = mergeClientRetentionState([...records, null, { id: 'bad', client: ' ' }], []);
  assert.equal(merged.length, 1000);
  assert.equal(merged.at(-1).id, 'client-1004');
  assert.deepEqual(mergeClientRetentionState(null, { id: 'bad', client: 'Invalid' }), []);
});


test('Invoice Tracker merge preserves cloud-only records and local edits by ID', async () => {
  const { mergeInvoiceTrackerState } = await import('../src/lib/financeReportsSync.js');
  assert.deepEqual(mergeInvoiceTrackerState(
    [{ id: 'shared', invoiceNo: 'INV-1', status: 'Paid' }, { id: 'local', invoiceNo: 'INV-2' }],
    [{ id: 'shared', invoiceNo: 'INV-1', status: 'Sent' }, { id: 'cloud', invoiceNo: 'INV-3' }],
  ), [
    { id: 'shared', invoiceNo: 'INV-1', status: 'Paid' },
    { id: 'cloud', invoiceNo: 'INV-3' },
    { id: 'local', invoiceNo: 'INV-2' },
  ]);
});

test('Invoice Tracker merge ignores malformed entries and caps records at 1,000', async () => {
  const { mergeInvoiceTrackerState } = await import('../src/lib/financeReportsSync.js');
  const many = Array.from({ length: 1005 }, (_, index) => ({ id: `invoice-${index}`, invoiceNo: `INV-${index}` }));
  const merged = mergeInvoiceTrackerState([...many, null, { id: 'bad-no', invoiceNo: ' ' }], []);
  assert.equal(merged.length, 1000);
  assert.equal(merged.at(-1).id, 'invoice-1004');
  assert.deepEqual(mergeInvoiceTrackerState(null, { id: 'bad', invoiceNo: ' ' }), []);
});


test('Sales packages merge retains cloud-only drafts and gives local edits priority', async () => {
  const { mergeSalesPackagesState } = await import('../src/lib/financeReportsSync.js');
  assert.deepEqual(mergeSalesPackagesState(
    [{ id: 'shared', businessName: 'Local business', proposal: 'Local edit' }, { id: 'local', businessName: 'Local only' }],
    [{ id: 'shared', businessName: 'Cloud business', proposal: 'Old value' }, { id: 'cloud', businessName: 'Cloud only' }],
  ), [
    { id: 'shared', businessName: 'Local business', proposal: 'Local edit' },
    { id: 'cloud', businessName: 'Cloud only' },
    { id: 'local', businessName: 'Local only' },
  ]);
});

test('Sales packages merge filters invalid records and caps at 100 drafts', async () => {
  const { mergeSalesPackagesState } = await import('../src/lib/financeReportsSync.js');
  const many = Array.from({ length: 105 }, (_, index) => ({ id: `package-${index}`, businessName: `Business ${index}` }));
  const merged = mergeSalesPackagesState([...many, null, { id: 'bad', businessName: ' ' }], []);
  assert.equal(merged.length, 100);
  assert.equal(merged.at(-1).id, 'package-104');
  assert.deepEqual(mergeSalesPackagesState(null, [{ id: 'bad', businessName: ' ' }]), []);
});

test('Deal Pipeline merge keeps cloud-only tracking and prioritizes local edits', async () => {
  const { mergeDealTrackerState } = await import('../src/lib/financeReportsSync.js');
  assert.deepEqual(mergeDealTrackerState(
    { shared: { stage: 'Won', notes: 'Local' }, local: { stage: 'Draft' } },
    { shared: { stage: 'Negotiation', notes: 'Cloud' }, cloud: { stage: 'Contacted' } },
  ), { shared: { stage: 'Won', notes: 'Local' }, cloud: { stage: 'Contacted' }, local: { stage: 'Draft' } });
});

test('Deal Pipeline merge rejects malformed entries and caps tracking records', async () => {
  const { mergeDealTrackerState } = await import('../src/lib/financeReportsSync.js');
  const many = Object.fromEntries(Array.from({ length: 1005 }, (_, index) => [`deal-${index}`, { stage: 'Draft' }]));
  const merged = mergeDealTrackerState({ invalid: null }, many);
  assert.equal(Object.keys(merged).length, 1000);
  assert.equal(Object.hasOwn(merged, 'deal-1004'), true);
  assert.deepEqual(mergeDealTrackerState([], null), {});
});
