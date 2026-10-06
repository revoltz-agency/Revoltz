#!/usr/bin/env node
/**
 * Google Places integration test against a MOCK Places API (New) server.
 *
 * This exercises the real live code path — endpoint construction, field mask,
 * API-key header, request body (textQuery / maxResultCount / locationBias),
 * response mapping, refresh-by-place_id and Google error translation — without
 * spending a real API call.
 *
 * Usage: node scripts/smoke-google-mock.mjs        (needs `npm run build` first)
 */

import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_PORT = Number(process.env.MOCK_APP_PORT || 3100);
const MOCK_PORT = Number(process.env.MOCK_PLACES_PORT || 3999);
const TEST_KEY = 'MOCK-PLACES-TEST-KEY-not-real';
const DATA_FILE = path.join(ROOT, 'data', 'smoke-google-mock.json');

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
const label = (n) => console.log(`\n▸ ${n}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Mock Places API (New) ────────────────────────────────────────────────
const captured = [];
let mode = 'ok';

function placeFixture(id, overrides = {}) {
  return {
    id,
    displayName: { text: overrides.name ?? 'Mock Spice Garden', languageCode: 'en' },
    formattedAddress: 'Shop 4, Mock Plaza, MG Road, Pune, Maharashtra 411001',
    nationalPhoneNumber: '020 4000 1234',
    internationalPhoneNumber: '+91 20 4000 1234',
    websiteUri: overrides.website === undefined ? 'https://mock-business.example' : overrides.website,
    rating: overrides.rating ?? 4.4,
    userRatingCount: overrides.reviews ?? 250,
    googleMapsUri: `https://www.google.com/maps/place/?q=place_id:${id}`,
    primaryType: 'restaurant',
    primaryTypeDisplayName: { text: 'Restaurant', languageCode: 'en' },
    types: ['restaurant', 'food', 'point_of_interest'],
    businessStatus: 'OPERATIONAL',
    currentOpeningHours: { openNow: true },
    priceLevel: 'PRICE_LEVEL_MODERATE',
  };
}

const mockServer = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (chunk) => {
    raw += chunk;
  });
  req.on('end', () => {
    const record = {
      url: req.url,
      method: req.method,
      headers: req.headers,
      body: raw ? JSON.parse(raw) : null,
    };
    captured.push(record);

    res.setHeader('Content-Type', 'application/json');

    if (mode === 'forbidden') {
      res.writeHead(403);
      res.end(
        JSON.stringify({
          error: {
            code: 403,
            message: 'The current API key is not valid for this request.',
            status: 'PERMISSION_DENIED',
          },
        }),
      );
      return;
    }
    if (mode === 'quota') {
      res.writeHead(429);
      res.end(JSON.stringify({ error: { code: 429, message: 'Quota exceeded', status: 'RESOURCE_EXHAUSTED' } }));
      return;
    }

    if (req.url === '/places:searchText' && req.method === 'POST') {
      res.writeHead(200);
      res.end(
        JSON.stringify({
          places: [
            placeFixture('ChIJMOCK0001'),
            placeFixture('ChIJMOCK0002', { name: 'Mock Dental Clinic', website: null, rating: 4.8, reviews: 96 }),
          ],
          nextPageToken: 'MOCK-TOKEN-PAGE-2',
        }),
      );
      return;
    }

    if (req.url?.startsWith('/places/') && req.method === 'GET') {
      res.writeHead(200);
      res.end(JSON.stringify(placeFixture(req.url.replace('/places/', ''), { rating: 4.9, reviews: 301, website: null })));
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: { code: 404, message: 'Not found', status: 'NOT_FOUND' } }));
  });
});

// ── App under test ───────────────────────────────────────────────────────
/** `npx next start` spawns a child; kill the whole process group. */
function killTree(child) {
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    try {
      child.kill('SIGTERM');
    } catch {
      /* already gone */
    }
  }
  setTimeout(() => {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      /* already gone */
    }
  }, 1500).unref?.();
}

async function waitForApp(url, timeoutMs = 45_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await sleep(400);
  }
  return false;
}

