// OpenRouter fallback for AI-assisted public-web lead research.
// API key is held in sessionStorage by the UI and never committed.

export const OPENROUTER_KEY_STORAGE = 'agencyos:openrouter-api-key:v1';
export const OPENROUTER_DEFAULT_MODEL = 'openrouter/free';
const API_URL = 'https://openrouter.ai/api/v1/chat/completions';

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

function extractJson(text) {
  const cleaned = String(text || '').replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  try { return JSON.parse(cleaned); } catch {}
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try { return JSON.parse(cleaned.slice(first, last + 1)); } catch {}
  }
  throw new Error('OpenRouter returned an unexpected response format. Try again or choose another model.');
}

function errorMessage(status, data) {
  const detail = clean(data?.error?.message || data?.message || '', 1200);
  if (status === 401 || status === 403) return 'OpenRouter rejected the API key. Check the key in Settings and confirm it is active.';
  if (status === 402) return 'OpenRouter reports insufficient credits or a spending limit. Web research was not retried.';
  if (status === 429) return 'OpenRouter rate limit reached. No automatic retry was made.';
  return `OpenRouter request failed (HTTP ${status}). ${detail}`.trim();
}

async function request(apiKey, body, timeoutMs = 45000) {
  const key = String(apiKey || '').trim();
  if (!key) throw new Error('Add your OpenRouter API key in Settings first.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'HTTP-Referer': window.location.origin, 'X-Title': 'Revoltz AgencyOS' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(errorMessage(response.status, data));
    return data;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('OpenRouter took too long to respond. No automatic retry was made.');
    throw error;
  } finally { clearTimeout(timeout); }
}

export async function testOpenRouterApiKey(apiKey, model = OPENROUTER_DEFAULT_MODEL) {
  // Authentication test only. Intentionally does not enable web search.
  const data = await request(apiKey, {
    model: clean(model, 160) || OPENROUTER_DEFAULT_MODEL,
    messages: [{ role: 'user', content: 'Reply with exactly: OPENROUTER_OK' }],
    max_tokens: 20,
  }, 30000);
  const answer = clean(data?.choices?.[0]?.message?.content, 100);
  if (!answer) throw new Error('OpenRouter accepted the request but returned no test response. Check whether the selected model is available.');
  return true;
}

export async function searchOpenRouterLeads({ apiKey, model = OPENROUTER_DEFAULT_MODEL, category, location, radiusKm = 10, maxResults = 5, enablePaidWebSearch = false }) {
  const safeCategory = clean(category, 100);
  const safeLocation = clean(location, 160);
  const count = Math.max(1, Math.min(10, Number(maxResults) || 5));
  const radius = Math.max(1, Math.min(50, Number(radiusKm) || 10));
  if (!safeCategory || !safeLocation) throw new Error('Add an industry/category and location to search.');
  if (!enablePaidWebSearch) throw new Error('Live web research is disabled. Explicitly enable the paid web-search option before starting this search.');

  const prompt = [
    'Research real public-facing businesses for a sales prospecting workspace using the attached live web search tool.',
    `Industry/category: ${safeCategory}`,
    `Location: ${safeLocation}`,
    `Approximate preferred radius: ${radius} km. Return at most ${count} businesses.`,
    'Return only JSON: {"leads":[{"name":"","category":"","city":"","website":"","sourceUrl":"","evidence":""}]}.',
    'Only include businesses with a specific supporting public source URL found during this search. sourceUrl must be the URL of the source page that supports the business identity; website must be the business official website only when the source supports it, otherwise empty.',
    'Never invent names, addresses, phone numbers, ratings, review counts, emails, or URLs. Do not include contact details. Do not present directory pages as official websites. Deduplicate results and prefer businesses in the requested location.',
    'The research is preliminary and sources must be reviewed by a human before outreach.',
  ].join('\n');

  const body = {
    model: clean(model, 160) || OPENROUTER_DEFAULT_MODEL,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 2200,
    tools: [{
      type: 'openrouter:web_search',
      parameters: { engine: 'exa', max_uses: 1, max_results: Math.min(5, count) },
    }],
  };
  const data = await request(apiKey, body);
  const message = data?.choices?.[0]?.message;
  const parsed = extractJson(message?.content);
  const citations = (Array.isArray(message?.annotations) ? message.annotations : [])
    .filter((item) => item?.type === 'url_citation' && item?.url_citation?.url)
    .map((item) => ({ title: clean(item.url_citation.title || item.url_citation.url, 180), url: safeUrl(item.url_citation.url) }))
    .filter((item) => item.url);
  const citedUrls = new Set(citations.map((item) => item.url));
  const leads = (Array.isArray(parsed?.leads) ? parsed.leads : []).map((lead, index) => {
    const sourceUrl = safeUrl(lead.sourceUrl);
    const website = safeUrl(lead.website);
    // Do not accept a model-generated business record without a source URL that
    // OpenRouter returned as a citation for this request.
    if (!sourceUrl || !citedUrls.has(sourceUrl)) return null;
    return {
      id: `openrouter-${sourceUrl}`,
      placeId: '',
      source: 'openrouter',
      demo: false,
      name: clean(lead.name, 160),
      category: clean(lead.category || safeCategory, 100),
      city: clean(lead.city || safeLocation, 160),
      address: '', phone: '', internationalPhoneNumber: '',
      website: website && citedUrls.has(website) ? website : '',
      mapsUrl: '', rating: null, reviews: null, businessStatus: 'UNKNOWN',
      researchSourceUrl: sourceUrl,
      researchEvidence: clean(lead.evidence, 300),
    };
  }).filter((lead) => lead?.name).slice(0, count);
  return { leads, groundingSources: citations, webSearchRequests: Number(data?.usage?.server_tool_use?.web_search_requests) || 1 };
}
