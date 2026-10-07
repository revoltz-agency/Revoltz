import {
  assertBusinessWebsiteUrl, assertSafeUrl, fetchPublicContent, isGoogleMapsUrl, UnsafeWebsiteError,
} from './websiteAudit.js';

const ENRICHMENT_CACHE_TTL_MS = 24 * 60 * 60 * 1_000;
const MAX_PAGES_PER_ENRICHMENT = 5;
const MAX_INTERNAL_PAGES = MAX_PAGES_PER_ENRICHMENT - 1;
const MAX_DOCUMENT_BYTES = 350_000;
const TAVILY_TIMEOUT_MS = 6_000;
const TAVILY_RESPONSE_BYTES = 180_000;
const OBVIOUS_PAGE_PATHS = ['/contact', '/contact-us', '/about', '/about-us', '/team'];
const OBVIOUS_PAGE_PATH_SET = new Set(OBVIOUS_PAGE_PATHS);
const EMAIL_PATTERN = /\b[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+\b/gi;
const PHONE_PATTERN = /\+?\d[\d().\s-]{5,}\d/g;
const EMAIL_ROLES = new Set([
  'info', 'contact', 'hello', 'enquiries', 'enquiry', 'inquiries', 'inquiry', 'office',
  'reception', 'frontdesk', 'booking', 'bookings', 'reservation', 'reservations', 'appointment',
  'appointments', 'sales', 'support', 'service', 'customerservice', 'help', 'team', 'admin',
  'clinic', 'care', 'marketing', 'business', 'orders', 'connect', 'enquire', 'ask',
]);
const CONFIDENCE_ORDER = { low: 1, medium: 2, high: 3 };

function cleanText(value, maxLength = 500) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function decodeEntities(value) {
  return String(value ?? '').replace(/&(#x[\da-f]+|#\d+|nbsp|amp|lt|gt|quot|apos|#39);/gi, (whole, entity) => {
    const key = entity.toLowerCase();
    if (key === 'nbsp') return ' ';
    if (key === 'amp') return '&';
    if (key === 'lt') return '<';
    if (key === 'gt') return '>';
    if (key === 'quot') return '"';
    if (key === 'apos' || key === '#39') return "'";
    const codePoint = key.startsWith('#x') ? Number.parseInt(key.slice(2), 16) : Number.parseInt(key.slice(1), 10);
    try { return Number.isFinite(codePoint) && codePoint > 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : whole; }
    catch { return whole; }
  });
}

function stripHtml(value) {
  return cleanText(decodeEntities(String(value ?? '')
    .replace(/<!--([\s\S]*?)-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<\/(?:br|p|div|li|section|article|h[1-6]|address|tr|td|th)\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')), 20_000);
}

function getAttribute(attributes, name) {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const match = String(attributes || '').match(pattern);
  return decodeEntities(match?.[1] ?? match?.[2] ?? match?.[3] ?? '').trim();
}

function extractLinks(content, isMarkdown = false) {
  const links = [];
  if (isMarkdown) {
    const markdownPattern = /\[([^\]]{1,180})\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+|tel:[^\s)]+)(?:\s+[^)]*)?\)/gi;
    for (const match of String(content || '').matchAll(markdownPattern)) {
      links.push({ text: cleanText(match[1], 180), href: match[2].replace(/[.,;]+$/, '') });
    }
    return links;
  }

  const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi;
  for (const match of String(content || '').matchAll(anchorPattern)) {
    const href = getAttribute(match[1], 'href');
    if (href) links.push({ href, text: stripHtml(match[2]) });
  }
  return links;
}

function parseSiteUrl(value, baseUrl) {
  try {
    const url = new URL(String(value || '').trim(), baseUrl);
    assertSafeUrl(url);
    return url;
  } catch {
    return null;
  }
}

function parseWebsite(value) {
  const text = cleanText(value, 2_000);
  if (!text) return null;
  let url;
  try {
    url = /^[a-z][a-z\d+.-]*:/i.test(text) ? new URL(text) : new URL(`https://${text}`);
  } catch {
    throw new UnsafeWebsiteError('Enter a valid public website URL.');
  }
  assertBusinessWebsiteUrl(url);
  return url;
}

