// Free lead discovery on top of OpenStreetMap.
//
// This module is deliberately pure (no fetch, no React, no Node built-ins) so it
// can be imported by both the browser bundle and the Express server without
// duplicating the category allowlist that drives Overpass queries.

export const FREE_SOURCE = 'osm';

export const OSM_ATTRIBUTION = '© OpenStreetMap contributors';
export const OSM_LICENSE_URL = 'https://www.openstreetmap.org/copyright';

// Keys Overpass is allowed to query. Anything outside this list can never reach
// a query, so operator-supplied text cannot widen or rewrite the request.
export const OSM_BUSINESS_KEYS = ['amenity', 'shop', 'office', 'craft', 'leisure', 'tourism', 'healthcare'];

// Fixed category -> Overpass tag pairs. The first matching group wins.
const CATEGORY_GROUPS = [
  { keywords: ['restaurant', 'dining', 'eatery', 'kitchen'], label: 'Restaurant', filters: [['amenity', 'restaurant']] },
  { keywords: ['cafe', 'coffee', 'cafeteria'], label: 'Cafe', filters: [['amenity', 'cafe']] },
  { keywords: ['fast food', 'takeaway', 'food court'], label: 'Fast Food', filters: [['amenity', 'fast_food']] },
  { keywords: ['bar', 'pub', 'brewery'], label: 'Bar / Pub', filters: [['amenity', 'bar'], ['amenity', 'pub']] },
  { keywords: ['bakery', 'cake', 'patisserie'], label: 'Bakery', filters: [['shop', 'bakery']] },
  { keywords: ['dentist', 'dental'], label: 'Dentist', filters: [['amenity', 'dentist']] },
  { keywords: ['doctor', 'clinic', 'physician', 'general practitioner'], label: 'Clinic', filters: [['amenity', 'doctors'], ['amenity', 'clinic']] },
  // Listed before Hospital so "veterinary hospital" resolves to a vet practice.
  { keywords: ['veterinar', 'vet'], label: 'Veterinary', filters: [['amenity', 'veterinary']] },
  { keywords: ['hospital', 'nursing home'], label: 'Hospital', filters: [['amenity', 'hospital']] },
  { keywords: ['pharmacy', 'chemist', 'medical store'], label: 'Pharmacy', filters: [['amenity', 'pharmacy']] },
  { keywords: ['physiotherap', 'physio'], label: 'Physiotherapy', filters: [['healthcare', 'physiotherapist']] },
  { keywords: ['optician', 'optometr', 'eyewear', 'eye care'], label: 'Optician', filters: [['healthcare', 'optometrist'], ['shop', 'optician']] },
  { keywords: ['gym', 'fitness', 'health club'], label: 'Gym / Fitness Centre', filters: [['leisure', 'fitness_centre']] },
  { keywords: ['yoga', 'pilates'], label: 'Yoga / Pilates Studio', filters: [['leisure', 'fitness_centre'], ['leisure', 'sports_centre']] },
  { keywords: ['salon', 'hairdresser', 'beauty parlour', 'beauty parlor', 'spa'], label: 'Salon / Spa', filters: [['shop', 'hairdresser'], ['shop', 'beauty'], ['leisure', 'spa']] },
  // OSM models barbers as shop=hairdresser (often with male=yes); keep the
  // operator-facing label distinct so results stay readable.
  { keywords: ['barber'], label: 'Barber', filters: [['shop', 'hairdresser']] },
  { keywords: ['tattoo'], label: 'Tattoo Studio', filters: [['shop', 'tattoo']] },
  { keywords: ['hotel'], label: 'Hotel', filters: [['tourism', 'hotel']] },
  { keywords: ['guest house', 'homestay', 'hostel'], label: 'Guest House / Hostel', filters: [['tourism', 'guest_house'], ['tourism', 'hostel']] },
  { keywords: ['bank'], label: 'Bank', filters: [['amenity', 'bank']] },
  { keywords: ['atm'], label: 'ATM', filters: [['amenity', 'atm']] },
  { keywords: ['chartered accountant', 'accountant', 'ca firm', 'bookkeep', 'auditor'], label: 'Accountant', filters: [['office', 'accountant']] },
  { keywords: ['lawyer', 'advocate', 'attorney', 'legal', 'notary'], label: 'Lawyer', filters: [['office', 'lawyer']] },
  { keywords: ['real estate', 'realtor', 'property dealer', 'estate agent'], label: 'Real Estate Agent', filters: [['office', 'estate_agent']] },
  { keywords: ['insurance'], label: 'Insurance', filters: [['office', 'insurance']] },
  { keywords: ['architect'], label: 'Architect', filters: [['office', 'architect']] },
  { keywords: ['interior design', 'interior decorator'], label: 'Interior Designer', filters: [['shop', 'interior_decoration'], ['office', 'company']] },
  { keywords: ['software', 'it firm', 'it company', 'tech', 'web design', 'web develop', 'digital agency'], label: 'IT / Software Office', filters: [['office', 'it'], ['office', 'company']] },
  { keywords: ['coworking', 'co-working'], label: 'Coworking Space', filters: [['amenity', 'coworking_space']] },
  { keywords: ['school', 'playschool', 'preschool'], label: 'School', filters: [['amenity', 'school']] },
  { keywords: ['college', 'university', 'institute'], label: 'College / University', filters: [['amenity', 'college'], ['amenity', 'university']] },
  { keywords: ['library'], label: 'Library', filters: [['amenity', 'library']] },
  { keywords: ['supermarket', 'grocery', 'kirana'], label: 'Supermarket / Grocery', filters: [['shop', 'supermarket'], ['shop', 'convenience'], ['shop', 'grocery']] },
  { keywords: ['mall', 'shopping centre', 'shopping center'], label: 'Shopping Centre', filters: [['shop', 'mall']] },
  { keywords: ['clothing', 'boutique', 'garment', 'apparel', 'fashion'], label: 'Clothing Shop', filters: [['shop', 'clothes'], ['shop', 'boutique'], ['shop', 'fashion']] },
  { keywords: ['furniture'], label: 'Furniture Shop', filters: [['shop', 'furniture']] },
  { keywords: ['electronic', 'mobile shop', 'appliance'], label: 'Electronics Shop', filters: [['shop', 'electronics'], ['shop', 'mobile_phone']] },
  { keywords: ['hardware', 'building material', 'sanitary'], label: 'Hardware / Building Supplies', filters: [['shop', 'hardware'], ['shop', 'doityourself'], ['shop', 'trade']] },
  { keywords: ['florist', 'flower'], label: 'Florist', filters: [['shop', 'florist']] },
  { keywords: ['jeweller', 'jeweler', 'jewellery', 'jewelry'], label: 'Jeweller', filters: [['shop', 'jewelry']] },
  { keywords: ['car repair', 'garage', 'mechanic', 'automobile', 'car service'], label: 'Car Repair', filters: [['shop', 'car_repair']] },
  { keywords: ['car dealer', 'car showroom'], label: 'Car Dealer', filters: [['shop', 'car']] },
  { keywords: ['petrol', 'fuel', 'gas station'], label: 'Fuel Station', filters: [['amenity', 'fuel']] },
  { keywords: ['car wash'], label: 'Car Wash', filters: [['amenity', 'car_wash']] },
  { keywords: ['laundry', 'dry clean'], label: 'Laundry / Dry Cleaning', filters: [['shop', 'laundry'], ['shop', 'dry_cleaning']] },
  { keywords: ['travel agent', 'travel agency', 'tour operator'], label: 'Travel Agency', filters: [['shop', 'travel_agency'], ['office', 'travel_agent']] },
  { keywords: ['photograph', 'photo studio'], label: 'Photographer', filters: [['craft', 'photographer'], ['shop', 'photo']] },
  { keywords: ['printer', 'printing', 'stationery', 'xerox'], label: 'Printing / Stationery', filters: [['shop', 'stationery'], ['shop', 'copyshop'], ['craft', 'printer']] },
  { keywords: ['carpenter', 'woodwork'], label: 'Carpenter', filters: [['craft', 'carpenter']] },
  { keywords: ['electrician'], label: 'Electrician', filters: [['craft', 'electrician']] },
  { keywords: ['plumber', 'plumbing'], label: 'Plumber', filters: [['craft', 'plumber']] },
  { keywords: ['courier', 'post office'], label: 'Post / Courier', filters: [['amenity', 'post_office']] },
];

