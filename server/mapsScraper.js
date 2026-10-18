const CSV_LIMIT = 2_000_000;

export function parseMapsScraperCsv(input) {
  const text = String(input ?? '');
  if (text.length > CSV_LIMIT) throw new Error('Scraper result is too large to import.');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field === '') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      if (row.some((cell) => cell.trim() !== '')) rows.push(row);
      row = [];
    } else field += char;
  }
  if (field !== '' || row.length) {
    row.push(field);
    if (row.some((cell) => cell.trim() !== '')) rows.push(row);
  }
  if (rows.length < 2) return [];
  const headers = rows[0].map((header) => header.trim().toLowerCase());
  return rows.slice(1).map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])));
}

function numeric(value) {
  if (value == null || String(value).trim() === '') return null;
  const parsed = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeMapsScraperCsv(csv, { category, location, maxResults = 20 } = {}) {
  const limit = Math.max(1, Math.min(50, Number(maxResults) || 20));
  const rows = parseMapsScraperCsv(csv);
  const seen = new Set();
  const leads = [];
  for (const row of rows) {
    const name = String(row.title || row.name || '').trim();
    if (!name) continue;
    const mapsUrl = String(row.link || row.maps_url || row.google_maps_url || '').trim();
    const placeId = String(row.place_id || row.cid || row.data_id || '').trim();
    const address = String(row.address || '').trim();
    const key = (placeId || mapsUrl || `${name}| ${address}`).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const rating = numeric(row.review_rating || row.rating);
    const reviews = numeric(row.review_count || row.reviews || row.reviews_count);
    leads.push({
      id: `maps-scraper-${key.replace(/[^a-z0-9_-]/gi, '-').slice(0, 180)}`,
      source: 'maps-scraper',
      name,
      category: String(row.category || category || '').trim(),
      city: String(location || '').trim(),
      address,
      phone: String(row.phone || '').trim(),
      website: String(row.website || '').trim(),
      mapsUrl,
      placeId,
      rating,
      reviews,
    });
    if (leads.length >= limit) break;
  }
  return leads;
}

export function isMapsScraperJobId(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
