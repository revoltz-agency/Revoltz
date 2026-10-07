// Free lead discovery using OpenStreetMap:
//   * Nominatim  -> resolve the operator's city text to coordinates
//   * Overpass   -> query businesses around those coordinates
//
// No API key and no billing are involved. Both services are community-run, so
// every request is time-boxed, rate-limit aware, and identifies the client with
// a User-Agent as their usage policies require.

import {
  FREE_SOURCE,
  OSM_ATTRIBUTION,
  OSM_BUSINESS_KEYS,
  OSM_LICENSE_URL,
  describeOsmCategory,
  matchOsmCategory,
  osmNameTokens,
} from '../src/lib/freeLeadFinder.js';

const DEFAULT_OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const DEFAULT_NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const OVERPASS_TIMEOUT_MS = Number(process.env.OVERPASS_TIMEOUT_MS) || 30_000;
const GEOCODE_TIMEOUT_MS = 8_000;
const MIN_RADIUS_M = 1_000;
const MAX_RADIUS_M = 50_000;
// Overpass cannot sort by distance, so fetch a multiple of the requested cap and
// sort by distance locally before trimming to the operator's limit.
const OVERFETCH_FACTOR = 6;
const MAX_OVERFETCH = 300;
const MAX_RESULTS = 50;

const TAG_KEY_PATTERN = /^[a-z_]{2,32}$/;
const TAG_VALUE_PATTERN = /^[a-z0-9_:]{1,40}$/;

function userAgent() {
  return process.env.OSM_USER_AGENT?.trim() || 'AgencyOS/1.0 (+https://github.com/revoltz-agency/Revoltz)';
}
function overpassUrl() {
  return process.env.OVERPASS_API_URL?.trim() || DEFAULT_OVERPASS_URL;
}
function nominatimUrl() {
  return process.env.NOMINATIM_API_URL?.trim() || DEFAULT_NOMINATIM_URL;
}

function trimText(value, max = 200) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6_371 * 2 * Math.asin(Math.sqrt(a));
}

/**
 * Build an Overpass QL query from allowlisted pieces only.
 * Operator text never reaches this string: tag keys/values come from the
 * category allowlist and name tokens are alphanumeric by construction.
 */
export function buildOverpassQuery({ filters = [], tokens = [], radiusM, center, limit }) {
  const lat = Number(center?.latitude);
  const lon = Number(center?.longitude);
  const radius = Math.round(Number(radiusM));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(radius)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  const around = `around:${Math.min(MAX_RADIUS_M, Math.max(MIN_RADIUS_M, radius))},${lat.toFixed(6)},${lon.toFixed(6)}`;
  const statements = [];

  for (const [key, value] of filters) {
    if (!TAG_KEY_PATTERN.test(key) || !TAG_VALUE_PATTERN.test(value)) continue;
    statements.push(`nwr["${key}"="${value}"](${around});`);
  }
  if (!statements.length && tokens.length) {
    // Tokens are /^[a-z0-9]{2,30}$/ (see osmNameTokens), so no PCRE metacharacter
    // can be smuggled into the regex.
    const regex = tokens.filter((token) => /^[a-z0-9]{2,30}$/.test(token)).join('|');
    if (regex) {
      for (const key of OSM_BUSINESS_KEYS) {
        if (!TAG_KEY_PATTERN.test(key)) continue;
        statements.push(`nwr["${key}"]["name"~"${regex}",i](${around});`);
      }
    }
  }
  if (!statements.length) return null;

  const cap = Math.min(MAX_OVERFETCH, Math.max(1, Math.round(Number(limit) || MAX_RESULTS)));
  return `[out:json][timeout:25];\n(\n  ${statements.join('\n  ')}\n);\nout center ${cap};`;
}

function geocodeFailure(status, location) {
  if (status === 'UNREACHABLE') {
    const error = new Error('OpenStreetMap place lookup could not be reached. Check the server connection and try again.');
    error.statusCode = 502;
    return error;
  }
  if (status === 'HTTP_429' || status === 'RATE_LIMITED') {
    const error = new Error('OpenStreetMap place lookup is rate limiting requests. Wait a moment, then search again.');
    error.statusCode = 429;
    return error;
  }
  if (status === 'ZERO_RESULTS') {
    const error = new Error(`No place matching “${location}” was found in OpenStreetMap. Try a nearby city or a more specific area.`);
    error.statusCode = 404;
    return error;
  }
  const error = new Error('OpenStreetMap place lookup failed. Check the location text and try again.');
  error.statusCode = 502;
  return error;
}

