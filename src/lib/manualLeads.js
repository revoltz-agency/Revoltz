export const MANUAL_LEAD_FIELDS = [
  'name', 'category', 'city', 'website', 'phone', 'email', 'mapsUrl', 'address',
  'rating', 'reviews', 'instagram', 'facebook', 'notes',
];

export const MANUAL_FIELD_LABELS = {
  name: 'Business Name',
  category: 'Industry',
  city: 'City',
  website: 'Website',
  phone: 'Phone',
  email: 'Email',
  mapsUrl: 'Google Maps URL',
  address: 'Address',
  rating: 'Rating',
  reviews: 'Review Count',
  instagram: 'Instagram',
  facebook: 'Facebook',
  notes: 'Notes',
};

const MAX_MANUAL_CSV_ROWS = 1000;

const EMPTY_VALUES = Object.freeze({
  name: '', category: '', city: '', website: '', phone: '', email: '', mapsUrl: '', address: '',
  rating: '', reviews: '', instagram: '', facebook: '', notes: '',
});

const HEADER_ALIASES = {
  name: ['businessname', 'business', 'businessnameorname', 'company', 'companyname', 'name', 'leadname', 'title', 'businesstitle', 'business_title', 'placename', 'placetitle', 'storename', 'shopname', 'restaurantname', 'venuename'],
  category: ['industry', 'category', 'businesscategory', 'type'],
  city: ['city', 'town', 'locality', 'cityname', 'district', 'area', 'locationcity'],
  website: ['website', 'websiteurl', 'businesswebsite', 'site', 'url'],
  phone: ['phone', 'phonenumber', 'telephone', 'mobile', 'businessphone'],
  email: ['email', 'emailaddress', 'businessemail'],
  mapsUrl: ['googlemapsurl', 'googlemapslink', 'googlemaps', 'mapsurl', 'mapslink', 'mapurl'],
  address: ['address', 'fulladdress', 'streetaddress', 'location', 'businesslocation', 'locationaddress'],
  rating: ['rating', 'googlerating', 'businessrating'],
  reviews: ['reviewcount', 'reviews', 'reviews_count', 'numberofreviews', 'useratingcount'],
  instagram: ['instagram', 'instagramurl', 'instagramprofile'],
  facebook: ['facebook', 'facebookurl', 'facebookprofile'],
  notes: ['notes', 'note', 'comments'],
};

const TWO_PART_PUBLIC_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.au', 'net.au', 'org.au', 'edu.au',
  'co.in', 'firm.in', 'net.in', 'org.in', 'gen.in', 'ind.in', 'com.in',
  'co.nz', 'net.nz', 'org.nz', 'co.za', 'org.za', 'com.sg', 'com.my', 'com.br',
  'com.mx', 'com.cn', 'com.hk', 'com.tw', 'co.jp', 'co.kr', 'com.tr', 'com.ar',
]);

function isMissing(value) {
  const text = String(value ?? '').trim();
  return !text || /^(?:not provided|n\/?a|none|null|unknown|-)$/i.test(text);
}

function cleanText(value, maxLength = 500) {
  if (isMissing(value)) return '';
  return String(value).trim().slice(0, maxLength);
}

function normalizeUrl(value, field, errors) {
  const text = cleanText(value, 2048);
  if (!text) return '';
  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withProtocol);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) {
      errors[field] = `${MANUAL_FIELD_LABELS[field]} must be a public HTTP or HTTPS URL.`;
      return text;
    }
    return url.href;
  } catch {
    errors[field] = `Enter a valid URL for ${MANUAL_FIELD_LABELS[field]}.`;
    return text;
  }
}

export function normalizeManualInput(input = {}) {
  const values = { ...EMPTY_VALUES };
  values.name = cleanText(input.name ?? input.businessName, 160);
  values.category = cleanText(input.category ?? input.industry, 100);
  values.city = cleanText(input.city, 160);
  values.website = cleanText(input.website, 2048);
  values.phone = cleanText(input.phone, 64);
  values.email = cleanText(input.email, 254);
  values.mapsUrl = cleanText(input.mapsUrl ?? input.googleMapsUrl ?? input.google_maps_url, 2048);
  values.address = cleanText(input.address, 500);
  values.rating = cleanText(input.rating, 16);
  values.reviews = cleanText(input.reviews ?? input.reviewCount ?? input.review_count, 20);
  values.instagram = cleanText(input.instagram, 2048);
  values.facebook = cleanText(input.facebook, 2048);
  values.notes = cleanText(input.notes, 5000);
  return values;
}