const CATEGORY_STOP_WORDS = new Set([
  'in', 'near', 'the', 'and', 'for', 'of', 'a', 'an', 'at', 'my', 'all', 'best', 'top',
  'business', 'businesses', 'local', 'company', 'companies', 'firm', 'firms', 'agency',
  'agencies', 'shop', 'shops', 'store', 'stores', 'service', 'services', 'center', 'centre',
]);

export function normalizeCategoryText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Keywords short enough to collide with unrelated words ("bar" inside "barber")
// are matched on word boundaries; everything else matches as a substring so
// plurals and stems ("accountants", "veterinary", "kitchens") still resolve.
const WHOLE_WORD_KEYWORDS = new Set(['bar', 'spa', 'atm', 'ca', 'it', 'vet']);

function containsPhrase(text, phrase) {
  return new RegExp(`(^| )${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`).test(text);
}

function keywordMatches(text, keyword) {
  return WHOLE_WORD_KEYWORDS.has(keyword) ? containsPhrase(text, keyword) : text.includes(keyword);
}

/**
 * Resolve free-text category input to a fixed set of Overpass tag filters.
 * Never returns user text: either a known allowlist group matched, or the
 * caller falls back to a strictly sanitised name search.
 */
export function matchOsmCategory(category) {
  const text = normalizeCategoryText(category);
  for (const group of CATEGORY_GROUPS) {
    if (group.keywords.some((keyword) => keywordMatches(text, keyword))) {
      return { matched: true, label: group.label, filters: group.filters, key: group.filters[0][0], value: group.filters[0][1] };
    }
  }
  return { matched: false, label: '', filters: [], key: '', value: '' };
}