async function resolveLocationCenter(location) {
  const url = new URL(nominatimUrl());
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('q', location);
  let response;
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': userAgent() },
      signal: AbortSignal.timeout(GEOCODE_TIMEOUT_MS),
    });
  } catch {
    return { center: null, status: 'UNREACHABLE' };
  }
  if (response.status === 429) return { center: null, status: 'HTTP_429' };
  if (!response.ok) return { center: null, status: `HTTP_${response.status}` };
  let payload;
  try {
    payload = await response.json();
  } catch {
    return { center: null, status: 'UNREADABLE' };
  }
  const first = Array.isArray(payload) ? payload[0] : null;
  const lat = Number(first?.lat);
  const lon = Number(first?.lon);
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    return { center: { latitude: lat, longitude: lon }, displayName: trimText(first?.display_name, 240), status: 'OK' };
  }
  return { center: null, status: 'ZERO_RESULTS' };
}

function overpassError(response, remark) {
  if (response.status === 429) {
    const error = new Error('OpenStreetMap (Overpass) is rate limiting requests right now. Wait a moment and try again.');
    error.statusCode = 429;
    return error;
  }
  if (response.status === 400) {
    const error = new Error(`OpenStreetMap rejected the search query${remark ? `: ${remark}` : '.'} Try a different category or location.`);
    error.statusCode = 400;
    return error;
  }
  if (response.status === 504) {
    const error = new Error('The OpenStreetMap search timed out. Try a smaller radius or a more specific category.');
    error.statusCode = 504;
    return error;
  }
  if (response.status >= 500) {
    const error = new Error('OpenStreetMap (Overpass) is temporarily unavailable. Please try again shortly.');
    error.statusCode = 502;
    return error;
  }
  const error = new Error('OpenStreetMap search failed. Please try again.');
  error.statusCode = 502;
  return error;
}

async function runOverpassQuery(query) {
  let response;
  try {
    response = await fetch(overpassUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': userAgent(),
      },
      body: new URLSearchParams({ data: query }).toString(),
      signal: AbortSignal.timeout(OVERPASS_TIMEOUT_MS),
    });
  } catch (error) {
    if (error?.name === 'TimeoutError') {
      const timeoutError = new Error('The OpenStreetMap search timed out. Try a smaller radius or a more specific category.');
      timeoutError.statusCode = 504;
      throw timeoutError;
    }
    const unreachable = new Error('OpenStreetMap (Overpass) could not be reached. Check the server connection and try again.');
    unreachable.statusCode = 502;
    throw unreachable;
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) throw overpassError(response, trimText(payload?.remark, 200));
  if (!payload || !Array.isArray(payload.elements)) {
    const error = new Error('OpenStreetMap returned an unreadable response. Please try again.');
    error.statusCode = 502;
    throw error;
  }
  return { elements: payload.elements, remark: trimText(payload.remark, 200) };
}

function composeAddress(tags) {
  const full = trimText(tags['addr:full']) || trimText(tags['addr:housename']);
  if (full) return full;
  return [
    trimText(tags['addr:housenumber'], 24),
    trimText(tags['addr:street'], 120),
    trimText(tags['addr:suburb'] || tags['addr:neighbourhood'] || tags['addr:quarter'], 80),
    trimText(tags['addr:city'] || tags['addr:town'] || tags['addr:village'], 80),
    trimText(tags['addr:postcode'], 20),
  ].filter(Boolean).join(', ');
}

// Only http(s) links without embedded credentials are ever surfaced.
function safeWebsite(value) {
  const text = trimText(value, 2_000);
  if (!text) return '';
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch {
    return '';
  }
}

