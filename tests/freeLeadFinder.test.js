import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FREE_SOURCE,
  buildFreeSearchPayload,
  describeOsmCategory,
  freeSearchHint,
  freeSourceLabel,
  humanizeOsmValue,
  isOsmLead,
  listingSourceNoun,
  matchOsmCategory,
  osmNameTokens,
  osmObjectUrl,
} from '../src/lib/freeLeadFinder.js';
import { manualLeadSourceLabel } from '../src/lib/manualLeads.js';
import { opportunityReason, scoreOpportunity } from '../src/lib/qualification.js';
import { recommendService, whyThisLead } from '../src/lib/leadUtils.js';
import { buildWorkflowCsv } from '../src/lib/csv.js';

test('known categories resolve to fixed Overpass tag filters', () => {
  assert.deepEqual(matchOsmCategory('Dental clinics').filters, [['amenity', 'dentist']]);
  assert.deepEqual(matchOsmCategory('Restaurants').filters, [['amenity', 'restaurant']]);
  assert.deepEqual(matchOsmCategory('Gyms').filters, [['leisure', 'fitness_centre']]);
  assert.deepEqual(matchOsmCategory('CA firms').filters, [['office', 'accountant']]);
  assert.deepEqual(matchOsmCategory('Real estate agencies').filters, [['office', 'estate_agent']]);
  // Accents and casing must not break matching.
  assert.equal(matchOsmCategory('Cafés').filters[0][1], 'cafe');
});

test('short keywords match whole words so "bar" does not capture "barber"', () => {
  assert.equal(matchOsmCategory('Bar').matched, true);
  assert.equal(matchOsmCategory('Bar').filters[0][1], 'bar');
  assert.equal(matchOsmCategory('Barbers').filters[0][1], 'hairdresser');
});

test('unknown categories report no match for the name-search fallback', () => {
  assert.equal(matchOsmCategory('artisanal cheesemongers').matched, false);
  assert.deepEqual(matchOsmCategory('artisanal cheesemongers').filters, []);
  assert.equal(matchOsmCategory('').matched, false);
  assert.equal(matchOsmCategory(null).matched, false);
});

test('name tokens are alphanumeric so no regex metacharacter can reach Overpass', () => {
  assert.deepEqual(osmNameTokens('Cloud kitchens in Pune'), ['cloud', 'kitchen', 'pune']);
  assert.deepEqual(osmNameTokens('.*'), []);
  // Everything that is not a plain word is stripped, leaving only safe text.
  assert.deepEqual(osmNameTokens('a)"; DROP'), ['drop']);
  assert.deepEqual(osmNameTokens('Cafés & Bars'), ['cafe', 'bar']);
  for (const token of osmNameTokens('Widget (2024) Ltd.')) {
    assert.match(token, /^[a-z0-9]{2,30}$/);
  }
});

test('humanised labels and category descriptions stay readable', () => {
  assert.equal(humanizeOsmValue('car_repair'), 'Car Repair');
  assert.equal(describeOsmCategory({ shop: 'bakery' }, { matched: false }), 'Bakery');
  assert.equal(describeOsmCategory({ amenity: 'restaurant' }, matchOsmCategory('restaurants')), 'Restaurant');
  assert.equal(describeOsmCategory({}, { matched: false }), 'Local business');
});

test('hints explain exactly what will be queried', () => {
  assert.equal(freeSearchHint('Dental clinics'), 'Matches the OpenStreetMap tag amenity=dentist.');
  assert.match(freeSearchHint('Artisanal cheesemongers'), /searching business names/i);
  assert.match(freeSearchHint(''), /Add a category/i);
});

