import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOverpassQuery, searchOpenStreetMap } from '../server/overpass.js';

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const PUNE = { latitude: 18.5204, longitude: 73.8567 };

function nominatimPayload() {
  return [{ lat: '18.5204', lon: '73.8567', display_name: 'Pune, Maharashtra, India' }];
}

function overpassPayload(elements = []) {
  return { version: 0.6, generator: 'Overpass API', elements };
}

function element(overrides = {}) {
  return {
    type: 'node',
    id: 12345,
    lat: 18.5209,
    lon: 73.8571,
    tags: {
      name: 'Sample Dental Care',
      'amenity': 'dentist',
      'addr:street': 'MG Road',
      'addr:housenumber': '12',
      'addr:city': 'Pune',
      phone: '+91 20 1234 5678',
      website: 'https://sample-dental.example',
    },
    ...overrides,
  };
}

/** Installs a fetch stub; records every call so tests can assert on requests. */
function stubFetch(handler) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init, calls.length);
  };
  return {
    calls,
    restore: () => { globalThis.fetch = original; },
  };
}

test('query builder uses allowlisted tags and never interpolates category text', () => {
  const query = buildOverpassQuery({
    filters: [['amenity', 'dentist'], ['shop', 'bakery']],
    tokens: [],
    radiusM: 5000,
    center: PUNE,
    limit: 60,
  });
  assert.match(query, /^\[out:json\]\[timeout:25\];/);
  assert.match(query, /nwr\["amenity"="dentist"\]\(around:5000,18\.520400,73\.856700\);/);
  assert.match(query, /nwr\["shop"="bakery"\]\(around:5000,18\.520400,73\.856700\);/);
  assert.match(query, /out center 60;$/);
});

test('query builder rejects injected tag pairs and out-of-range coordinates', () => {
  const injected = buildOverpassQuery({
    filters: [['amenity"="restaurant"]);nwr["shop', 'all']],
    tokens: [],
    radiusM: 5000,
    center: PUNE,
    limit: 10,
  });
  assert.equal(injected, null);

  assert.equal(buildOverpassQuery({ filters: [['amenity', 'cafe']], radiusM: 5000, center: { latitude: 999, longitude: 0 }, limit: 5 }), null);
  assert.equal(buildOverpassQuery({ filters: [['amenity', 'cafe']], radiusM: 5000, center: { latitude: 0, longitude: 999 }, limit: 5 }), null);

  // A missing or nonsensical cap falls back to the default instead of emitting "out center 0".
  assert.match(buildOverpassQuery({ filters: [['amenity', 'cafe']], radiusM: 5000, center: PUNE, limit: 0 }), /out center 50;$/);
  assert.match(buildOverpassQuery({ filters: [['amenity', 'cafe']], radiusM: 5000, center: PUNE, limit: 'abc' }), /out center 50;$/);
});

test('fallback name search only emits alphanumeric regex tokens', () => {
  const query = buildOverpassQuery({
    filters: [],
    tokens: ['cloud', 'kitchen'],
    radiusM: 2000,
    center: PUNE,
    limit: 12,
  });
  assert.match(query, /nwr\["amenity"\]\["name"~"cloud\|kitchen",i\]\(around:2000,18\.520400,73\.856700\);/);
  assert.match(query, /nwr\["shop"\]\["name"~"cloud\|kitchen",i\]/);

  // Metacharacters are stripped by osmNameTokens, so nothing can escape the regex.
  const hostile = buildOverpassQuery({
    filters: [],
    tokens: ['.*'],
    radiusM: 2000,
    center: PUNE,
    limit: 12,
  });
  assert.equal(hostile, null);
});

test('radius is clamped to the supported 1–50 km window', () => {
  const query = buildOverpassQuery({ filters: [['amenity', 'cafe']], radiusM: 999_999, center: PUNE, limit: 5 });
  assert.match(query, /around:50000,/);
  const tiny = buildOverpassQuery({ filters: [['amenity', 'cafe']], radiusM: 1, center: PUNE, limit: 5 });
  assert.match(tiny, /around:1000,/);
});

