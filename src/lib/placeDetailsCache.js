// Keep one in-flight/result promise per place ID for the lifetime of the app tab.
// Rejected promises stay cached too, so retries cannot repeat billed Details calls.
export function getOrCreateCachedRequest(cache, key, factory) {
  if (!cache.has(key)) cache.set(key, Promise.resolve().then(factory));
  return cache.get(key);
}