function decodeEmail(value) {
  const raw = decodeEntities(String(value || '').replace(/^mailto:/i, '').split('?')[0]);
  try { return decodeURIComponent(raw).trim(); }
  catch { return raw.trim(); }
}

function isSharedBusinessEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return false;
  const local = email.split('@')[0].split('+')[0];
  return EMAIL_ROLES.has(local);
}

function normalizePhone(value) {
  const phone = cleanText(decodeEntities(String(value || '').replace(/^tel:/i, '').split('?')[0]), 80);
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return '';
  return phone;
}

function isWhatsappUrl(url) {
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  return host === 'wa.me' || host === 'api.whatsapp.com' || host === 'whatsapp.com';
}

function sanitizedWhatsappUrl(url) {
  const safe = new URL(url.href);
  safe.hash = '';
  if (safe.hostname === 'api.whatsapp.com') {
    const phone = safe.searchParams.get('phone');
    safe.search = '';
    if (phone) safe.searchParams.set('phone', phone.slice(0, 20));
  } else {
    safe.search = '';
  }
  return safe.href;
}

const SOCIAL_HOSTS = [
  'instagram.com', 'facebook.com', 'linkedin.com', 'tiktok.com', 'youtube.com', 'youtu.be', 'x.com', 'twitter.com',
];