test('search geocodes the city, queries Overpass, and normalises results', async () => {
  const stub = stubFetch((url, init) => {
    if (url.includes('nominatim')) return response(nominatimPayload());
    return response(overpassPayload([element()]));
  });
  try {
    const result = await searchOpenStreetMap({ category: 'Dental clinics', location: 'Pune', radiusKm: 10, maxResults: 10 });
    assert.equal(result.results.length, 1);
    const [lead] = result.results;
    assert.equal(lead.placeId, 'osm-node/12345');
    assert.equal(lead.name, 'Sample Dental Care');
    assert.equal(lead.category, 'Dentist');
    assert.equal(lead.city, 'Pune');
    assert.equal(lead.address, '12, MG Road, Pune');
    assert.equal(lead.phone, '+91 20 1234 5678');
    assert.equal(lead.website, 'https://sample-dental.example/');
    assert.equal(lead.mapsUrl, 'https://www.openstreetmap.org/node/12345');
    assert.equal(lead.source, 'osm');
    assert.equal(lead.businessStatus, 'UNKNOWN');
    assert.equal(result.geocodingRequests, 1);
    assert.equal(result.requests, 1);
    assert.equal(result.attribution, '© OpenStreetMap contributors');
    assert.equal(result.matchedCategory, 'Dentist');
    // Two HTTP calls: Nominatim then Overpass.
    assert.equal(stub.calls.length, 2);
    assert.match(stub.calls[1].init.body, /data=%5Bout%3Ajson%5D/);
    // OpenStreetMap has no ratings; nothing is invented.
    assert.equal(lead.rating, null);
    assert.equal(lead.reviews, 0);
  } finally {
    stub.restore();
  }
});

test('never fabricates ratings, review counts, or operational status', async () => {
  const stub = stubFetch((url) => (url.includes('nominatim') ? response(nominatimPayload()) : response(overpassPayload([
    element({ id: 1, tags: { name: 'No Ratings Cafe', amenity: 'cafe' } }),
    element({ id: 2, type: 'way', lat: undefined, lon: undefined, center: { lat: 18.53, lon: 73.85 }, tags: { name: 'Way Bakery', shop: 'bakery' } }),
  ]))));
  try {
    const { results } = await searchOpenStreetMap({ category: 'cafes', location: 'Pune', radiusKm: 5, maxResults: 10 });
    for (const lead of results) {
      assert.equal(lead.rating, null);
      assert.equal(lead.reviews, 0);
      assert.equal(lead.businessStatus, 'UNKNOWN');
    }
    assert.equal(results.length, 2);
    assert.equal(results.some((lead) => lead.placeId === 'osm-way/2'), true);
  } finally {
    stub.restore();
  }
});

test('unnamed OSM objects are skipped rather than given a placeholder name', async () => {
  const stub = stubFetch((url) => (url.includes('nominatim') ? response(nominatimPayload()) : response(overpassPayload([
    element({ id: 1, tags: { amenity: 'cafe' } }),
    element({ id: 2, tags: { name: '   ', amenity: 'cafe' } }),
    element({ id: 3, tags: { name: 'Named Cafe', amenity: 'cafe' } }),
  ]))));
  try {
    const { results } = await searchOpenStreetMap({ category: 'cafes', location: 'Pune', radiusKm: 2, maxResults: 10 });
    assert.deepEqual(results.map((lead) => lead.name), ['Named Cafe']);
  } finally {
    stub.restore();
  }
});

test('duplicate OSM objects are deduplicated and sorted by distance', async () => {
  const far = element({ id: 9, lat: 18.62, lon: 73.95, tags: { name: 'Far Cafe', amenity: 'cafe' } });
  const near = element({ id: 8, lat: 18.5205, lon: 73.8568, tags: { name: 'Near Cafe', amenity: 'cafe' } });
  const stub = stubFetch((url) => (url.includes('nominatim') ? response(nominatimPayload()) : response(overpassPayload([far, near, far]))));
  try {
    const { results } = await searchOpenStreetMap({ category: 'cafes', location: 'Pune', radiusKm: 25, maxResults: 5 });
    assert.deepEqual(results.map((lead) => lead.name), ['Near Cafe', 'Far Cafe']);
    assert.equal(results[0].distanceKm < results[1].distanceKm, true);
  } finally {
    stub.restore();
  }
});

test('result count is capped at the requested maximum', async () => {
  const many = Array.from({ length: 12 }, (_, i) => element({ id: 100 + i, tags: { name: `Cafe ${i}`, amenity: 'cafe' } }));
  const stub = stubFetch((url) => (url.includes('nominatim') ? response(nominatimPayload()) : response(overpassPayload(many))));
  try {
    const { results } = await searchOpenStreetMap({ category: 'cafes', location: 'Pune', radiusKm: 10, maxResults: 5 });
    assert.equal(results.length, 5);
  } finally {
    stub.restore();
  }
});

