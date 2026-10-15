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