function isSocialUrl(url) {
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  return SOCIAL_HOSTS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function socialUrl(url) {
  const safe = new URL(url.href);
  safe.protocol = 'https:';
  safe.search = '';
  safe.hash = '';
  return safe.href;
}

function normalizedName(value) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').toLowerCase().normalize('NFKD')
    .replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

function businessTypes(node) {
  const types = Array.isArray(node?.['@type']) ? node['@type'] : [node?.['@type']];
  return types.filter((type) => typeof type === 'string').map((type) => type.toLowerCase());
}

function isBusinessEntity(node) {
  return businessTypes(node).some((type) => /business|organization|corporation|store|shop|restaurant|cafe|hotel|school|hospital|clinic|dentist|pharmacy|professionalservice|legalservice|medical|financialservice|travelagency|foodestablishment|sportsactivitylocation/.test(type));
}

function jsonLdNodes(html) {
  const nodes = [];
  const blocks = [...String(html || '').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)]
    .filter((match) => /\btype\s*=\s*["']application\/ld\+json["']/i.test(match[1] || ''));
  for (const [, , block] of blocks) {
    try {
      const parsed = JSON.parse(block.trim());
      const add = (value) => {
        if (Array.isArray(value)) value.forEach(add);
        else if (value && typeof value === 'object') {
          if (Array.isArray(value['@graph'])) value['@graph'].forEach(add);
          if (value['@type']) nodes.push(value);
        }
      };
      add(parsed);
    } catch { /* Malformed JSON-LD is not treated as evidence. */ }
  }
  return nodes;
}

function addressText(address) {
  if (typeof address === 'string') return cleanText(address, 300);
  if (!address || typeof address !== 'object') return '';
  const country = typeof address.addressCountry === 'object' ? address.addressCountry.name : address.addressCountry;
  return cleanText([
    address.streetAddress, address.addressLocality, address.addressRegion,
    address.postalCode, country,
  ].filter((part) => typeof part === 'string' || typeof part === 'number').join(', '), 300);
}

function stringifyList(value) {
  if (typeof value === 'string') return [cleanText(value, 120)];
  if (Array.isArray(value)) return value.flatMap(stringifyList);
  return [];
}

function schemaServices(node) {
  const values = [];
  const visit = (value, depth = 0) => {
    if (depth > 5 || value == null) return;
    if (typeof value === 'string') {
      const cleaned = cleanText(value, 120);
      if (cleaned) values.push(cleaned);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((entry) => visit(entry, depth + 1));
      return;
    }
    if (typeof value !== 'object') return;
    const types = businessTypes(value);
    if (types.some((type) => /service|offercatalog|offer/.test(type)) && typeof value.name === 'string') values.push(cleanText(value.name, 120));
    if (value.itemOffered) visit(value.itemOffered, depth + 1);
    if (value.itemListElement) visit(value.itemListElement, depth + 1);
    if (value.hasOfferCatalog) visit(value.hasOfferCatalog, depth + 1);
    if (value.makesOffer) visit(value.makesOffer, depth + 1);
    if (value.serviceType) visit(value.serviceType, depth + 1);
    if (value.knowsAbout) visit(value.knowsAbout, depth + 1);
  };
  for (const key of ['makesOffer', 'hasOfferCatalog', 'serviceType', 'knowsAbout']) visit(node?.[key]);
  return [...new Set(values)].filter((value) => value && !looksPersonalName(value)).slice(0, 12);
}

function looksPersonalName(value) {
  return /^(?:dr|doctor|mr|mrs|ms|miss|prof|professor)\.?\s+[A-Z]/i.test(String(value || '').trim());
}

function formatOpeningHours(node) {
  const simple = stringifyList(node?.openingHours).filter(Boolean);
  if (simple.length) return cleanText(simple.join('; '), 240);
  const specifications = Array.isArray(node?.openingHoursSpecification)
    ? node.openingHoursSpecification
    : node?.openingHoursSpecification ? [node.openingHoursSpecification] : [];
  const formatted = specifications.map((specification) => {
    if (!specification || typeof specification !== 'object') return '';
    const days = stringifyList(specification.dayOfWeek).map((day) => day.split('/').pop()).join(', ');
    const times = [specification.opens, specification.closes].filter(Boolean).join('–');
    return [days, times].filter(Boolean).join(' ');
  }).filter(Boolean);
  return cleanText(formatted.join('; '), 240);
}

function metaContent(html, key) {
  for (const match of String(html || '').matchAll(/<meta\b([^>]*)>/gi)) {
    const attributes = match[1] || '';
    const name = getAttribute(attributes, 'property') || getAttribute(attributes, 'name');
    if (name.toLowerCase() === key.toLowerCase()) return getAttribute(attributes, 'content');
  }
  return '';
}

function pageTitle(html) {
  const title = String(html || '').match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1];
  return stripHtml(title || '');
}

function extractHtmlServiceItems(html) {
  const items = [];
  const headings = [...String(html || '').matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi)];
  const sectionPattern = /\b(our services|services|treatments|specialties|what we do|what we offer|offerings|menu)\b/i;
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    if (!sectionPattern.test(stripHtml(heading[2]))) continue;
    const start = heading.index + heading[0].length;
    const nextHeading = headings[index + 1]?.index ?? start + 4_000;
    const sectionEnd = String(html).indexOf('</section', start);
    const end = Math.min(nextHeading, sectionEnd < 0 ? start + 4_000 : sectionEnd, start + 4_000);
    const section = String(html).slice(start, end);
    const candidates = [...section.matchAll(/<(li|h[3-6])\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)].map((match) => stripHtml(match[2]));
    items.push(...candidates.filter((value) => value.length > 1 && value.length <= 120 && !looksPersonalName(value)));
  }
  return [...new Set(items)].slice(0, 12);
}

function extractMarkdownServiceItems(markdown) {
  const lines = String(markdown || '').split(/\r?\n/);
  const items = [];
  let inServices = false;
  for (const line of lines) {
    const heading = line.match(/^\s{0,3}#{1,6}\s+(.+)$/);
    if (heading) {
      inServices = /\b(our services|services|treatments|specialties|what we do|what we offer|offerings|menu)\b/i.test(heading[1]);
      continue;
    }
    if (!inServices) continue;
    const item = line.match(/^\s*(?:[-*+]\s+|\d+[.)]\s+)(.+)$/);
    if (item) {
      const value = cleanText(item[1].replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, ''), 120);
      if (value && !looksPersonalName(value)) items.push(value);
      if (items.length >= 12) break;
    }
  }
  return [...new Set(items)];
}

