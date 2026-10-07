import dns from 'node:dns/promises';
import net from 'node:net';
import { Agent } from 'undici';

const MAX_HTML_BYTES = 350_000;
const MAX_REDIRECTS = 4;
const REQUEST_TIMEOUT_MS = 8_000;

function publicIPv4(address) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b, c] = parts;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 0 || b === 168)) return false;
  if (a === 192 && b === 0 && c === 2) return false;
  if (a === 198 && (b === 18 || b === 19 || b === 51)) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

function publicIPv6(address) {
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

function isPublicAddress(address) {
  const family = net.isIP(address);
  if (family === 4) return publicIPv4(address);
  if (family === 6) return publicIPv6(address);
  return false;
}

function normalizeHost(hostname) {
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
}

async function getPublicAddresses(hostname) {
  const host = normalizeHost(hostname);
  const family = net.isIP(host);
  const records = family
    ? [{ address: host, family }]
    : await dns.lookup(host, { all: true, verbatim: true });

  if (!records.length || records.some((record) => !isPublicAddress(record.address))) {
    throw new Error('The website host did not resolve to a public address.');
  }
  return records;
}

function assertSafeUrl(url) {
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Only public HTTP or HTTPS websites can be analyzed.');
  if (url.username || url.password) throw new Error('Website URLs with embedded credentials are not allowed.');
  if (url.port && !((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80'))) {
    throw new Error('Non-standard website ports are not allowed.');
  }
  const host = normalizeHost(url.hostname).toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('Local or private website hosts cannot be analyzed.');
  }
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

async function readLimitedBody(response) {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_HTML_BYTES) {
        await reader.cancel();
        throw new Error('The website HTML exceeds the 350 KB analysis limit.');
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total).toString('utf8');
}

async function fetchPublicHtml(initialUrl) {
  let current = initialUrl;
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    assertSafeUrl(current);
    const records = await getPublicAddresses(current.hostname);
    const dispatcher = pinnedAgent(records);
    let response;
    try {
      response = await fetch(current, {
        dispatcher,
        redirect: 'manual',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          'User-Agent': 'AgencyOSWebsiteCheck/1.0 (+https://agencyos.local; limited HTML checks)',
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
        },
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location || redirect === MAX_REDIRECTS) throw new Error('The website redirected too many times or had an invalid redirect.');
        const next = new URL(location, current);
        if (current.protocol === 'https:' && next.protocol !== 'https:') throw new Error('Redirects from HTTPS to HTTP are not followed.');
        current = next;
        continue;
      }

      if (!response.ok) throw new Error(`The website returned HTTP ${response.status}.`);
      const contentType = response.headers.get('content-type') || '';
      if (!/(text\/html|application\/xhtml\+xml)/i.test(contentType)) {
        throw new Error('The website did not return an HTML page that can be analyzed.');
      }
      const declaredLength = Number(response.headers.get('content-length'));
      if (Number.isFinite(declaredLength) && declaredLength > MAX_HTML_BYTES) {
        await response.body?.cancel();
        throw new Error('The website HTML exceeds the 350 KB analysis limit.');
      }
      const html = await readLimitedBody(response);
      return { html, finalUrl: current.href };
    } finally {
      await dispatcher.close().catch(() => {});
    }
  }
  throw new Error('The website redirected too many times.');
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
  assertSafeUrl(website);

  try {
    const { html, finalUrl } = await fetchPublicHtml(website);
    return analyzeHtmlSignals(html, finalUrl);
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw new Error('The website took too long to respond. Try again later.');
    }
    throw error;
  }
}
