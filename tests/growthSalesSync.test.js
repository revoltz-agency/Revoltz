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