function normalizeOsmElement(element, { matched, center, fallbackCity }) {
  const type = element?.type;
  const id = Number(element?.id);
  if (!['node', 'way', 'relation'].includes(type) || !Number.isInteger(id) || id <= 0) return null;
  const tags = element?.tags && typeof element.tags === 'object' ? element.tags : {};
  const name = trimText(tags.name, 160);
  // An unnamed OSM object is not a usable lead; skip rather than invent a name.
  if (!name) return null;

  const lat = type === 'node' ? Number(element.lat) : Number(element.center?.lat);
  const lon = type === 'node' ? Number(element.lon) : Number(element.center?.lon);
  const hasPoint = Number.isFinite(lat) && Number.isFinite(lon);

  return {
    id: `osm-${type}/${id}`,
    placeId: `osm-${type}/${id}`,
    name,
    category: describeOsmCategory(tags, matched),
    address: composeAddress(tags),
    city: trimText(tags['addr:city'] || tags['addr:town'] || tags['addr:village'] || tags['addr:suburb'], 80) || fallbackCity,
    phone: trimText(tags.phone || tags['contact:phone'] || tags['contact:mobile'], 40),
    internationalPhoneNumber: '',
    website: safeWebsite(tags.website || tags['contact:website'] || tags.url),
    // OpenStreetMap carries no ratings, review counts, or operational status.
    // These stay empty rather than being estimated.
    rating: null,
    reviews: 0,
    mapsUrl: `https://www.openstreetmap.org/${type}/${id}`,
    businessStatus: 'UNKNOWN',
    source: FREE_SOURCE,
    demo: false,
    openingHours: trimText(tags.opening_hours, 120),
    cuisine: trimText(tags.cuisine, 120),
    osmType: type,
    osmId: id,
    distanceKm: hasPoint ? Math.round(haversineKm(center.latitude, center.longitude, lat, lon) * 10) / 10 : null,
  };
}

export async function searchOpenStreetMap({ category, location, radiusKm, maxResults, latitude, longitude }) {
  const cap = Math.min(MAX_RESULTS, Math.max(1, Number(maxResults) || 10));
  const radiusM = Math.min(MAX_RADIUS_M, Math.max(MIN_RADIUS_M, Math.round(Number(radiusKm) * 1_000)));
  const warnings = [];
  const matched = matchOsmCategory(category);
  const tokens = matched.matched ? [] : osmNameTokens(category);
  if (!matched.matched) {
    warnings.push(`No fixed OpenStreetMap tag matches “${category}”. Results are businesses whose name contains ${tokens.join(', ') || 'the search terms'}; verify relevance manually.`);
  }

  let center;
  let geocodingRequests = 0;
  let resolvedName = '';
  const explicitLat = Number(latitude);
  const explicitLon = Number(longitude);
  if (Number.isFinite(explicitLat) && Number.isFinite(explicitLon)) {
    center = { latitude: explicitLat, longitude: explicitLon };
  } else {
    const geocoding = await resolveLocationCenter(location);
    geocodingRequests = 1;
    if (!geocoding.center) throw geocodeFailure(geocoding.status, location);
    center = geocoding.center;
    resolvedName = geocoding.displayName || '';
    // Mirrors the Google path: the radius is a distance from a resolved point,
    // never an official administrative boundary.
    warnings.push(`Searched around the OpenStreetMap match for “${location}”. The radius is a distance from that point, not a strict city boundary.`);
  }

  const query = buildOverpassQuery({ filters: matched.filters, tokens, radiusM, center, limit: cap * OVERFETCH_FACTOR });
  if (!query) {
    const error = new Error('Add an industry/category to search OpenStreetMap.');
    error.statusCode = 400;
    throw error;
  }

  const { elements, remark } = await runOverpassQuery(query);
  if (remark && /runtime error|timed out|out of memory/i.test(remark)) {
    warnings.push('OpenStreetMap reported a query problem; some results may be missing.');
  }

  const unique = new Map();
  for (const element of elements) {
    const lead = normalizeOsmElement(element, { matched, center, fallbackCity: String(location || '').trim() });
    if (lead && !unique.has(lead.placeId)) unique.set(lead.placeId, lead);
  }

  const results = [...unique.values()]
    .sort((a, b) => (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY))
    .slice(0, cap);

  warnings.push('OpenStreetMap is community-maintained: listings may be incomplete, out of date, or missing websites and phone numbers. Absence of a website is not proof a business lacks one.');

  return {
    results,
    warnings,
    requests: 1,
    geocodingRequests,
    attribution: OSM_ATTRIBUTION,
    licenseUrl: OSM_LICENSE_URL,
    matchedCategory: matched.matched ? matched.label : '',
    queriedTags: matched.matched ? matched.filters.map(([key, value]) => `${key}=${value}`) : tokens,
    resolvedLocation: resolvedName,
    center,
  };
}
