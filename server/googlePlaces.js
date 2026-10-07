const PLACES_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';
const GEOCODING_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const PLACES_TIMEOUT_MS = 12_000;
const GEOCODE_TIMEOUT_MS = 5_000;

// Explicit masks only. Search and details share the same small set of fields;
// nextPageToken is included solely to retrieve up to the requested result cap.
const SEARCH_FIELD_MASK = [
  'nextPageToken',
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.websiteUri',
  'places.rating',
  'places.userRatingCount',
  'places.googleMapsUri',
  'places.primaryTypeDisplayName',
  'places.businessStatus',
].join(',');
const DETAILS_FIELD_MASK = [
  'id', 'displayName', 'formattedAddress', 'nationalPhoneNumber', 'internationalPhoneNumber', 'websiteUri',
  'rating', 'userRatingCount', 'googleMapsUri', 'primaryTypeDisplayName', 'businessStatus',
].join(',');

function apiError(status, action = 'search') {
  const error = new Error(status === 429
    ? 'Google Places quota or rate limit reached. Check Google Cloud billing and quotas, then try again.'
    : status === 404 && action === 'details'
      ? 'Google no longer has this saved place ID. Search again to refresh the lead.'
      : `Google Places ${action} failed. Check that Places API (New) is enabled and the server key is authorized.`);
  error.statusCode = status === 429 ? 429 : status === 404 ? 404 : 502;
  return error;
}

async function resolveRadiusCenter(location, apiKey) {
  const url = new URL(GEOCODING_URL);
  url.searchParams.set('address', location);
  // Geocoding requires a query key; this URL is only ever used server-side.
  url.searchParams.set('key', apiKey);
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(GEOCODE_TIMEOUT_MS) });
    if (!response.ok) return { center: null, status: `HTTP_${response.status}` };
    const payload = await response.json();
    const point = payload?.status === 'OK' ? payload.results?.[0]?.geometry?.location : null;
    if (Number.isFinite(point?.lat) && Number.isFinite(point?.lng)) {
      return { center: { latitude: point.lat, longitude: point.lng }, status: 'OK' };
    }
    return { center: null, status: payload?.status || 'UNKNOWN' };
  } catch {
    return { center: null, status: 'UNREACHABLE' };
  }
}

function normalizePlace(place) {
  return {
    id: place.id,
    placeId: place.id,
    name: place.displayName?.text || 'Unnamed business',
    category: place.primaryTypeDisplayName?.text || (typeof place.primaryTypeDisplayName === 'string' ? place.primaryTypeDisplayName : ''),
    address: place.formattedAddress || '',
    city: '',
    phone: place.nationalPhoneNumber || place.internationalPhoneNumber || '',
    internationalPhoneNumber: place.internationalPhoneNumber || '',
    website: place.websiteUri || '',
    rating: Number.isFinite(place.rating) ? place.rating : null,
    reviews: Number.isFinite(place.userRatingCount) ? place.userRatingCount : 0,
    mapsUrl: place.googleMapsUri || '',
    businessStatus: place.businessStatus || 'UNKNOWN',
    source: 'google',
  };
}

async function readPlacesResponse(response, action) {
  if (!response.ok) {
    let payload;
    try { payload = await response.json(); } catch { payload = null; }
    const error = apiError(response.status, action);
    const status = payload?.error?.status;
    if (status === 'RESOURCE_EXHAUSTED') {
      error.statusCode = 429;
      error.message = 'Google Places quota or rate limit reached. Check Google Cloud billing and quotas, then try again.';
    } else if (response.status === 403 || status === 'PERMISSION_DENIED') {
      error.message = `Google Places ${action} was denied. Verify that Places API (New) is enabled, billing is active, and server-key restrictions allow this request.`;
    } else if (response.status === 400) {
      error.message = `Google Places rejected this ${action} request. Check the search fields and API configuration${payload?.error?.message ? `: ${String(payload.error.message).slice(0, 240)}` : '.'}`;
    } else if (response.status >= 500) {
      error.message = `Google Places is temporarily unavailable during ${action}. Please try again shortly.`;
    }
    throw error;
  }
  try {
    return await response.json();
  } catch {
    const error = new Error('Google Places returned an unreadable response. Please try again.');
    error.statusCode = 502;
    throw error;
  }
}

export async function searchGooglePlaces({ category, location, radiusKm, maxResults, apiKey }) {
  const cap = Math.min(50, Math.max(1, Number(maxResults) || 10));
  const warnings = [];
  let locationBias;
  if (radiusKm) {
    const geocoding = await resolveRadiusCenter(location, apiKey);
    if (geocoding.center) {
      locationBias = { circle: { center: geocoding.center, radius: Math.min(50_000, Math.max(1_000, Number(radiusKm) * 1_000)) } };
    } else if (geocoding.status === 'OVER_QUERY_LIMIT' || geocoding.status === 'RESOURCE_EXHAUSTED') {
      warnings.push('Google Geocoding quota or rate limit was reached; search still uses the location text without a radius bias.');
    } else if (geocoding.status === 'REQUEST_DENIED' || geocoding.status === 'HTTP_403') {
      warnings.push('Google Geocoding was denied. Enable/restrict the optional Geocoding API correctly; search still uses the location text without a radius bias.');
    } else {
      warnings.push('The location could not be geocoded for a radius bias. Results still use the location in the Text Search query.');
    }
    warnings.push('Google Text Search uses radius as a location bias, not a guaranteed boundary.');
  }

  const unique = new Map();
  const seenTokens = new Set();
  let pageToken;
  let requests = 0;
  const maxPages = Math.ceil(cap / 20);

  while (unique.size < cap && requests < maxPages) {
    const remaining = cap - unique.size;
    const body = {
      textQuery: `${category} in ${location}`,
      pageSize: Math.min(20, remaining),
      ...(locationBias ? { locationBias } : {}),
      ...(pageToken ? { pageToken } : {}),
    };
    let response;
    try {
      response = await fetch(PLACES_SEARCH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': SEARCH_FIELD_MASK,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(PLACES_TIMEOUT_MS),
      });
    } catch {
      const error = new Error('Google Places could not be reached. Check the server connection and try again.');
      error.statusCode = 502;
      throw error;
    }
    const payload = await readPlacesResponse(response, 'search');
    for (const place of payload.places || []) {
      if (place.id && !unique.has(place.id)) unique.set(place.id, normalizePlace(place));
      if (unique.size >= cap) break;
    }
    requests += 1;
    const nextToken = payload.nextPageToken;
    if (!nextToken || seenTokens.has(nextToken)) break;
    seenTokens.add(nextToken);
    pageToken = nextToken;
  }

  return { results: [...unique.values()], warnings, requests, geocodingRequests: radiusKm ? 1 : 0 };
}

export async function getGooglePlaceDetails({ placeId, apiKey }) {
  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`;
  let response;
  try {
    response = await fetch(url, {
      headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': DETAILS_FIELD_MASK },
      signal: AbortSignal.timeout(PLACES_TIMEOUT_MS),
    });
  } catch {
    const error = new Error('Google Places could not be reached. Check the server connection and try again.');
    error.statusCode = 502;
    throw error;
  }
  const place = await readPlacesResponse(response, 'details');
  return normalizePlace(place);
}
