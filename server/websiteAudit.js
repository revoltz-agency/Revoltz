import dns from 'node:dns/promises';
import net from 'node:net';
import { Agent } from 'undici';

const MAX_HTML_BYTES = 350_000;
const MAX_REDIRECTS = 4;
const DNS_LOOKUP_TIMEOUT_MS = 3_000;
const REQUEST_TIMEOUT_MS = 8_000;

export class UnsafeWebsiteError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnsafeWebsiteError';
    this.code = 'UNSAFE_WEBSITE';
    this.statusCode = 400;
  }
}

export function publicIPv4(address) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b, c] = parts;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 0 || b === 168)) return false;
  if (a === 192 && b === 88 && c === 99) return false;
  if (a === 198 && (b === 18 || b === 19 || b === 51)) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

export function publicIPv6(address) {
  const value = address.toLowerCase().split('%')[0];
  if (value === '::' || value === '::1' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb') || value.startsWith('ff')) return false;
  const mapped = value.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return publicIPv4(mapped[1]);
  const firstGroup = Number.parseInt(value.split(':')[0], 16);
  // Only allow global-unicast IPv6 (2000::/3); reject compatible, translated,
  // documentation, benchmarking, and transition ranges conservatively.
  if (!Number.isFinite(firstGroup) || firstGroup < 0x2000 || firstGroup > 0x3fff) return false;
  if (/^(?:2001:(?:0|2|10|20|db8):|2002:)/i.test(value)) return false;
  return true;
}

export function isPublicAddress(address) {
  const family = net.isIP(address);
  if (family === 4) return publicIPv4(address);
  if (family === 6) return publicIPv6(address);
  return false;
}

function normalizeHost(hostname) {
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
}

export async function getPublicAddresses(hostname, lookup = dns.lookup, timeoutMs = DNS_LOOKUP_TIMEOUT_MS) {
  const host = normalizeHost(hostname);
  const family = net.isIP(host);
  let records;
  let timer;
  try {
    records = family
      ? [{ address: host, family }]
      : await Promise.race([
        Promise.resolve().then(() => lookup(host, { all: true, verbatim: true })),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('DNS lookup timed out.')), timeoutMs); }),
      ]);
  } catch {
    // If the server cannot establish that a host resolves publicly, fail closed.
    throw new UnsafeWebsiteError('The website host could not be verified as public.');
  } finally {
    clearTimeout(timer);
  }

  if (!records.length || records.some((record) => !isPublicAddress(record.address))) {
    throw new UnsafeWebsiteError('The website host did not resolve to a public address.');
  }
  return records;
}

