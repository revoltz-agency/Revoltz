// Browser-only OpenStreetMap search for static hosting (GitHub Pages).
// No Google APIs, API keys, or paid services are used. Respect public-service
// rate limits: this makes one geocode request and one Overpass request per search.
import { FREE_SOURCE, OSM_ATTRIBUTION, OSM_LICENSE_URL, matchOsmCategory, osmNameTokens, describeOsmCategory } from './freeLeadFinder.js';

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const OVERPASS = 'https://overpass-api.de/api/interpreter';
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let lastSearchAt = 0;

function text(value, max = 300) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function distanceKm(a, b, c, d) {
  const rad = (n) => n * Math.PI / 180;
  const x = Math.sin(rad(c-a)/2)**2 + Math.cos(rad(a))*Math.cos(rad(c))*Math.sin(rad(d-b)/2)**2;
  return 6371 * 2 * Math.asin(Math.sqrt(x));
}
function safeWebsite(value) {
  const raw = text(value, 2000);
  if (!raw) return '';
  try { const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : 'https://' + raw); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''; }
  catch { return ''; }
}
function address(tags) {
  const full = text(tags['addr:full'] || tags['addr:housename']);
  if (full) return full;
  return [tags['addr:housenumber'], tags['addr:street'], tags['addr:suburb'] || tags['addr:neighbourhood'], tags['addr:city'] || tags['addr:town'] || tags['addr:village'], tags['addr:postcode']].map((v) => text(v, 100)).filter(Boolean).join(', ');
}
async function fetchJson(url, options, label) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, headers: { Accept: 'application/json', ...(options?.headers || {}) } });
    if (response.status === 429) throw new Error(label + ' is rate-limiting requests. Wait a little before trying again.');
    if (!response.ok) throw new Error(label + ' returned HTTP ' + response.status + '. Please try again later.');
    return await response.json();
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(label + ' timed out. Try a smaller radius or try again later.');
    throw error;
  } finally { clearTimeout(timer); }
}
export async function searchBrowserOpenStreetMap({ category, location, radiusKm = 10, maxResults = 10 }) {
  const safeCategory = text(category, 100);
  const safeLocation = text(location, 160);
  const radius = Math.max(1, Math.min(50, Number(radiusKm) || 10));
  const cap = Math.max(1, Math.min(50, Number(maxResults) || 10));
  if (!safeCategory || !safeLocation) throw new Error('Enter an industry/category and a location.');
  const delay = Math.max(0, 1100 - (Date.now() - lastSearchAt));
  if (delay) await wait(delay);
  lastSearchAt = Date.now();

  const geo = new URL(NOMINATIM);
  geo.searchParams.set('format', 'jsonv2');
  geo.searchParams.set('limit', '1');
  geo.searchParams.set('q', safeLocation);
  const geocoded = await fetchJson(geo.toString(), {}, 'OpenStreetMap location search');
  const place = Array.isArray(geocoded) ? geocoded[0] : null;
  const lat = Number(place?.lat), lon = Number(place?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('Location not found in OpenStreetMap. Try a nearby city or more specific area.');

  const matched = matchOsmCategory(safeCategory);
  const tokens = matched.matched ? [] : osmNameTokens(safeCategory);
  const radiusM = Math.round(radius * 1000);
  const around = `around:${radiusM},${lat.toFixed(6)},${lon.toFixed(6)}`;
  const filters = matched.filters.filter(([key, value]) => /^[a-z_]{2,32}$/.test(key) && /^[a-z0-9_:]{1,40}$/.test(value));
  const statements = filters.map(([key, value]) => `nwr["${key}"="${value}"](${around});`);
  if (!statements.length && tokens.length) {
    const regex = tokens.filter((token) => /^[a-z0-9]{2,30}$/.test(token)).join('|');
    if (regex) for (const key of ['amenity','shop','office','craft','leisure','tourism','healthcare']) statements.push(`nwr["${key}"]["name"~"${regex}",i](${around});`);
  }
  if (!statements.length) throw new Error('This category is not supported by the free OpenStreetMap search yet. Try a common category such as dentists, restaurants, gyms, salons, or CA firms.');
  const query = `[out:json][timeout:25];(\n${statements.join('\n')}\n);out center ${Math.min(300, cap*6)};`;
  const result = await fetchJson(OVERPASS, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }, body: new URLSearchParams({ data: query }).toString() }, 'OpenStreetMap business search');
  const seen = new Set();
  const leads = (Array.isArray(result?.elements) ? result.elements : []).map((item) => {
    const tags = item?.tags || {};
    const name = text(tags.name, 160);
    if (!name || !['node','way','relation'].includes(item.type) || !Number.isInteger(Number(item.id))) return null;
    const key = `osm-${item.type}/${item.id}`;
    if (seen.has(key)) return null;
    seen.add(key);
    const itemLat = Number(item.type === 'node' ? item.lat : item.center?.lat);
    const itemLon = Number(item.type === 'node' ? item.lon : item.center?.lon);
    const dist = Number.isFinite(itemLat) && Number.isFinite(itemLon) ? distanceKm(lat, lon, itemLat, itemLon) : null;
    return {
      id: key, placeId: key, name, category: describeOsmCategory(tags, matched),
      address: address(tags), city: text(tags['addr:city'] || tags['addr:town'] || tags['addr:village'] || safeLocation, 100),
      phone: text(tags.phone || tags['contact:phone'] || tags['contact:mobile'], 50),
      internationalPhoneNumber: '', website: safeWebsite(tags.website || tags['contact:website'] || tags.url),
      rating: null, reviews: 0, mapsUrl: `https://www.openstreetmap.org/${item.type}/${item.id}`,
      businessStatus: 'UNKNOWN', source: FREE_SOURCE, demo: false,
      distanceKm: dist === null ? null : Math.round(dist*10)/10,
    };
  }).filter(Boolean).filter((lead) => lead.distanceKm === null || lead.distanceKm <= radius + 0.5)
    .sort((a,b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity)).slice(0, cap);
  const warnings = ['OpenStreetMap is community-maintained; coverage varies and phone numbers, websites, ratings, and review counts may be missing. Verify every lead before outreach.', 'Search uses public OpenStreetMap services with shared capacity. Avoid repeated/bulk searches and respect the OpenStreetMap usage policy.'];
  if (!matched.matched) warnings.unshift('No fixed category tag matched; results are based on business-name matches. Verify relevance manually.');
  return { results: leads, warnings, requests: 1, geocodingRequests: 1, attribution: OSM_ATTRIBUTION, licenseUrl: OSM_LICENSE_URL, matchedCategory: matched.matched ? matched.label : '', queriedTags: matched.matched ? matched.filters.map(([key,value]) => key+'='+value) : tokens, resolvedLocation: text(place?.display_name,240) };
}