export function validateManualLead(input = {}) {
  const values = normalizeManualInput(input);
  const errors = {};
  if (!values.name) errors.name = 'Business name is required.';

  values.website = normalizeUrl(values.website, 'website', errors);
  values.mapsUrl = normalizeUrl(values.mapsUrl, 'mapsUrl', errors);
  values.instagram = normalizeUrl(values.instagram, 'instagram', errors);
  values.facebook = normalizeUrl(values.facebook, 'facebook', errors);

  if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
    errors.email = 'Enter a valid email address or leave it blank.';
  }
  if (values.phone) {
    const digits = values.phone.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) errors.phone = 'Enter a phone number with 7–15 digits, or leave it blank.';
  }
  if (values.rating) {
    const rating = Number(values.rating);
    if (!Number.isFinite(rating) || rating < 0 || rating > 5) errors.rating = 'Rating must be a number from 0 to 5.';
    else values.rating = String(rating);
  }
  if (values.reviews) {
    const reviewText = values.reviews.replaceAll(',', '').replaceAll(' ', '');
    const reviews = Number(reviewText);
    if (!/^\d+$/.test(reviewText) || !Number.isSafeInteger(reviews) || reviews < 0) errors.reviews = 'Review count must be a non-negative whole number.';
    else values.reviews = String(reviews);
  }

  return { valid: Object.keys(errors).length === 0, errors, values };
}

function makeManualId() {
  try {
    if (globalThis.crypto?.randomUUID) return `manual-${globalThis.crypto.randomUUID()}`;
  } catch { /* Fall through for restricted browser contexts. */ }
  return `manual-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function createManualLead(input, options = {}) {
  const validation = validateManualLead(input);
  if (!validation.valid) {
    const error = new Error('Please correct the highlighted manual lead fields.');
    error.fields = validation.errors;
    throw error;
  }
  const values = validation.values;
  const id = typeof options === 'string' ? options : options.id || makeManualId();
  return {
    id,
    source: 'manual',
    demo: false,
    name: values.name,
    category: values.category,
    city: values.city,
    website: values.website,
    phone: values.phone,
    internationalPhoneNumber: values.phone.startsWith('+') ? values.phone : '',
    email: values.email,
    mapsUrl: values.mapsUrl,
    address: values.address,
    rating: values.rating === '' ? null : Number(values.rating),
    reviews: values.reviews === '' ? null : Number(values.reviews),
    instagram: values.instagram,
    facebook: values.facebook,
    notes: values.notes,
    businessStatus: 'UNKNOWN',
    initialCRM: { status: 'NEW', assignedService: 'Website', email: values.email, notes: values.notes },
  };
}

export function manualLeadSourceLabel(leadOrSource) {
  const source = typeof leadOrSource === 'string'
    ? leadOrSource
    : leadOrSource?.source || (leadOrSource?.demo ? 'demo' : 'google');
  if (source === 'manual') return 'Manual';
  if (source === 'google') return 'Google Places';
  if (source === 'osm') return 'OpenStreetMap';
  return 'Demo';
}

export function manualLeadFieldsForUpdate(input) {
  const validation = validateManualLead(input);
  if (!validation.valid) {
    const error = new Error('Please correct the highlighted manual lead fields.');
    error.fields = validation.errors;
    throw error;
  }
  const { values } = validation;
  const fields = {
    name: values.name,
    category: values.category,
    city: values.city,
  };
  for (const key of ['website', 'phone', 'mapsUrl', 'address', 'instagram', 'facebook']) {
    if (values[key]) fields[key] = values[key];
  }
  for (const key of ['rating', 'reviews']) {
    if (values[key] !== '') fields[key] = Number(values[key]);
  }
  return fields;
}

export function applyManualLeadUpdate(existing, input) {
  const fields = manualLeadFieldsForUpdate(input);
  const values = validateManualLead(input).values;
  const updated = {
    ...existing,
    ...fields,
    ...(Object.hasOwn(fields, 'phone') ? { internationalPhoneNumber: fields.phone.startsWith('+') ? fields.phone : '' } : {}),
    manualUserFields: [...new Set([...(existing?.manualUserFields || []), ...Object.keys(fields)])],
    // The existing source is retained: an update never relabels Google or demo data as manual.
    source: existing?.source || 'manual',
  };
  if (existing?.source === 'manual') {
    updated.initialCRM = {
      ...(existing.initialCRM || {}),
      ...(values.email ? { email: values.email } : {}),
      ...(values.notes ? { notes: values.notes } : {}),
    };
    if (values.email) updated.email = values.email;
    if (values.notes) updated.notes = values.notes;
  }
  return updated;
}

export function normalizeLeadName(value) {
  return cleanText(value, 500).toLowerCase().normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

export function normalizeLeadPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 7 ? digits.replace(/^0+/, '') : '';
}

export function normalizeWebsiteDomain(value) {
  const text = cleanText(value, 2048);
  if (!text) return '';
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(text) ? text : `https://${text}`);
    let host = url.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '').replace(/\.$/, '');
    if (!host || /^\d+(?:\.\d+){3}$/.test(host) || host.includes(':')) return '';
    const labels = host.split('.').filter(Boolean);
    const lastTwo = labels.slice(-2).join('.');
    const needed = TWO_PART_PUBLIC_SUFFIXES.has(lastTwo) ? 3 : 2;
    host = labels.slice(-needed).join('.');
    return host.includes('.') ? host : '';
  } catch { return ''; }
}