function fieldSource(document) {
  try {
    const url = new URL(document.finalUrl);
    url.search = '';
    url.hash = '';
    const label = `${url.host}${url.pathname.replace(/\/$/, '') || '/'}`;
    return document.method === 'jina' ? `Jina Reader · ${label}` : `Business website · ${label}`;
  } catch {
    return document.method === 'jina' ? 'Jina Reader' : 'Business website';
  }
}

function createEvidenceCollector() {
  const data = {
    email: '', phone: '', whatsappUrl: '', socialLinks: [], address: '', businessName: '',
    services: [], openingHours: '', contactPage: '', discoveredWebsite: '',
  };
  const evidence = [];
  const add = (field, rawValue, source, rawEvidence, confidence = 'medium') => {
    const value = cleanText(rawValue, field === 'address' || field === 'openingHours' ? 300 : 240);
    if (!value || !Object.hasOwn(data, field)) return;
    const isList = Array.isArray(data[field]);
    const normalized = value.toLowerCase();
    const duplicate = evidence.find((item) => item.field === field && item.value.toLowerCase() === normalized);
    const item = { field, value, source: cleanText(source, 160), evidence: cleanText(rawEvidence, 240), confidence };
    if (duplicate) {
      if ((CONFIDENCE_ORDER[confidence] || 0) > (CONFIDENCE_ORDER[duplicate.confidence] || 0)) Object.assign(duplicate, item);
      return;
    }
    if (!isList && data[field]) {
      const previous = evidence.find((entry) => entry.field === field && entry.value === data[field]);
      if ((CONFIDENCE_ORDER[confidence] || 0) <= (CONFIDENCE_ORDER[previous?.confidence] || 0)) return;
      const previousIndex = evidence.indexOf(previous);
      if (previousIndex >= 0) evidence.splice(previousIndex, 1);
    }
    if (isList) {
      const limit = field === 'services' ? 12 : 8;
      if (data[field].length >= limit) return;
      data[field].push(value);
    } else {
      data[field] = value;
    }
    evidence.push(item);
  };
  return { data, evidence, add };
}

function addPublicEmail(collector, rawEmail, source, evidence, confidence) {
  const email = decodeEmail(rawEmail).toLowerCase();
  if (isSharedBusinessEmail(email)) collector.add('email', email, source, evidence, confidence);
}

function addPublicPhone(collector, rawPhone, source, evidence, confidence) {
  const phone = normalizePhone(rawPhone);
  if (phone) collector.add('phone', phone, source, evidence, confidence);
}