test('invalid website values are dropped instead of rendered as links', async () => {
  const stub = stubFetch((url) => (url.includes('nominatim') ? response(nominatimPayload()) : response(overpassPayload([
    element({ id: 1, tags: { name: 'Javascript Cafe', amenity: 'cafe', website: 'javascript:alert(1)' } }),
    element({ id: 2, tags: { name: 'Creds Cafe', amenity: 'cafe', website: 'https://user:pass@example.test/' } }),
    element({ id: 3, tags: { name: 'Hostless Cafe', amenity: 'cafe', website: 'example.test' } }),
  ]))));
  try {
    const { results } = await searchOpenStreetMap({ category: 'cafes', location: 'Pune', radiusKm: 5, maxResults: 10 });
    const byName = Object.fromEntries(results.map((lead) => [lead.name, lead.website]));
    assert.equal(byName['Javascript Cafe'], '');
    assert.equal(byName['Creds Cafe'], '');
    assert.equal(byName['Hostless Cafe'], 'https://example.test/');
  } finally {
    stub.restore();
  }
});

test('unmatched categories fall back to a name search and warn the operator', async () => {
  const stub = stubFetch((url) => (url.includes('nominatim') ? response(nominatimPayload()) : response(overpassPayload([element()]))));
  try {
    const result = await searchOpenStreetMap({ category: 'artisanal cheesemongers', location: 'Pune', radiusKm: 5, maxResults: 10 });
    assert.equal(result.matchedCategory, '');
    assert.deepEqual(result.queriedTags, ['artisanal', 'cheesemonger']);
    assert.equal(result.warnings.some((warning) => /No fixed OpenStreetMap tag matches/.test(warning)), true);
    assert.match(stub.calls[1].init.body, /name%22%7E%22artisanal%7Ccheesemonger%22%2Ci/);
  } finally {
    stub.restore();
  }
});

test('explicit coordinates skip the geocoding request', async () => {
  const stub = stubFetch((url) => (url.includes('nominatim') ? response(nominatimPayload()) : response(overpassPayload([element()]))));
  try {
    const result = await searchOpenStreetMap({ category: 'cafes', location: 'Pune', radiusKm: 5, maxResults: 10, latitude: 18.5204, longitude: 73.8567 });
    assert.equal(result.geocodingRequests, 0);
    assert.equal(stub.calls.length, 1);
  } finally {
    stub.restore();
  }
});

test('an unresolvable location returns an actionable 404', async () => {
  const stub = stubFetch((url) => (url.includes('nominatim') ? response([]) : response(overpassPayload([]))));
  try {
    await assert.rejects(
      searchOpenStreetMap({ category: 'cafes', location: 'Nowhereville', radiusKm: 5, maxResults: 10 }),
      (error) => error.statusCode === 404 && /No place matching/.test(error.message),
    );
  } finally {
    stub.restore();
  }
});

test('geocoder and Overpass failures map to useful status codes', async () => {
  const unreachable = stubFetch(() => { throw new Error('network down'); });
  try {
    await assert.rejects(
      searchOpenStreetMap({ category: 'cafes', location: 'Pune', radiusKm: 5, maxResults: 10 }),
      (error) => error.statusCode === 502 && /could not be reached/i.test(error.message),
    );
  } finally {
    unreachable.restore();
  }

  const rateLimited = stubFetch((url) => (url.includes('nominatim') ? response({}, 429) : response({}, 429)));
  try {
    await assert.rejects(
      searchOpenStreetMap({ category: 'cafes', location: 'Pune', radiusKm: 5, maxResults: 10 }),
      (error) => error.statusCode === 429 && /rate limit/i.test(error.message),
    );
  } finally {
    rateLimited.restore();
  }

  const overpassBusy = stubFetch((url) => (url.includes('nominatim') ? response(nominatimPayload()) : response({ remark: 'runtime error' }, 429)));
  try {
    await assert.rejects(
      searchOpenStreetMap({ category: 'cafes', location: 'Pune', radiusKm: 5, maxResults: 10 }),
      (error) => error.statusCode === 429 && /Overpass/.test(error.message),
    );
  } finally {
    overpassBusy.restore();
  }

  const gatewayTimeout = stubFetch((url) => (url.includes('nominatim') ? response(nominatimPayload()) : response({}, 504)));
  try {
    await assert.rejects(
      searchOpenStreetMap({ category: 'cafes', location: 'Pune', radiusKm: 50, maxResults: 50 }),
      (error) => error.statusCode === 504 && /smaller radius/.test(error.message),
    );
  } finally {
    gatewayTimeout.restore();
  }
});

test('missing category produces no query at all', async () => {
  const stub = stubFetch((url) => (url.includes('nominatim') ? response(nominatimPayload()) : response(overpassPayload([]))));
  try {
    await assert.rejects(
      searchOpenStreetMap({ category: '   ', location: 'Pune', radiusKm: 5, maxResults: 10, latitude: 18.5, longitude: 73.8 }),
      (error) => error.statusCode === 400 && /industry\/category/.test(error.message),
    );
    assert.equal(stub.calls.length, 0);
  } finally {
    stub.restore();
  }
});