/**
 * Strictly sanitised tokens for the fallback "search business names" path.
 * Tokens are alphanumeric only, which removes every Overpass/PCRE metacharacter.
 */
export function osmNameTokens(category) {
  const text = normalizeCategoryText(category);
  const tokens = text
    .split(' ')
    .filter(Boolean)
    .filter((token) => !CATEGORY_STOP_WORDS.has(token))
    .map((token) => (token.endsWith('s') && token.length > 3 ? token.slice(0, -1) : token));
  return [...new Set(tokens)].filter((token) => /^[a-z0-9]{2,30}$/.test(token)).slice(0, 4);
}

export function humanizeOsmValue(value) {
  return String(value || '')
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** Human label for an OSM element, preferring the matched category group. */
export function describeOsmCategory(tags, matched) {
  if (matched?.matched && matched.label) return matched.label;
  for (const key of OSM_BUSINESS_KEYS) {
    const value = tags?.[key];
    if (typeof value === 'string' && value.trim() && !value.includes(';')) {
      return humanizeOsmValue(value.trim());
    }
  }
  return 'Local business';
}

export function isOsmLead(lead) {
  return lead?.source === FREE_SOURCE;
}

/** Noun for the listing source a lead came from, used in evidence copy. */
export function listingSourceNoun(lead) {
  return isOsmLead(lead) ? 'OpenStreetMap' : 'Google';
}

export function freeSourceLabel(source) {
  if (source === FREE_SOURCE) return 'OpenStreetMap';
  if (source === 'manual') return 'Manual';
  if (source === 'demo') return 'Demo';
  if (source === 'google') return 'Google Places';
  return 'Unknown';
}

export function osmObjectUrl(placeId) {
  const match = /^osm-(node|way|relation)\/(\d+)$/.exec(String(placeId || ''));
  return match ? `https://www.openstreetmap.org/${match[1]}/${match[2]}` : '';
}

export const FREE_SEARCH_EXAMPLES = [
  'Restaurants in Pune',
  'Dental clinics in Pune',
  'Gyms in Pune',
  'Salons in Pune',
  'CA firms in Pune',
  'Real estate agencies in Pune',
];

/** Client-side validation for the free-search form, mirroring the server route. */
export function buildFreeSearchPayload(form = {}) {
  const category = String(form.category || '').trim();
  const location = String(form.city || form.location || '').trim();
  const radiusKm = Number(form.radiusKm);
  const maxResults = Number(form.maxResults);
  const errors = [];
  if (!category || category.length > 100) errors.push('Add an industry/category to search.');
  if (!location || location.length > 160) errors.push('Add a city or location to search.');
  if (!Number.isFinite(radiusKm) || radiusKm < 1 || radiusKm > 50) errors.push('Search radius must be between 1 and 50 km.');
  if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 50) errors.push('Maximum results must be between 1 and 50.');
  if (errors.length) return { valid: false, errors, payload: null };
  return { valid: true, errors: [], payload: { category, location, radiusKm, maxResults } };
}

/** Short, honest explanation of what the search will actually query. */
export function freeSearchHint(category) {
  const matched = matchOsmCategory(category);
  if (matched.matched) {
    const tags = matched.filters.map(([key, value]) => `${key}=${value}`).join(', ');
    return `Matches the OpenStreetMap tag${matched.filters.length === 1 ? '' : 's'} ${tags}.`;
  }
  const tokens = osmNameTokens(category);
  if (!tokens.length) return 'Add a category to search OpenStreetMap.';
  return `No fixed tag for this category; searching business names for “${tokens.join(' ')}”.`;
}
