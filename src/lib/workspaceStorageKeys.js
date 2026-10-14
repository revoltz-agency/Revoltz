// Keys that belong to one signed-in business workspace. New business modules
// must add their storage keys here so account sync does not silently skip them.
export const WORKSPACE_STORAGE_KEYS = Object.freeze([
  'agencyos:business-profile:v1',
  'agencyos:business-team:v1',
  'agencyos:coaching-center:v1',
  'agencyos:workflow:v1',
  'agencyos:saved-place-ids:v1',
  'agencyos:saved-gemini-place-ids:v1',
  'agencyos:search-history:v1',
  'agencyos:manual-leads:v1',
  'agencyos:manual-lead-overrides:v1',
]);