export function normalizeGoogleMapsUrl(value) {
  const text = cleanText(value, 2048);
  if (!text) return '';
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(text) ? text : `https://${text}`);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const params = [...url.searchParams.entries()]
      .filter(([key]) => ['q', 'query', 'place_id', 'placeid', 'cid', 'destination', 'api'].includes(key.toLowerCase()))
      .map(([key, item]) => [key.toLowerCase(), item.trim().toLowerCase()])
      .sort(([aKey, aValue], [bKey, bValue]) => aKey.localeCompare(bKey) || aValue.localeCompare(bValue));
    let path = url.pathname.replace(/\/+$/, '') || '/';
    path = path.toLowerCase();
    return `${host}${path}${params.length ? `?${new URLSearchParams(params).toString()}` : ''}`;
  } catch { return ''; }
}

function duplicateFields(lead) {
  const crm = lead?.initialCRM || {};
  return {
    mapsUrl: lead?.mapsUrl ?? lead?.googleMapsUrl ?? '',
    website: lead?.website ?? '',
    phone: lead?.phone ?? lead?.internationalPhoneNumber ?? '',
    name: lead?.name ?? lead?.businessName ?? '',
    city: lead?.city ?? '',
    address: lead?.address ?? '',
    email: lead?.email ?? crm.email ?? '',
  };
}

export function findManualLeadDuplicate(candidate, leads = []) {
  const candidateFields = duplicateFields(candidate);
  const candidateMaps = normalizeGoogleMapsUrl(candidateFields.mapsUrl);
  const candidateDomain = normalizeWebsiteDomain(candidateFields.website);
  const candidatePhone = normalizeLeadPhone(candidateFields.phone);
  const candidateName = normalizeLeadName(candidateFields.name);
  const candidateCity = normalizeLeadName(candidateFields.city);
  const checks = [
    ['mapsUrl', 'Google Maps URL'],
    ['domain', 'website domain'],
    ['phone', 'phone number'],
    ['name-city', 'normalized business name and city'],
  ];

  for (const [key, reason] of checks) {
    for (const lead of leads) {
      const existing = duplicateFields(lead);
      const match = key === 'mapsUrl'
        ? candidateMaps && candidateMaps === normalizeGoogleMapsUrl(existing.mapsUrl)
        : key === 'domain'
          ? candidateDomain && candidateDomain === normalizeWebsiteDomain(existing.website)
          : key === 'phone'
            ? candidatePhone && candidatePhone === normalizeLeadPhone(existing.phone)
            : candidateName && candidateCity
              && candidateName === normalizeLeadName(existing.name)
              && normalizeLeadName(`${existing.city} ${existing.address}`).includes(candidateCity);
      if (match) {
        return { lead, leadId: lead.placeId || lead.id, matchType: key, reason };
      }
    }
  }
  return null;
}

