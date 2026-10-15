import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeGrowthSalesState } from '../src/lib/growthSalesSync.js';

test('Growth & Sales merge keeps cloud-only records and lets local edits win conflicts', () => {
  const merged = mergeGrowthSalesState({
    workflow: { leadA: { status: 'CONTACTED', notes: 'Local edit' } },
    manualLeads: [{ id: 'manual-1', name: 'Locally edited name' }, { id: 'manual-2', name: 'Local only' }],
    manualOverrides: { 'leadA': { name: 'Local name' } },
  }, {
    workflow: { leadA: { status: 'NEW', notes: 'Old cloud value' }, leadB: { status: 'NEW' } },
    manualLeads: [{ id: 'manual-1', name: 'Old cloud name' }, { id: 'manual-3', name: 'Cloud only' }],
    manualOverrides: { 'leadA': { name: 'Cloud name' }, 'leadB': { name: 'Cloud-only lead' } },
  });

  assert.deepEqual(merged.workflow, {
    leadA: { status: 'CONTACTED', notes: 'Local edit' },
    leadB: { status: 'NEW' },
  });
  assert.equal(merged.manualLeads.find((lead) => lead.id === 'manual-1').name, 'Locally edited name');
  assert.deepEqual(merged.manualLeads.map((lead) => lead.id).sort(), ['manual-1', 'manual-2', 'manual-3']);
  assert.deepEqual(merged.manualOverrides, {
    leadA: { name: 'Local name' },
    leadB: { name: 'Cloud-only lead' },
  });
});

test('Growth & Sales merge unions saved IDs and deduplicates recent search history', () => {
  const merged = mergeGrowthSalesState({
    savedPlaceIds: ['place-local', 'place-shared'],
    savedGeminiPlaceIds: ['gemini-local'],
    searchHistory: [
      { category: 'Dentists', city: 'Pune' },
      { category: 'Cafes', city: 'Pune' },
    ],
  }, {
    savedPlaceIds: ['place-cloud', 'place-shared'],
    savedGeminiPlaceIds: ['gemini-cloud', 'gemini-local'],
    searchHistory: [
      { category: 'dentists', city: 'pune' },
      { category: 'Gyms', city: 'Pune' },
    ],
  });

  assert.deepEqual(merged.savedPlaceIds, ['place-local', 'place-shared', 'place-cloud']);
  assert.deepEqual(merged.savedGeminiPlaceIds, ['gemini-local', 'gemini-cloud']);
  assert.equal(merged.searchHistory.length, 3);
  assert.equal(merged.searchHistory[0].category, 'Dentists');
});


test('Growth & Sales merge safely ignores malformed or missing saved state', () => {
  const merged = mergeGrowthSalesState(null, {
    workflow: [],
    manualLeads: [{ name: 'Missing id is not a stable record' }, null, { id: 'cloud-1', name: 'Cloud record' }],
    manualOverrides: ['not', 'an', 'object'],
    savedPlaceIds: [null, 42, 'valid-place'],
    savedGeminiPlaceIds: 'not-an-array',
    searchHistory: [{ category: 'Dentists' }, null, { category: 'Cafes', city: 'Pune' }],
  });

  assert.deepEqual(merged.workflow, {});
  assert.deepEqual(merged.manualLeads, [{ id: 'cloud-1', name: 'Cloud record' }]);
  assert.deepEqual(merged.manualOverrides, {});
  assert.deepEqual(merged.savedPlaceIds, ['valid-place']);
  assert.deepEqual(merged.savedGeminiPlaceIds, []);
  assert.deepEqual(merged.searchHistory, [{ category: 'Cafes', city: 'Pune' }]);
});

test('Growth & Sales merge ignores invalid local state without losing valid cloud records', () => {
  const merged = mergeGrowthSalesState({
    workflow: null,
    manualLeads: 'corrupt',
    manualOverrides: false,
    savedPlaceIds: {},
    searchHistory: [{ category: 4, city: 'Pune' }],
  }, {
    workflow: { cloudLead: { status: 'NEW' } },
    manualLeads: [{ id: 'cloud-1', name: 'Cloud record' }],
    manualOverrides: { cloudLead: { name: 'Cloud name' } },
    savedPlaceIds: ['cloud-place'],
    searchHistory: [{ category: 'Clinics', city: 'Pune' }],
  });

  assert.deepEqual(merged.workflow, { cloudLead: { status: 'NEW' } });
  assert.deepEqual(merged.manualLeads, [{ id: 'cloud-1', name: 'Cloud record' }]);
  assert.deepEqual(merged.manualOverrides, { cloudLead: { name: 'Cloud name' } });
  assert.deepEqual(merged.savedPlaceIds, ['cloud-place']);
  assert.deepEqual(merged.searchHistory, [{ category: 'Clinics', city: 'Pune' }]);
});

test('Growth & Sales merge applies record and list bounds without dropping local priority', () => {
  const localLeads = Array.from({ length: 1005 }, (_, index) => ({ id: `local-${index}`, name: `Local ${index}` }));
  const cloudLeads = [{ id: 'cloud-only', name: 'Cloud only' }];
  const savedPlaceIds = [
    ...Array.from({ length: 505 }, (_, index) => `place-${index}`),
    'x'.repeat(301),
    42,
  ];
  const searchHistory = Array.from({ length: 12 }, (_, index) => ({
    category: `Category ${index}`,
    city: 'Pune',
  }));

  const merged = mergeGrowthSalesState({
    manualLeads: localLeads,
    savedPlaceIds,
    searchHistory,
  }, {
    manualLeads: cloudLeads,
    savedPlaceIds: ['cloud-place'],
    searchHistory: [],
  });

  assert.equal(merged.manualLeads.length, 1000);
  assert.equal(merged.manualLeads.at(-1).id, 'local-1004');
  assert.equal(merged.manualLeads.some((lead) => lead.id === 'cloud-only'), false,
    'the documented newest/local tail bound is applied after merging');
  assert.equal(merged.savedPlaceIds.length, 500);
  assert.equal(merged.savedPlaceIds.includes('cloud-place'), false,
    'local saved IDs take precedence when the merged list exceeds its 500-item cap');
  assert.equal(merged.savedPlaceIds.some((id) => id.length > 300), false);
  assert.equal(merged.searchHistory.length, 8);
  assert.equal(merged.searchHistory[0].category, 'Category 0');
});