async function call(method, p, body) {
  const res = await fetch(`http://127.0.0.1:${APP_PORT}${p}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
}

async function main() {
  if (fs.existsSync(DATA_FILE)) fs.rmSync(DATA_FILE);
  await new Promise((r) => mockServer.listen(MOCK_PORT, '127.0.0.1', r));
  console.log(`Mock Places API listening on 127.0.0.1:${MOCK_PORT}`);

  const app = spawn('npx', ['next', 'start', '-p', String(APP_PORT), '-H', '127.0.0.1'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(APP_PORT),
      GOOGLE_PLACES_API_KEY: TEST_KEY,
      GOOGLE_PLACES_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`,
      GOOGLE_PLACES_REGION_CODE: 'IN',
      GOOGLE_PLACES_LANGUAGE_CODE: 'en',
      AGENCYOS_DATA_FILE: DATA_FILE,
      AGENCYOS_SEED_DEMO: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  let appLog = '';
  app.stdout.on('data', (d) => {
    appLog += d.toString();
  });
  app.stderr.on('data', (d) => {
    appLog += d.toString();
  });

  try {
    const ready = await waitForApp(`http://127.0.0.1:${APP_PORT}/api/status`);
    if (!ready) {
      console.error('App did not become ready.\n', appLog.slice(-3000));
      process.exit(2);
    }

    label('1. Live mode is reported when a key exists');
    const status = await call('GET', '/api/status');
    check('googlePlaces.configured === true', status.json?.config?.googlePlaces?.configured === true);
    check('demoMode === false', status.json?.config?.demoMode === false, JSON.stringify(status.json?.config?.demoMode));
    check('no Demo Mode banner', status.json?.banner === null, status.json?.banner);
    check('key value is never exposed', !status.text.includes(TEST_KEY));

    label('2. Text Search (New) request shape');
    const search = await call('POST', '/api/leads/search', { industry: 'Restaurants', city: 'Pune', maxResults: 5, demo: false });
    check('search returns 200', search.status === 200, `HTTP ${search.status}`);
    check('mode === live', search.json?.mode === 'live', search.json?.mode);
    const req1 = captured.find((c) => c.url === '/places:searchText');
    check('official searchText endpoint used', Boolean(req1), captured.map((c) => c.url).join(','));
    check('API key sent in X-Goog-Api-Key header', req1?.headers['x-goog-api-key'] === TEST_KEY);
    check('key never appears in the URL', !captured.some((c) => (c.url ?? '').includes(TEST_KEY)));
    const fieldMask = req1?.headers['x-goog-fieldmask'] ?? '';
    check('field mask is explicit (no wildcard)', fieldMask.length > 0 && !fieldMask.includes('*'), fieldMask);
    for (const required of [
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
      'places.currentOpeningHours.openNow',
    ]) {
      check(`  · field mask includes ${required}`, fieldMask.split(',').includes(required), fieldMask);
    }
    check('field mask stays minimal (<20 fields)', fieldMask.split(',').length <= 20, String(fieldMask.split(',').length));
    check('textQuery is "Restaurants in Pune"', req1?.body?.textQuery === 'Restaurants in Pune', req1?.body?.textQuery);
    check('maxResultCount honoured', req1?.body?.maxResultCount === 5, String(req1?.body?.maxResultCount));
    check('languageCode + regionCode sent', req1?.body?.languageCode === 'en' && req1?.body?.regionCode === 'IN');
    check('no locationBias without coordinates', req1?.body?.locationBias === undefined);
    check('notice explains radius was not applied', (search.json?.notices ?? []).length >= 1);

    label('3. Response mapping');
    const candidates = search.json?.candidates ?? [];
    check('two candidates returned', candidates.length === 2, String(candidates.length));
    const first = candidates[0]?.place;
    check('placeId mapped', first?.placeId === 'ChIJMOCK0001');
    check('displayName mapped', first?.displayName === 'Mock Spice Garden');
    check('address mapped', (first?.formattedAddress ?? '').includes('Pune'));
    check('phones mapped', first?.nationalPhoneNumber === '020 4000 1234' && first?.internationalPhoneNumber === '+91 20 4000 1234');
    check('website mapped', first?.websiteUri === 'https://mock-business.example');
    check('rating + review count mapped', first?.rating === 4.4 && first?.userRatingCount === 250);
    check('Google Maps URL mapped', (first?.googleMapsUri ?? '').includes('ChIJMOCK0001'));
    check('primary type display name preferred', first?.primaryType === 'Restaurant', first?.primaryType);
    check('business status + openNow mapped', first?.businessStatus === 'OPERATIONAL' && first?.openNow === true);
    check('price level mapped', first?.priceLevel === 'PRICE_LEVEL_MODERATE');
    check('source tagged google_places', first?.source === 'google_places');
    check('retrievedAt timestamped', Boolean(first?.retrievedAt));
    check('null website preserved as null', candidates[1]?.place?.websiteUri === null);
    check('preview score computed', typeof candidates[0]?.previewScore === 'number');

    label('4. Radius + coordinates produce a locationBias circle');
    await call('POST', '/api/leads/search', { industry: 'Gyms', city: 'Pune', radiusKm: 5, latitude: 18.5204, longitude: 73.8567, demo: false });
    const req2 = captured.filter((c) => c.url === '/places:searchText').at(-1);
    check('circle bias sent', req2?.body?.locationBias?.circle?.radius === 5000, JSON.stringify(req2?.body?.locationBias));
    check('centre coordinates sent', req2?.body?.locationBias?.circle?.center?.latitude === 18.5204);

    label('5. maxResults is clamped to the API limit (20)');
    await call('POST', '/api/leads/search', { industry: 'Salons', city: 'Pune', maxResults: 999, demo: false }).catch(() => null);
    const invalid = await call('POST', '/api/leads/search', { industry: 'Salons', city: 'Pune', maxResults: 999, demo: false });
    check('payload above 20 rejected by validation', invalid.status === 400, `HTTP ${invalid.status}`);

    label('6. Import + refresh by place_id preserves CRM data');
    const imported = await call('POST', '/api/leads/import', {
      candidates: [{ place: first }],
      query: search.json.query,
      isDemo: false,
    });
    const leadId = imported.json?.imported?.[0]?.id;
    check('lead imported', Boolean(leadId), leadId);
    check('imported lead is not flagged demo', imported.json?.imported?.[0]?.isDemo === false);
    await call('PATCH', `/api/leads/${leadId}`, { crm: { notes: 'Owner is interested in a chatbot.' }, status: 'RESEARCHED' });
    const refresh = await call('POST', `/api/leads/${leadId}/refresh`, {});
    check('refresh returns 200', refresh.status === 200, `HTTP ${refresh.status}`);
    const detailsReq = captured.find((c) => (c.url ?? '').startsWith('/places/') && c.method === 'GET');
    check('Place Details (New) endpoint used', Boolean(detailsReq), captured.map((c) => c.url).join(','));
    check('details field mask explicit', !(detailsReq?.headers['x-goog-fieldmask'] ?? '').includes('*'));
    check('details key header sent', detailsReq?.headers['x-goog-api-key'] === TEST_KEY);
    check('rating updated from Google', refresh.json?.lead?.place?.rating === 4.9, String(refresh.json?.lead?.place?.rating));
    check('reviews updated from Google', refresh.json?.lead?.place?.userRatingCount === 301);
    check('CRM notes preserved across refresh', refresh.json?.lead?.crm?.notes === 'Owner is interested in a chatbot.');
    check('status preserved across refresh', refresh.json?.lead?.status === 'RESEARCHED', refresh.json?.lead?.status);
    check('score recomputed after refresh', typeof refresh.json?.lead?.score?.score === 'number');
    check('website-change notice is honest', /refreshed/i.test(refresh.json?.notice ?? ''), refresh.json?.notice);
    check('stale analysis dropped when the website changed', refresh.json?.lead?.analysis === null || refresh.json?.lead?.analysis === undefined);

    label('7. Google errors are translated with actionable hints');
    mode = 'forbidden';
    const forbidden = await call('POST', '/api/leads/search', { industry: 'Gyms', city: 'Pune', demo: false });
    check('403 propagated', forbidden.status === 403, `HTTP ${forbidden.status}`);
    check('error code PERMISSION_DENIED', forbidden.json?.error?.code === 'PERMISSION_DENIED', forbidden.json?.error?.code);
    check('hint tells the user to enable Places API (New)', /Places API \(New\)/.test(forbidden.json?.error?.hint ?? ''), forbidden.json?.error?.hint);
    check('API key not leaked in the error body', !forbidden.text.includes(TEST_KEY));

    mode = 'quota';
    const quota = await call('POST', '/api/leads/search', { industry: 'Gyms', city: 'Pune', demo: false });
    check('429 propagated', quota.status === 429 || quota.status === 502, `HTTP ${quota.status}`);
    check('quota hint returned', /quota|rate limit/i.test(quota.json?.error?.hint ?? ''), quota.json?.error?.hint);
    mode = 'ok';

    label('8. Live lead pages render with attribution');
    const page = await fetch(`http://127.0.0.1:${APP_PORT}/leads/${leadId}`);
    const html = await page.text();
    check('lead page renders', page.status === 200, `HTTP ${page.status}`);
    check('page credits Google Places API (New)', html.includes('Google Places API (New)'));
    check('page shows the place id', html.includes('ChIJMOCK0001'));
    check('no key material in HTML', !html.includes(TEST_KEY));
    const findPage = await fetch(`http://127.0.0.1:${APP_PORT}/find`);
    const findHtml = await findPage.text();
    check('find page has no Demo Mode banner in live mode', !findHtml.includes('Google Places API not configured'));

    label('9. Isolation from the main datastore');
    check('a separate data file was used', fs.existsSync(DATA_FILE), DATA_FILE);
    const written = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    check('only the imported lead is stored', written.leads.length === 1, String(written.leads.length));
    check('no demo records seeded', written.leads.every((l) => l.isDemo === false));
    check('no secrets written to disk', !fs.readFileSync(DATA_FILE, 'utf8').includes(TEST_KEY));
  } finally {
    killTree(app);
    await sleep(400);
    mockServer.close();
    if (fs.existsSync(DATA_FILE)) fs.rmSync(DATA_FILE);
  }

  console.log('\n──────────────────────────────────────────');
  console.log(`Passed: ${passed}   Failed: ${failed}`);
  if (failures.length) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  • ${f}`);
  }
  console.log('──────────────────────────────────────────');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Mock Google smoke run crashed:', err);
  process.exit(2);
});