function extractDocument(document, collector) {
  const content = String(document.content || '');
  const isMarkdown = document.method === 'jina';
  const source = fieldSource(document);
  const visibleText = isMarkdown ? cleanText(content, 20_000) : stripHtml(content);
  const links = extractLinks(content, isMarkdown);
  const jsonNodes = isMarkdown ? [] : jsonLdNodes(content);

  for (const { href, text } of links) {
    if (/^mailto:/i.test(href)) addPublicEmail(collector, href, source, `Public mailto link: ${decodeEmail(href)}`, 'high');
    if (/^tel:/i.test(href)) addPublicPhone(collector, href, source, `Public telephone link: ${normalizePhone(href)}`, 'high');
    const url = parseSiteUrl(href, document.finalUrl);
    if (!url) continue;
    if (isWhatsappUrl(url)) collector.add('whatsappUrl', sanitizedWhatsappUrl(url), source, `Public WhatsApp link${text ? ` labeled “${cleanText(text, 60)}”` : ''}.`, 'high');
    if (isSocialUrl(url)) collector.add('socialLinks', socialUrl(url), source, `Public ${url.hostname.replace(/^www\./, '')} profile link.`, 'high');
    if (isInternalContactUrl(url, document.finalUrl)) collector.add('contactPage', url.href, source, `Public contact-page link${text ? ` labeled “${cleanText(text, 60)}”` : ''}.`, 'high');
  }

  // Only shared, role-based mailboxes are retained; named personal mailboxes are ignored.
  for (const email of visibleText.matchAll(EMAIL_PATTERN)) addPublicEmail(collector, email[0], source, `Public page text lists ${email[0]}.`, 'medium');
  for (const match of visibleText.matchAll(PHONE_PATTERN)) {
    const visiblePhone = normalizePhone(match[0]);
    if (!visiblePhone) continue;
    addPublicPhone(collector, visiblePhone, source, `Public page text lists ${visiblePhone}.`, 'medium');
    break;
  }

  for (const node of jsonNodes) {
    if (!isBusinessEntity(node)) continue;
    if (typeof node.name === 'string' && !looksPersonalName(node.name)) {
      collector.add('businessName', node.name, source, `Structured ${businessTypes(node)[0]} business name.`, 'high');
    }
    if (typeof node.email === 'string') addPublicEmail(collector, node.email, source, 'Structured public business email.', 'high');
    if (typeof node.telephone === 'string') addPublicPhone(collector, node.telephone, source, 'Structured public business telephone.', 'high');
    const address = addressText(node.address);
    if (address) collector.add('address', address, source, 'Structured business address.', 'high');
    const hours = formatOpeningHours(node);
    if (hours) collector.add('openingHours', hours, source, 'Structured business opening-hours data.', 'high');
    for (const service of schemaServices(node)) collector.add('services', service, source, `Structured business service: ${service}.`, 'high');
    for (const social of stringifyList(node.sameAs)) {
      const url = parseSiteUrl(social, document.finalUrl);
      if (url && isSocialUrl(url)) collector.add('socialLinks', socialUrl(url), source, `Structured public ${url.hostname.replace(/^www\./, '')} profile reference.`, 'high');
    }
  }

  if (!isMarkdown) {
    for (const match of content.matchAll(/<address\b[^>]*>([\s\S]*?)<\/address\s*>/gi)) {
      const address = stripHtml(match[1]);
      if (address) collector.add('address', address, source, `Public address element: ${address}.`, 'high');
    }
    for (const item of extractHtmlServiceItems(content)) collector.add('services', item, source, `Public services section lists “${item}”.`, 'medium');
    const ogName = metaContent(content, 'og:site_name') || metaContent(content, 'application-name');
    if (ogName && !looksPersonalName(ogName)) collector.add('businessName', ogName, source, `Public page metadata names the business “${ogName}”.`, 'medium');
    const title = pageTitle(content);
    if (title && !looksPersonalName(title)) collector.add('businessName', title, source, `Public page title: “${title}”.`, 'medium');
  } else {
    for (const item of extractMarkdownServiceItems(content)) collector.add('services', item, source, `Jina Reader page lists “${item}” in its services section.`, 'medium');
    const title = content.match(/^\s*(?:Title:\s*|#\s+)([^\n#]{2,160})/im)?.[1];
    if (title && !looksPersonalName(title)) collector.add('businessName', title, source, `Jina Reader title: “${cleanText(title, 160)}”.`, 'medium');
  }

  // Some business sites publish hours as visible text rather than schema data.
  const hoursMatch = visibleText.match(/\b(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)(?:\s*[-–,]\s*(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?))*\s*(?:[:—-]\s*)?\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*(?:[-–]\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?/i);
  if (hoursMatch) collector.add('openingHours', hoursMatch[0], source, `Public page text lists business hours: ${hoursMatch[0]}.`, 'medium');
}

function isInternalContactUrl(url, baseUrl) {
  try {
    const base = new URL(baseUrl);
    const path = url.pathname.toLowerCase().replace(/\/$/, '') || '/';
    return url.origin === base.origin && (/^\/(?:contact|contact-us)(?:\.html?)?$/i.test(path));
  } catch { return false; }
}

function obviousInternalPageUrls(content, baseUrl, isMarkdown) {
  const base = new URL(baseUrl);
  const linked = extractLinks(content, isMarkdown).map(({ href }) => parseSiteUrl(href, base.href))
    .filter((url) => url && url.origin === base.origin)
    .filter((url) => OBVIOUS_PAGE_PATH_SET.has(url.pathname.toLowerCase().replace(/\/$/, '') || '/'))
    .map((url) => url.href);
  const candidates = linked.length
    ? linked
    : OBVIOUS_PAGE_PATHS.map((path) => new URL(path, base.origin).href);
  return [...new Set(candidates)].filter((url) => url !== base.href).slice(0, MAX_INTERNAL_PAGES);
}

function jinaReaderUrl(target) {
  const clean = new URL(target.href);
  clean.search = '';
  clean.hash = '';
  const readerUrl = new URL('https://r.jina.ai/');
  readerUrl.pathname = `/${clean.origin}${clean.pathname}`;
  return readerUrl;
}

async function fetchWebsiteDocument(targetUrl, options = {}) {
  const { fetcher = globalThis.fetch, lookup, pageBudget } = options;
  if (pageBudget) {
    if (pageBudget.remaining <= 0) throw new Error('The enrichment page limit has been reached.');
    pageBudget.remaining -= 1;
  }
  try {
    const document = await fetchPublicContent(targetUrl, {
      maxBytes: MAX_DOCUMENT_BYTES,
      timeoutMs: 8_000,
      userAgent: 'AgencyOSLeadEnrichment/1.0 (+https://github.com/revoltz-agency/Revoltz; public business contact extraction)',
      validateUrl: assertBusinessWebsiteUrl,
      fetcher,
      ...(lookup ? { lookup } : {}),
    });
    return { ...document, method: 'website' };
  } catch (error) {
    if (error instanceof UnsafeWebsiteError) throw error;
    const target = targetUrl instanceof URL ? targetUrl : new URL(targetUrl);
    const readerUrl = jinaReaderUrl(target);
    try {
      const document = await fetchPublicContent(readerUrl, {
        maxBytes: MAX_DOCUMENT_BYTES,
        timeoutMs: 8_000,
        allowedContentTypes: /(text\/plain|text\/markdown|application\/text)/i,
        accept: 'text/plain, text/markdown;q=0.9',
        userAgent: 'AgencyOSLeadEnrichment/1.0 (+https://github.com/revoltz-agency/Revoltz; Jina Reader fallback)',
        allowedOrigins: [readerUrl.origin],
        fetcher,
        ...(lookup ? { lookup } : {}),
      });
      return { ...document, finalUrl: target.href, method: 'jina' };
    } catch (readerError) {
      throw new Error(`The public website could not be read (${error.message || 'fetch failed'}); Jina Reader fallback was unavailable (${readerError.message || 'request failed'}).`);
    }
  }
}

function validateOsmLead(input) {
  const lead = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const id = cleanText(lead.placeId || lead.id, 100);
  if (lead.source !== 'osm' || !/^osm-(?:node|way|relation)\/\d+$/.test(id)) {
    const error = new Error('Enrichment is available for OpenStreetMap leads only.');
    error.statusCode = 400;
    throw error;
  }
  const name = cleanText(lead.name, 160);
  if (!name) {
    const error = new Error('The OpenStreetMap lead needs a business name before it can be enriched.');
    error.statusCode = 400;
    throw error;
  }
  return {
    id,
    name,
    city: cleanText(lead.city, 160),
    category: cleanText(lead.category, 100),
    website: cleanText(lead.website, 2_000),
  };
}

async function readLimitedText(response, maxBytes) {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error('Tavily returned a response that exceeds the size limit.');
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total).toString('utf8');
}

function searchTerm(value, maxLength = 160) {
  return cleanText(value, maxLength).replace(/["\\\\]/g, ' ').replace(/\s+/g, ' ').trim();
}

async function searchTavily(lead, apiKey, fetcher) {
  const name = searchTerm(lead.name);
  const city = searchTerm(lead.city);
  const category = searchTerm(lead.category, 100);
  const query = [`"${name}"`, city ? `"${city}"` : '', category].filter(Boolean).join(' ');
  const response = await fetcher('https://api.tavily.com/search', {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(TAVILY_TIMEOUT_MS),
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ api_key: apiKey, query, search_depth: 'basic', max_results: 5, include_answer: false, include_raw_content: false }),
  });
  if (!response.ok) throw new Error(`Tavily website discovery returned HTTP ${response.status}.`);
  let data;
  try { data = JSON.parse(await readLimitedText(response, TAVILY_RESPONSE_BYTES)); }
  catch (error) {
    if (error.message?.includes('size limit')) throw error;
    throw new Error('Tavily website discovery returned an unreadable response.');
  }
  return Array.isArray(data?.results) ? data.results.slice(0, 5) : [];
}

async function fetchInternalPages(homepage, options = {}) {
  let pageUrls = [];
  try { pageUrls = obviousInternalPageUrls(homepage.content, homepage.finalUrl, homepage.method === 'jina'); }
  catch { pageUrls = []; }
  const baseOrigin = new URL(homepage.finalUrl).origin;
  const pageBudget = options.pageBudget;
  const availablePages = pageBudget ? Math.max(0, pageBudget.remaining) : MAX_INTERNAL_PAGES;
  const selectedUrls = pageUrls.slice(0, Math.min(MAX_INTERNAL_PAGES, availablePages));
  if (pageBudget) pageBudget.remaining -= selectedUrls.length;

  return (await Promise.all(selectedUrls.map(async (url) => {
    try {
      const result = await fetchPublicContent(url, {
        maxBytes: MAX_DOCUMENT_BYTES,
        timeoutMs: 5_000,
        allowedOrigins: [baseOrigin],
        userAgent: 'AgencyOSLeadEnrichment/1.0 (+https://github.com/revoltz-agency/Revoltz; limited internal-page check)',
        ...(options.fetcher ? { fetcher: options.fetcher } : {}),
        ...(options.lookup ? { lookup: options.lookup } : {}),
      });
      return { ...result, method: 'website' };
    } catch {
      // A missing or unsafe optional page is skipped; no redirects are followed off-site.
      return null;
    }
  }))).filter(Boolean);
}

async function crawlWebsite(target, options = {}) {
  const homepage = await fetchWebsiteDocument(target, options);
  const pages = [homepage, ...await fetchInternalPages(homepage, options)];
  return { pages, homepage };
}

function extractAll(pages) {
  const collector = createEvidenceCollector();
  for (const page of pages) extractDocument(page, collector);
  return collector;
}

function candidateMatchesLead(leadName, pages) {
  const target = normalizedName(leadName);
  if (target.length < 4) return false;
  const corpus = pages.map((page) => page.method === 'jina' ? page.content : `${stripHtml(page.content)} ${page.content}`)
    .join(' ');
  return normalizedName(corpus).includes(target);
}

function resultFromPages({ pages, source, timestamp, discoveredWebsite = '', discoveryEvidence = '' }) {
  const collector = extractAll(pages);
  if (discoveredWebsite) collector.add('discoveredWebsite', discoveredWebsite, 'Tavily result + verified public website', discoveryEvidence, 'high');
  const confidence = collector.evidence.some((item) => item.confidence === 'high')
    ? 'high'
    : collector.evidence.length ? 'medium' : 'low';
  return {
    status: collector.evidence.length ? 'complete' : 'no_public_details',
    timestamp,
    source,
    confidence,
    ...collector.data,
    evidence: collector.evidence.slice(0, 40),
    ...(collector.evidence.length ? {} : { message: 'The public website loaded, but no supported business contact or profile details were found.' }),
  };
}

function emptyResult(status, timestamp, source, message) {
  return {
    status, timestamp, source, confidence: 'low', email: '', phone: '', whatsappUrl: '', socialLinks: [],
    address: '', businessName: '', services: [], openingHours: '', contactPage: '', discoveredWebsite: '', evidence: [], message,
  };
}

async function performEnrichment(lead, { tavilyApiKey, fetcher, lookup, timestamp }) {
  if (lead.website) {
    const target = parseWebsite(lead.website);
    try {
      const pageBudget = { remaining: MAX_PAGES_PER_ENRICHMENT };
      const { pages, homepage } = await crawlWebsite(target, { fetcher, lookup, pageBudget });
      return resultFromPages({ pages, source: homepage.method === 'jina' ? 'jina-reader' : 'website', timestamp });
    } catch (error) {
      if (error instanceof UnsafeWebsiteError) throw error;
      return emptyResult('unavailable', timestamp, 'website', 'The public business website could not be read; no information was inferred.');
    }
  }

  if (!tavilyApiKey) {
    return emptyResult('no_website', timestamp, 'openstreetmap', 'No website is listed in OpenStreetMap. Optional website discovery was skipped because TAVILY_API_KEY is not configured.');
  }

  let candidates;
  try { candidates = await searchTavily(lead, tavilyApiKey, fetcher); }
  catch {
    return emptyResult('unavailable', timestamp, 'tavily', 'Optional website discovery could not be completed. No candidate website was accepted.');
  }

  const pageBudget = { remaining: MAX_PAGES_PER_ENRICHMENT };
  const visitedCandidates = new Set();
  for (const candidate of candidates) {
    if (pageBudget.remaining <= 0) break;
    const rawUrl = typeof candidate?.url === 'string' ? candidate.url.trim() : '';
    let target;
    try { target = parseWebsite(rawUrl); }
    catch { continue; }
    if (!target || isGoogleMapsUrl(target)) continue;
    const candidateKey = `${target.origin}${target.pathname.replace(/\/+$/, '') || '/'}`;
    if (visitedCandidates.has(candidateKey)) continue;
    visitedCandidates.add(candidateKey);
    try {
      // Verify the candidate on its homepage before inspecting any other page.
      const homepage = await fetchWebsiteDocument(target, { fetcher, lookup, pageBudget });
      if (!candidateMatchesLead(lead.name, [homepage])) continue;
      const pages = [homepage, ...await fetchInternalPages(homepage, { fetcher, lookup, pageBudget })];
      const finalWebsite = homepage.finalUrl;
      const source = homepage.method === 'jina' ? 'tavily+jina-reader' : 'tavily+verified-website';
      return resultFromPages({
        pages,
        source,
        timestamp,
        discoveredWebsite: finalWebsite,
        discoveryEvidence: `Tavily searched the exact business name with its city/category; the fetched public page matched “${lead.name}”.`,
      });
    } catch (error) {
      // Search results are untrusted input; unsafe or unreachable candidates are ignored.
      if (error instanceof UnsafeWebsiteError) continue;
    }
  }
  return emptyResult('no_public_details', timestamp, 'tavily', 'No candidate website could be verified against the exact business name on a public page.');
}

function cacheKeyFor(lead, hasTavily) {
  return JSON.stringify([lead.id, lead.name.toLowerCase(), lead.city.toLowerCase(), lead.category.toLowerCase(), lead.website, hasTavily]);
}

export function createEnrichmentService({ cache = new Map(), now = () => Date.now() } = {}) {
  return async function enrichOsmLead({ lead: input, tavilyApiKey = '', fetcher = globalThis.fetch, lookup } = {}) {
    const lead = validateOsmLead(input);
    const apiKey = typeof tavilyApiKey === 'string' ? tavilyApiKey.trim() : '';
    const cacheKey = cacheKeyFor(lead, Boolean(apiKey));
    const requestedAt = now();
    for (const [key, value] of cache) if (value.expiresAt <= requestedAt) cache.delete(key);
    const existing = cache.get(cacheKey);
    if (existing && existing.expiresAt > requestedAt) return { result: await existing.promise, cached: true };

    const timestamp = new Date(requestedAt).toISOString();
    const promise = performEnrichment(lead, { tavilyApiKey: apiKey, fetcher, lookup, timestamp });
    cache.set(cacheKey, { expiresAt: requestedAt + ENRICHMENT_CACHE_TTL_MS, promise });
    if (cache.size > 1_000) cache.delete(cache.keys().next().value);
    try {
      const result = await promise;
      const current = cache.get(cacheKey);
      if (current?.promise === promise) cache.set(cacheKey, { expiresAt: now() + ENRICHMENT_CACHE_TTL_MS, promise: Promise.resolve(result) });
      return { result, cached: false };
    } catch (error) {
      if (cache.get(cacheKey)?.promise === promise) cache.delete(cacheKey);
      throw error;
    }
  };
}

const enrichOsmLead = createEnrichmentService();
export { ENRICHMENT_CACHE_TTL_MS, enrichOsmLead };
