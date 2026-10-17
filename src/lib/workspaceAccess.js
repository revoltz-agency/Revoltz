// Decide whether a failed workspace session check may fall back to local-only mode.
// Local fallback must be an explicit build-time opt-in; network and server errors
// must never silently bypass the sign-in gate in a hosted workspace.
export function workspaceFailureMode(status, allowLocalWorkspace = false) {
  if (status === 401) return 'anonymous';
  if (allowLocalWorkspace && status === 503) return 'local';
  return 'unavailable';
}

// If module settings cannot be loaded after authentication, hosted workspaces must
// fail closed in navigation. A 401 is different: the app may be mounted behind
// the sign-in screen, so leave module visibility unresolved until login succeeds.
export function workspaceModuleFailureState(status, allowLocalWorkspace = false) {
  if (allowLocalWorkspace || status === 401) return null;
  return {
    growth_sales: false,
    clients_delivery: false,
    finance_reports: false,
    tools: false,
  };
}