function normalizeHeader(value) {
  return String(value || '').replace(/^\uFEFF/, '').trim().toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');
}

export function detectCsvDelimiter(input) {
  const sample = String(input || '').split(/\r?\n/).slice(0, 5).filter(Boolean).join('\n');
  const candidates = [',', ';', '\\t', '|'];
  return candidates.sort((a, b) => {
    const count = (value, delimiter) => value.split(delimiter).length - 1;
    return count(sample, b) - count(sample, a);
  })[0] || ',';
}

export function parseCsv(text) {
  const input = String(text ?? '').replace(/^\uFEFF/, '');
  const delimiter = detectCsvDelimiter(input);
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  let line = 1;
  let rowStartLine = 1;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
        if (char === '\n') line += 1;
      }
      continue;
    }
    if (char === '"' && cell === '') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = '';
    } else if (char === '\r' || char === '\n') {
      row.push(cell);
      cell = '';
      if (row.some((item) => String(item).trim())) rows.push({ line: rowStartLine, cells: row });
      row = [];
      if (char === '\r' && input[index + 1] === '\n') index += 1;
      line += 1;
      rowStartLine = line;
    } else {
      cell += char;
    }
  }
  if (quoted) return { rows, error: 'CSV contains an unclosed quoted field.' };
  row.push(cell);
  if (row.some((item) => String(item).trim())) rows.push({ line: rowStartLine, cells: row });
  return { rows, error: '' };
}

export function parseManualLeadCsv(text) {
  const parsed = parseCsv(text);
  if (parsed.error) return { headers: [], rows: [], error: parsed.error };
  if (parsed.rows.length < 2) return { headers: [], rows: [], error: 'Add a header row and at least one lead row to the CSV.' };
  if (parsed.rows.length - 1 > MAX_MANUAL_CSV_ROWS) return { headers: [], rows: [], error: `A single CSV import can contain up to ${MAX_MANUAL_CSV_ROWS} lead rows.` };

  const headerRow = parsed.rows[0];
  const normalizedHeaders = headerRow.cells.map(normalizeHeader);
  const mapping = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const index = normalizedHeaders.findIndex((header) => aliases.includes(header));
    if (index >= 0) mapping[field] = index;
  }
  // Scrapers are inconsistent: if no recognized business-name header exists,
  // use the first non-obvious contact/location column as the name rather than
  // rejecting an otherwise usable CSV.
  if (!('name' in mapping)) {
    const fallbackNameIndex = normalizedHeaders.findIndex((header, index) => {
      if (!header || ['phone', 'phonenumber', 'telephone', 'mobile', 'address', 'location', 'website', 'url', 'email', 'rating', 'reviews'].includes(header)) return false;
      return index === 0 || /name|title|business|company|place|shop|store|restaurant|venue/.test(header);
    });
    if (fallbackNameIndex >= 0) mapping.name = fallbackNameIndex;
  }
  if (!('name' in mapping)) {
    return {
      headers: headerRow.cells,
      rows: [],
      error: 'We could not identify the business-name column. Rename the business-name column to Name, Business Name, Company, Title, or Business Title and try again.',
    };
  }

  const rows = parsed.rows.slice(1).map(({ line, cells }) => {
    const input = {};
    for (const [field, index] of Object.entries(mapping)) input[field] = cells[index] ?? '';
    const validation = validateManualLead(input);
    return { rowNumber: line, input, values: validation.values, valid: validation.valid, errors: validation.errors, duplicate: null };
  });
  return { headers: headerRow.cells, rows, error: '' };
}

export function manualLeadOverrideFields(input) {
  return manualLeadFieldsForUpdate(input);
}

export function applyManualLeadOverride(lead, overrides = {}) {
  const id = lead?.placeId || lead?.id;
  const patch = id ? overrides[id] : null;
  if (!patch || typeof patch !== 'object') return lead;
  return {
    ...lead,
    ...patch,
    ...(Object.hasOwn(patch, 'phone') ? { internationalPhoneNumber: String(patch.phone).startsWith('+') ? patch.phone : '' } : {}),
    manualUserFields: [...new Set([...(lead.manualUserFields || []), ...Object.keys(patch)])],
    source: lead.source || 'google',
  };
}
