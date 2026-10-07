import test from 'node:test';
import assert from 'node:assert/strict';
import { getGooglePlaceDetails, searchGooglePlaces } from '../server/googlePlaces.js';

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test('Text Search paginates to 50, applies explicit masks, and deduplicates IDs', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init = {}) => {
    requests.push({ url: String(url), init });
    const body = JSON.parse(init.body);
    const pages = {
      first: [...Array.from({ length: 19 }, (_, i) => i), 18],
      second: Array.from({ length: 20 }, (_, i) => i + 19),
      third: Array.from({ length: 11 }, (_, i) => i + 39),
    };
    const page = body.pageToken === 'token-2' ? 'second' : body.pageToken === 'token-3' ? 'third' : 'first';
    const ids = pages[page];
    const nextPageToken = page === 'first' ? 'token-2' : page === 'second' ? 'token-3' : undefined;
    return response({
      places: ids.map((id) => ({
        id: `place-${id}`,
        displayName: { text: `Business ${id}` },
        formattedAddress: `${id} Main Road`,
        nationalPhoneNumber: id === 0 ? '+91 2012345678' : undefined,
        websiteUri: id === 1 ? 'https://business.example' : undefined,
        rating: id === 2 ? 4.6 : undefined,
        userRatingCount: id === 2 ? 120 : undefined,
        googleMapsUri: `https://maps.google.com/?q=${id}`,
        primaryTypeDisplayName: { text: 'Cafe' },
        businessStatus: 'OPERATIONAL',
      })),
      ...(nextPageToken ? { nextPageToken } : {}),
    });
  };
  try {
    const result = await searchGooglePlaces({ category: 'cafes', location: 'Pune', radiusKm: 0, maxResults: 50, apiKey: 'server-secret' });
    assert.equal(result.results.length, 50);
    assert.equal(result.requests, 3);
    assert.equal(new Set(result.results.map((place) => place.placeId)).size, 50);
    assert.deepEqual(requests.map(({ init }) => JSON.parse(init.body).pageSize), [20, 20, 11]);
    assert.equal(requests[1].init.headers['X-Goog-FieldMask'].includes('*'), false);
    assert.match(requests[0].init.headers['X-Goog-FieldMask'], /nextPageToken,places\.id/);
    assert.equal(requests[0].init.headers['X-Goog-Api-Key'], 'server-secret');
    assert.equal(result.results[0].phone, '+91 2012345678');
    assert.equal(result.results[2].reviews, 120);
    assert.equal(result.results[2].category, 'Cafe');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Place Details uses a minimal explicit field mask', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, init = {}) => {
    request = { url: String(url), init };
    return response({ id: 'place/123', displayName: { text: 'A business' }, formattedAddress: 'Pune', businessStatus: 'OPERATIONAL' });
  };
  try {
    const result = await getGooglePlaceDetails({ placeId: 'place/123', apiKey: 'server-secret' });
    assert.equal(result.placeId, 'place/123');
    assert.match(request.url, /place%2F123$/);
    assert.match(request.init.headers['X-Goog-FieldMask'], /formattedAddress/);
    assert.equal(request.init.headers['X-Goog-FieldMask'].includes('*'), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('quota and API permission failures return useful actionable errors', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => response({ error: { status: 'RESOURCE_EXHAUSTED', message: 'quota exceeded' } }, 403);
    await assert.rejects(
      searchGooglePlaces({ category: 'cafes', location: 'Pune', radiusKm: 0, maxResults: 5, apiKey: 'server-secret' }),
      (error) => error.statusCode === 429 && /quota|rate limit/i.test(error.message),
    );
    globalThis.fetch = async () => response({ error: { status: 'PERMISSION_DENIED' } }, 403);
    await assert.rejects(
      searchGooglePlaces({ category: 'cafes', location: 'Pune', radiusKm: 0, maxResults: 5, apiKey: 'server-secret' }),
      (error) => error.statusCode === 502 && /Places API \(New\).*billing/i.test(error.message),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
