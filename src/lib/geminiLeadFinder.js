// Gemini-powered local lead discovery using Gemini + Google Maps grounding.
// The API key is supplied by the user at runtime and is never committed.

export const GEMINI_MODEL = 'gemini-3.5-flash-lite';
const GEMINI_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.7-flash'];
export const GEMINI_KEY_STORAGE = 'agencyos:gemini-api-key:v1';

const LEAD_SCHEMA = {
  type: 'OBJECT',
  properties: {
    leads: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          category: { type: 'STRING' },
          city: { type: 'STRING' },
          address: { type: 'STRING' },
          phone: { type: 'STRING' },
          website: { type: 'STRING' },
          mapsUrl: { type: 'STRING' },
          rating: { type: 'NUMBER' },
          reviews: { type: 'INTEGER' },
          placeId: { type: 'STRING' },
        },
        required: ['name', 'category', 'city', 'address', 'phone', 'website', 'mapsUrl', 'rating', 'reviews', 'placeId'],
      },
    },
  },
  required: ['leads'],
};

function clean(value, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function safeUrl(value) {
  const text = clean(value, 2048);
  if (!text) return '';
  try {
    const url = new URL(text);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}

function normalizedNumber(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function parseResponse(data) {
  const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim() || '';
  if (!text) throw new Error('Gemini returned no lead data. Try a broader search.');
  let parsed;
  const unfenced = text.replace(/^\`\`\`(?:json)?\\s*/i, '').replace(/\\s*\`\`\`$/, '').trim();
  try { parsed = JSON.parse(unfenced); }
  catch {
    const first = unfenced.indexOf('{');
    const last = unfenced.lastIndexOf('}');
    if (first < 0 || last <= first) throw new Error('Gemini returned an unexpected response format. Please try again.');
    try { parsed = JSON.parse(unfenced.slice(first, last + 1)); }
    catch { throw new Error('Gemini returned an unexpected response format. Please try again.'); }
  }
  const raw = Array.isArray(parsed?.leads) ? parsed.leads : [];
  return raw.map((lead, index) => ({
    id: clean(lead.placeId, 300) ? `gemini-${clean(lead.placeId, 300)}` : `gemini-${Date.now()}-${index}`,
    placeId: clean(lead.placeId, 300),
    source: 'gemini',
    demo: false,
    name: clean(lead.name, 160),
    category: clean(lead.category, 100),
    city: clean(lead.city, 160),
    address: clean(lead.address, 500),
    phone: clean(lead.phone, 80),
    internationalPhoneNumber: clean(lead.phone, 80),
    website: safeUrl(lead.website),
    mapsUrl: safeUrl(lead.mapsUrl),
    rating: normalizedNumber(lead.rating, 0, 5),
    reviews: Number.isInteger(Number(lead.reviews)) && Number(lead.reviews) >= 0 ? Number(lead.reviews) : null,
    businessStatus: 'UNKNOWN',
  })).filter((lead) => lead.name);
}

async function callGemini(apiKey, prompt, { mapsGrounding = true } = {}) {
  const key = String(apiKey || '').trim();
  if (!key) throw new Error('Add your Gemini API key in Settings first.');
  let lastError;
  for (const model of GEMINI_MODELS) {
    let response;
    let data = {};
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          ...(mapsGrounding ? { tools: [{ googleMaps: {} }] } : {}),
          // Google Maps grounding is incompatible with constrained JSON output mode.
          generationConfig: mapsGrounding
            ? { maxOutputTokens: 4096 }
            : { responseMimeType: 'application/json', responseSchema: LEAD_SCHEMA, maxOutputTokens: 4096 },
        }),
      });
      data = await response.json().catch(() => ({}));
    } catch (error) {
      lastError = error?.name === 'AbortError'
        ? new Error('Gemini took too long to respond. Try again; your details are still here.')
        : new Error('Could not reach Gemini. Check your internet connection.');
      if (error?.name === 'AbortError') break;
      continue;
    } finally {
      clearTimeout(timeout);
    }
    if (response.ok) return data;
    const message = data?.error?.message || `Gemini request failed (HTTP ${response.status}).`;
    lastError = new Error(message.slice(0, 500));
    // Switching models can help with model-specific limits, but cannot bypass a project-wide exhausted quota.
    if (![429, 500, 502, 503, 504].includes(response.status)) break;
  }
  const message = lastError?.message || 'Gemini request failed.';
  if (/quota|rate.?limit|resource.?exhausted|limit exceeded/i.test(message)) {
    throw new Error('Gemini quota or rate limit reached for this Google project. Switching models cannot bypass a project-wide limit. Check Google AI Studio → Usage and limits, or try again after the limit resets.');
  }
  if (/high demand|overloaded|temporarily unavailable/i.test(message)) {
    throw new Error('Gemini is temporarily busy. Please try again later.');
  }
  throw lastError || new Error('Gemini request failed. Please try again.');
}

export async function testGeminiApiKey(apiKey) {
  await callGemini(apiKey, 'Return an empty leads array. Do not search for businesses.');
  return true;
}

export async function searchGeminiLeads({ apiKey, category, location, radiusKm = 10, maxResults = 10 }) {
  const safeCategory = clean(category, 100);
  const safeLocation = clean(location, 160);
  const count = Math.max(1, Math.min(5, Number(maxResults) || 5));
  const radius = Math.max(1, Math.min(50, Number(radiusKm) || 10));
  if (!safeCategory || !safeLocation) throw new Error('Add an industry/category and location to search.');

  const prompt = [
    `Find up to ${count} real businesses for the lead-generation workspace.`,
    `Industry/category: ${safeCategory}`,
    `Location: ${safeLocation}`,
    `Prefer businesses within approximately ${radius} km of the requested location.`,
    '',
    'Use Google Maps grounding for the business discovery. Return only businesses that are actually present in the grounded Maps results.',
    'Output only valid JSON with exactly this top-level shape: {"leads":[{"name":"","category":"","city":"","address":"","phone":"","website":"","mapsUrl":"","rating":null,"reviews":null,"placeId":""}]}. Do not use markdown fences or add explanatory text outside the JSON.',
    'Do not invent, infer, or guess missing phone numbers, websites, ratings, review counts, addresses, or place IDs. Use an empty string or null when the grounded data does not provide a field.',
    'Prefer distinct businesses located in the requested city/location. Exclude duplicates, closed/clearly nonexistent businesses, and generic category descriptions.',
    'Return the business name, category, city, full address, public phone if available, public website if available, Google Maps URL if available, rating, review count, and Google Maps place ID when available.',
  ].join('\\n');

  const data = await callGemini(apiKey, prompt);
  const leads = parseResponse(data).slice(0, count);
  return { leads, groundingMetadata: data?.candidates?.[0]?.groundingMetadata || null };
}
