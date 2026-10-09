// Browser-only OpenStreetMap search for static hosting (GitHub Pages).
// No Google APIs, geocoding API, API keys, or paid services are used. One Overpass
// request per search; city centres are stored locally to avoid public geocoding.
import { FREE_SOURCE, OSM_ATTRIBUTION, OSM_LICENSE_URL, matchOsmCategory, osmNameTokens, describeOsmCategory } from './freeLeadFinder.js';

const OVERPASS = 'https://overpass-api.de/api/interpreter';
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let lastSearchAt = 0;

// Offline city-centre lookup avoids depending on a third-party geocoding API.
// The radius is measured from these approximate city centres, not city borders.
const CITY_CENTRES = {
  pune: [18.5204, 73.8567], 'pimpri chinchwad': [18.6298, 73.7997],
  mumbai: [19.076, 72.8777], thane: [19.2183, 72.9781], 'navi mumbai': [19.033, 73.0297],
  delhi: [28.6139, 77.209], 'new delhi': [28.6139, 77.209], bengaluru: [12.9716, 77.5946], bangalore: [12.9716, 77.5946],
  hyderabad: [17.385, 78.4867], chennai: [13.0827, 80.2707], kolkata: [22.5726, 88.3639],
  ahmedabad: [23.0225, 72.5714], jaipur: [26.9124, 75.7873], lucknow: [26.8467, 80.9462],
  indore: [22.7196, 75.8577], bhopal: [23.2599, 77.4126], nagpur: [21.1458, 79.0882],
  nashik: [19.9975, 73.7898], surat: [21.1702, 72.8311], vadodara: [22.3072, 73.1812],
  gurugram: [28.4595, 77.0266], gurgaon: [28.4595, 77.0266], noida: [28.5355, 77.391],
  chandigarh: [30.7333, 76.7794], kochi: [9.9312, 76.2673], coimbatore: [11.0168, 76.9558],
  bhubaneswar: [20.2961, 85.8245], raipur: [21.2514, 81.6296], visakhapatnam: [17.6868, 83.2185],
  patna: [25.5941, 85.1376], ranchi: [23.3441, 85.3096], dehradun: [30.3165, 78.0322],
};
function resolveKnownCity(location) {
  const normalized = text(location, 160).toLowerCase().replace(/,.*$/, '').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  const point = CITY_CENTRES[normalized];
  return point ? { latitude: point[0], longitude: point[1], displayName: text(location, 160) } : null;
}

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

  const place = resolveKnownCity(safeLocation);
  if (!place) throw new Error('Free search currently supports common city names (for example Pune, Mumbai, Delhi, Bengaluru, Hyderabad, Chennai, or Nagpur). For other locations, use Demo sample or add a city centre to the local CITY_CENTRES list in browserOsmSearch.js.');
  const lat = place.latitude, lon = place.longitude;

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
  return { results: leads, warnings, requests: 1, geocodingRequests: 0, attribution: OSM_ATTRIBUTION, licenseUrl: OSM_LICENSE_URL, matchedCategory: matched.matched ? matched.label : '', queriedTags: matched.matched ? matched.filters.map(([key,value]) => key+'='+value) : tokens, resolvedLocation: text(place.displayName,240) };
}