export function assertSafeUrl(input) {
  let url;
  try {
    url = input instanceof URL ? input : new URL(input);
  } catch {
    throw new UnsafeWebsiteError('Enter a valid public website URL.');
  }
  if (!['https:', 'http:'].includes(url.protocol)) throw new UnsafeWebsiteError('Only public HTTP or HTTPS websites can be analyzed.');
  if (url.username || url.password) throw new UnsafeWebsiteError('Website URLs with embedded credentials are not allowed.');
  if (url.port && !((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80'))) {
    throw new UnsafeWebsiteError('Non-standard website ports are not allowed.');
  }
  const host = normalizeHost(url.hostname).toLowerCase().replace(/\.$/, '');
  const reservedSuffixes = ['.localhost', '.local', '.internal', '.home', '.lan', '.test', '.invalid', '.example', '.onion'];
  if (!host || host === 'localhost' || reservedSuffixes.some((suffix) => host.endsWith(suffix))) {
    throw new UnsafeWebsiteError('Local or private website hosts cannot be analyzed.');
  }
  const family = net.isIP(host);
  if (family && !isPublicAddress(host)) throw new UnsafeWebsiteError('The website host did not resolve to a public address.');
  return url;
}

export function isGoogleMapsUrl(input) {
  let url;
  try { url = input instanceof URL ? input : new URL(input); }
  catch { return false; }
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  return host === 'maps.app.goo.gl'
    || host === 'goo.gl' && url.pathname.toLowerCase().startsWith('/maps')
    || host.startsWith('maps.google.')
    || /(^|\.)google\.[a-z.]+$/i.test(host) && /(^|\/)maps(?:\/|$)/i.test(url.pathname);
}

export function assertBusinessWebsiteUrl(input) {
  const url = assertSafeUrl(input);
  if (isGoogleMapsUrl(url)) throw new UnsafeWebsiteError('Google Maps pages are not business websites and are not analyzed.');
  return url;
}

function pinnedAgent(records) {
  const lookup = (_hostname, options, callback) => {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    const requestedFamily = options?.family || 0;
    const candidates = records.filter((record) => !requestedFamily || record.family === requestedFamily);
    const available = candidates.length ? candidates : records;
    if (options?.all) {
      callback(null, available.map((record) => ({ address: record.address, family: record.family })));
    } else {
      const record = available[0];
      callback(null, record.address, record.family);
    }
  };
  return new Agent({ connect: { lookup } });
}

async function readLimitedBody(response, maxBytes) {
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
        throw new Error(`The website response exceeds the ${Math.round(maxBytes / 1_000)} KB analysis limit.`);
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total).toString('utf8');
}

export async function fetchPublicContent(initialUrl, options = {}) {
  const {
    maxBytes = MAX_HTML_BYTES,
    maxRedirects = MAX_REDIRECTS,
    timeoutMs = REQUEST_TIMEOUT_MS,
    dnsTimeoutMs = DNS_LOOKUP_TIMEOUT_MS,
    allowedContentTypes = /(text\/html|application\/xhtml\+xml)/i,
    accept = 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
    userAgent = 'AgencyOSWebsiteCheck/1.0 (+https://github.com/revoltz-agency/Revoltz; limited public HTML checks)',
    allowedOrigins = null,
    validateUrl = assertSafeUrl,
    fetcher = globalThis.fetch,
    lookup = dns.lookup,
  } = options;

  let current = validateUrl(initialUrl);
  const originAllowlist = allowedOrigins ? new Set(allowedOrigins) : null;
  if (originAllowlist && !originAllowlist.has(current.origin)) {
    throw new UnsafeWebsiteError('The requested page is outside the verified website origin.');
  }

  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
    validateUrl(current);
    const records = await getPublicAddresses(current.hostname, lookup, dnsTimeoutMs);
    const dispatcher = pinnedAgent(records);
    try {
      const response = await fetcher(current, {
        dispatcher,
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'User-Agent': userAgent, Accept: accept },
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location || redirect === maxRedirects) throw new Error('The website redirected too many times or had an invalid redirect.');
        let next;
        try { next = new URL(location, current); }
        catch { throw new UnsafeWebsiteError('The website returned an invalid redirect.'); }
        if (current.protocol === 'https:' && next.protocol !== 'https:') {
          throw new UnsafeWebsiteError('Redirects from HTTPS to HTTP are not followed.');
        }
        if (originAllowlist && !originAllowlist.has(next.origin)) {
          throw new UnsafeWebsiteError('A page redirected outside the verified website origin.');
        }
        current = next;
        continue;
      }

      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`The website returned HTTP ${response.status}.`);
      }
      const contentType = response.headers.get('content-type') || '';
      const contentTypeMatches = typeof allowedContentTypes === 'function'
        ? allowedContentTypes(contentType)
        : allowedContentTypes.test(contentType);
      if (!contentTypeMatches) {
        await response.body?.cancel();
        throw new Error('The website did not return an allowed document type.');
      }
      const declaredLength = Number(response.headers.get('content-length'));
      if (response.headers.get('content-length') && Number.isFinite(declaredLength) && declaredLength > maxBytes) {
        await response.body?.cancel();
        throw new Error(`The website response exceeds the ${Math.round(maxBytes / 1_000)} KB analysis limit.`);
      }
      const content = await readLimitedBody(response, maxBytes);
      return { content, html: content, finalUrl: current.href, contentType };
    } finally {
      await dispatcher.close().catch(() => {});
    }
  }
  throw new Error('The website redirected too many times.');
}

