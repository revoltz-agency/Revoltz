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
