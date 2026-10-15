// Decide whether a failed workspace session check may fall back to local-only mode.
// Local fallback must be an explicit build-time opt-in; network and server errors
// must never silently bypass the sign-in gate in a hosted workspace.
export function workspaceFailureMode(status, allowLocalWorkspace = false) {
  if (status === 401) return 'anonymous';
  if (allowLocalWorkspace && status === 503) return 'local';
  return 'unavailable';
}