export async function fetchPublicHtml(initialUrl, options = {}) {
  const result = await fetchPublicContent(initialUrl, options);
  return { html: result.content, finalUrl: result.finalUrl, contentType: result.contentType };
}

function stripTags(value) {
  return value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim();
}

function extractLinks(html) {
  const links = [];
  const anchorPattern = /<(a|button)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi;
  for (const match of html.matchAll(anchorPattern)) {
    const attributes = match[2] || '';
    const text = stripTags(match[3] || '');
    const hrefMatch = attributes.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    links.push({ href: (hrefMatch?.[1] || hrefMatch?.[2] || hrefMatch?.[3] || '').trim(), text });
  }
  return links;
}

export function analyzeHtmlSignals(html, finalUrl) {
  const viewportDetected = /<meta\b[^>]*\bname\s*=\s*["']viewport["'][^>]*>/i.test(html)
    || /<meta\b[^>]*\bname\s*=\s*viewport\b[^>]*>/i.test(html);
  const links = extractLinks(html);
  const ctaPattern = /\b(book|contact|call|request|reserve|order|enquir(?:e|y)|inquir(?:e|y)|get started|schedule|whatsapp|email us|make an appointment)\b/i;
  const ctaDetected = links.some(({ href, text }) => ctaPattern.test(text) || /\/(contact|book|booking|appointment)(\/|\?|#|$)/i.test(href));
  const whatsappFlowDetected = links.some(({ href, text }) => /(?:wa\.me|api\.whatsapp\.com|whatsapp)/i.test(href) || /\bwhatsapp\b/i.test(text));
  const onlineOrderingDetected = links.some(({ href, text }) => /\b(order online|order now|delivery|takeaway|food ordering)\b/i.test(text) || /(?:order|delivery|takeaway|food)/i.test(href));
  const contactFlowDetected = whatsappFlowDetected || links.some(({ href }) => /^(tel:|mailto:|https?:\/\/(?:wa\.me|api\.whatsapp\.com)\/)/i.test(href)
    || /\/(contact|book|booking|appointment)(\/|\?|#|$)/i.test(href));
  const socialDomains = /(?:instagram\.com|facebook\.com|tiktok\.com|linkedin\.com|youtube\.com|youtu\.be|x\.com|twitter\.com)/i;
  const socialLinks = [...new Set(links.map(({ href }) => href).filter((href) => socialDomains.test(href)))].slice(0, 8);
  const jsonLdBlocks = [...html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);
  const structuredContactInfoDetected = /<address\b/i.test(html)
    || jsonLdBlocks.some((block) => /"(?:telephone|address)"\s*:/i.test(block));
  const titleDetected = /<title\b[^>]*>\s*[^<\s][\s\S]*?<\/title>/i.test(html);
  const majorGaps = [!viewportDetected, !ctaDetected, !contactFlowDetected].filter(Boolean).length;

  return {
    finalUrl,
    mobileViewportDetected: viewportDetected,
    ctaDetected,
    contactFlowDetected,
    whatsappFlowDetected,
    onlineOrderingDetected,
    structuredContactInfoDetected,
    titleDetected,
    socialLinks,
    weakWebsite: majorGaps >= 2,
    majorGapCount: majorGaps,
    visualDesignAssessed: false,
    method: 'HTML source inspection only',
  };
}

export async function auditWebsite(rawWebsite) {
  let website;
  try {
    website = new URL(rawWebsite);
  } catch {
    throw new Error('Enter a valid website URL, including https://.');
  }
  assertBusinessWebsiteUrl(website);

  try {
    const { html, finalUrl } = await fetchPublicHtml(website, { validateUrl: assertBusinessWebsiteUrl });
    return analyzeHtmlSignals(html, finalUrl);
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw new Error('The website took too long to respond. Try again later.');
    }
    throw error;
  }
}
