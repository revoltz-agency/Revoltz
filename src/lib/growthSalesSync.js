// Merge Growth & Sales state during the first cloud-sync migration.
// Browser-local data wins on conflicts, while cloud-only records are retained.
function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function mergeRecords(cloudRecords, localRecords, keyOf) {
  const merged = new Map();
  for (const record of Array.isArray(cloudRecords) ? cloudRecords : []) {
    const key = keyOf(record);
    if (key) merged.set(key, record);
  }
  for (const record of Array.isArray(localRecords) ? localRecords : []) {
    const key = keyOf(record);
    if (key) merged.set(key, record);
  }
  return [...merged.values()];
}

function mergeStringLists(cloudValues, localValues, limit = 500) {
  const values = [
    ...(Array.isArray(localValues) ? localValues : []),
    ...(Array.isArray(cloudValues) ? cloudValues : []),
  ].filter((value) => typeof value === 'string' && value.length <= 300);
  return [...new Set(values)].slice(0, limit);
}

function mergeSearchHistory(cloudHistory, localHistory) {
  const records = [];
  const seen = new Set();
  for (const item of [
    ...(Array.isArray(localHistory) ? localHistory : []),
    ...(Array.isArray(cloudHistory) ? cloudHistory : []),
  ]) {
    if (!item || typeof item.category !== 'string' || typeof item.city !== 'string') continue;
    const key = `${item.category.trim().toLowerCase()}|${item.city.trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    records.push(item);
    if (records.length === 8) break;
  }
  return records;
}

export function mergeGrowthSalesState(localState, cloudState) {
  const local = asObject(localState);
  const cloud = asObject(cloudState);
  return {
    workflow: { ...asObject(cloud.workflow), ...asObject(local.workflow) },
    manualLeads: mergeRecords(cloud.manualLeads, local.manualLeads, (lead) => lead && typeof lead.id === 'string' ? lead.id : '').slice(-1000),
    manualOverrides: { ...asObject(cloud.manualOverrides), ...asObject(local.manualOverrides) },
    savedPlaceIds: mergeStringLists(cloud.savedPlaceIds, local.savedPlaceIds),
    savedGeminiPlaceIds: mergeStringLists(cloud.savedGeminiPlaceIds, local.savedGeminiPlaceIds),
    searchHistory: mergeSearchHistory(cloud.searchHistory, local.searchHistory),
  };
}