test('payload validation mirrors the server route limits', () => {
  assert.equal(buildFreeSearchPayload({ category: 'Cafes', city: 'Pune', radiusKm: '10', maxResults: '10' }).valid, true);
  assert.deepEqual(buildFreeSearchPayload({ category: 'Cafes', city: 'Pune', radiusKm: '10', maxResults: '10' }).payload, { category: 'Cafes', location: 'Pune', radiusKm: 10, maxResults: 10 });
  assert.equal(buildFreeSearchPayload({ category: '', city: 'Pune' }).valid, false);
  assert.equal(buildFreeSearchPayload({ category: 'Cafes', city: '' }).valid, false);
  assert.equal(buildFreeSearchPayload({ category: 'Cafes', city: 'Pune', radiusKm: '99', maxResults: '10' }).valid, false);
  assert.equal(buildFreeSearchPayload({ category: 'Cafes', city: 'Pune', radiusKm: '10', maxResults: '51' }).valid, false);
  assert.equal(buildFreeSearchPayload({ category: 'Cafes', city: 'Pune', radiusKm: '10', maxResults: '10.5' }).valid, false);
});

test('OSM identifiers round-trip to public OpenStreetMap links', () => {
  assert.equal(osmObjectUrl('osm-node/42'), 'https://www.openstreetmap.org/node/42');
  assert.equal(osmObjectUrl('osm-way/42'), 'https://www.openstreetmap.org/way/42');
  assert.equal(osmObjectUrl('osm-relation/42'), 'https://www.openstreetmap.org/relation/42');
  assert.equal(osmObjectUrl('ChIJ_google_place_id'), '');
  assert.equal(osmObjectUrl(''), '');
});

test('source labels cover the OpenStreetMap source', () => {
  assert.equal(freeSourceLabel(FREE_SOURCE), 'OpenStreetMap');
  assert.equal(freeSourceLabel('google'), 'Google Places');
  assert.equal(manualLeadSourceLabel(FREE_SOURCE), 'OpenStreetMap');
  assert.equal(manualLeadSourceLabel({ source: 'osm' }), 'OpenStreetMap');
  assert.equal(isOsmLead({ source: 'osm' }), true);
  assert.equal(isOsmLead({ source: 'google' }), false);
  assert.equal(listingSourceNoun({ source: 'osm' }), 'OpenStreetMap');
  assert.equal(listingSourceNoun({ source: 'google' }), 'Google');
});

const osmLead = {
  id: 'osm-node/4242',
  placeId: 'osm-node/4242',
  source: 'osm',
  name: 'Riverside Dental Care',
  category: 'Dentist',
  address: '12, MG Road, Pune',
  city: 'Pune',
  phone: '',
  website: '',
  rating: null,
  reviews: 0,
  mapsUrl: 'https://www.openstreetmap.org/node/4242',
  businessStatus: 'UNKNOWN',
};

test('OSM evidence copy names OpenStreetMap, never Google', () => {
  const reasons = whyThisLead(osmLead);
  const joined = reasons.map((reason) => reason.text).join(' ');
  assert.match(joined, /OpenStreetMap/);
  assert.doesNotMatch(joined, /Google/);
  // The absence of ratings must be explained rather than scored as poor.
  assert.match(joined, /not provide ratings/i);
  assert.equal(reasons.some((reason) => reason.key === 'osm-no-reputation'), true);
});

test('OSM service recommendations do not claim a Google profile', () => {
  const reasons = recommendService(osmLead).map((entry) => entry.reason).join(' ');
  assert.match(reasons, /OpenStreetMap/);
  assert.doesNotMatch(reasons, /Google/);
});

test('OSM scoring labels avoid Google-only wording', () => {
  const { signals } = scoreOpportunity(osmLead);
  const reviews = signals.find((signal) => signal.key === 'reviews');
  assert.match(reviews.label, /OpenStreetMap/);
  assert.equal(reviews.active, false);
  // A missing website is the one strong, genuinely observable signal.
  assert.equal(signals.find((signal) => signal.key === 'no-website').active, true);
  assert.match(opportunityReason(osmLead), /OpenStreetMap/i);
});

test('CSV export identifies OSM objects and omits OSM business content', () => {
  const csv = buildWorkflowCsv([osmLead], () => ({ status: 'NEW', notes: '', tags: [] }));
  assert.match(csv, /osm_object_osm_sourced/);
  assert.match(csv, /osm-node\/4242/);
  assert.match(csv, /"OpenStreetMap"/);
  // Listing content (business name) is not exported, matching the Google rule.
  assert.doesNotMatch(csv, /Riverside Dental Care/);
});
