const MAX_PROJECTS = 500;

function validProject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    typeof value.id === 'string' && value.id.length > 0 &&
    typeof value.title === 'string' && value.title.trim().length > 0;
}

export function mergeClientsDeliveryState(localProjects, cloudProjects) {
  const local = Array.isArray(localProjects) ? localProjects.filter(validProject) : [];
  const cloud = Array.isArray(cloudProjects) ? cloudProjects.filter(validProject) : [];
  const merged = new Map();
  for (const project of cloud) merged.set(project.id, project);
  // Local versions win for matching IDs; local-only and cloud-only projects survive.
  for (const project of local) merged.set(project.id, project);
  return [...merged.values()].slice(-MAX_PROJECTS);
}

function validWebsiteDeliveryItem(value) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    typeof value.id === 'string' && value.id.length > 0 &&
    typeof value.client === 'string' && value.client.trim().length > 0;
}

export function mergeWebsiteDeliveryState(localItems, cloudItems) {
  const local = Array.isArray(localItems) ? localItems.filter(validWebsiteDeliveryItem) : [];
  const cloud = Array.isArray(cloudItems) ? cloudItems.filter(validWebsiteDeliveryItem) : [];
  const merged = new Map();
  for (const item of cloud) merged.set(item.id, item);
  // Local edits win for matching IDs; records unique to either source survive.
  for (const item of local) merged.set(item.id, item);
  return [...merged.values()].slice(-500);
}

export function mergeClientOnboardingState(localChecks, cloudChecks) {
  const local = localChecks && typeof localChecks === 'object' && !Array.isArray(localChecks) ? localChecks : {};
  const cloud = cloudChecks && typeof cloudChecks === 'object' && !Array.isArray(cloudChecks) ? cloudChecks : {};
  const merged = { ...cloud };
  for (const [clientId, record] of Object.entries(local)) {
    if (clientId && record && typeof record === 'object' && !Array.isArray(record)) merged[clientId] = record;
  }
  return Object.fromEntries(Object.entries(merged).filter(([, record]) =>
    record && typeof record === 'object' && !Array.isArray(record)
  ).slice(-1000));
}

export function mergeClientActivityState(localItems, cloudItems) {
  const valid = (item) => item && typeof item === 'object' && !Array.isArray(item) &&
    typeof item.id === 'string' && item.id.length > 0 &&
    typeof item.client === 'string' && item.client.trim().length > 0;
  const local = Array.isArray(localItems) ? localItems.filter(valid) : [];
  const cloud = Array.isArray(cloudItems) ? cloudItems.filter(valid) : [];
  const merged = new Map();
  for (const item of cloud) merged.set(item.id, item);
  for (const item of local) merged.set(item.id, item);
  return [...merged.values()].slice(-2000);
}
