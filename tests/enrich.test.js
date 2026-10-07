import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnrichmentService, ENRICHMENT_CACHE_TTL_MS } from '../server/enrich.js';
import {
  assertBusinessWebsiteUrl, assertSafeUrl, fetchPublicContent, isPublicAddress, UnsafeWebsiteError,
} from '../server/websiteAudit.js';
import { applyEnrichmentToCrm } from '../src/lib/crm.js';

const TEST_LEAD = {
  id: 'osm-node/4242', placeId: 'osm-node/4242', source: 'osm',
  name: 'Riverside Dental Care', category: 'Dentist', city: 'Pune',
  website: 'https://riverside-dental.example.org/',
};

function publicLookup() {
  return async () => [{ address: '93.184.216.34', family: 4 }];
}

function htmlResponse(body, status = 200) {
  return new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function textResponse(body, status = 200) {
  return new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

function sampleHtml() {
  return `<!doctype html><html><head><title>Riverside Dental Care</title>
    <meta property="og:site_name" content="Riverside Dental Care">
    <script type="application/ld+json">{
      "@context":"https://schema.org","@type":"Dentist","name":"Riverside Dental Care",
      "email":"info@riverside-dental.example.org","telephone":"+91 20 1234 5678",
      "address":{"streetAddress":"12 MG Road","addressLocality":"Pune","addressRegion":"Maharashtra","postalCode":"411001"},
      "openingHours":["Mo-Fr 09:00-18:00"],
      "hasOfferCatalog":{"@type":"OfferCatalog","itemListElement":[{"@type":"Offer","itemOffered":{"@type":"Service","name":"Dental implants"}}]}
    }</script></head><body>
    <a href="mailto:info@riverside-dental.example.org">Email us</a>
    <a href="mailto:jane.doe@riverside-dental.example.org">Jane Doe's personal mailbox</a>
    <a href="mailto:contact.jane@riverside-dental.example.org">Named contact mailbox</a>
    <a href="tel:+91-20-1234-5678">Call our clinic</a>
    <a href="https://wa.me/919876543210?text=Hi%20there">WhatsApp</a>
    <a href="https://www.instagram.com/riversidedental/">Instagram</a>
    <a href="/contact">Contact us</a>
    <section><h2>Our Services</h2><ul><li>Family dentistry</li><li>Dental implants</li></ul></section>
    <address>12 MG Road, Pune, Maharashtra, 411001</address>
    </body></html>`;
}

test('website enrichment extracts only public business details with source, evidence, and confidence', async () => {
  const calls = [];
  const service = createEnrichmentService();
  const { result, cached } = await service({
    lead: TEST_LEAD,
    tavilyApiKey: 'unused-key',
    lookup: publicLookup(),
    fetcher: async (url, init) => {
      const parsed = new URL(url);
      calls.push({ url: parsed.href, init });
      if (parsed.pathname === '/') return htmlResponse(sampleHtml());
      if (parsed.pathname === '/contact') return htmlResponse('<html><body><a href="mailto:hello@riverside-dental.example.org">Email</a><p>Reception +91 20 1234 5678</p></body></html>');
      return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/html' } });
    },
  });

  assert.equal(cached, false);
  assert.equal(result.status, 'complete');
  assert.equal(result.source, 'website');
  assert.equal(result.email, 'info@riverside-dental.example.org');
  assert.doesNotMatch(result.email, /jane/i, 'named personal mailboxes are not collected');
  assert.equal(result.evidence.some((entry) => entry.field === 'email' && /jane/i.test(entry.value)), false);
  assert.equal(result.phone, '+91-20-1234-5678');
  assert.equal(result.whatsappUrl, 'https://wa.me/919876543210');
  assert.deepEqual(result.socialLinks, ['https://www.instagram.com/riversidedental/']);
  assert.match(result.address, /12 MG Road, Pune, Maharashtra, 411001/);
  assert.equal(result.businessName, 'Riverside Dental Care');
  assert.match(result.services.join(' '), /Dental implants|Family dentistry/);
  assert.equal(result.openingHours, 'Mo-Fr 09:00-18:00');
  assert.equal(result.contactPage, 'https://riverside-dental.example.org/contact');
  assert.ok(result.evidence.every((entry) => entry.source && entry.evidence && ['high', 'medium', 'low'].includes(entry.confidence)));
  assert.ok(result.evidence.some((entry) => entry.source.includes('riverside-dental.example.org')));
  assert.equal(calls[0].url, TEST_LEAD.website, 'the listed website is fetched before any fallback');
  assert.equal(calls.some((call) => new URL(call.url).hostname === 'api.tavily.com'), false);
  assert.equal(calls.some((call) => new URL(call.url).pathname === '/contact'), true);
  assert.equal(calls.some((call) => new URL(call.url).hostname === 'r.jina.ai'), false);
});

test('normal website failures use Jina Reader as a fallback', async () => {
  const calls = [];
  const service = createEnrichmentService();
  const { result } = await service({
    lead: TEST_LEAD,
    lookup: publicLookup(),
    fetcher: async (url) => {
      const parsed = new URL(url);
      calls.push(parsed.href);
      if (parsed.hostname === 'r.jina.ai') {
        return textResponse('Title: Riverside Dental Care\n\n# Contact\nEmail: contact@riverside-dental.example.org\nPhone: +91 20 9876 5432\n[WhatsApp](https://wa.me/919876543210)\n[Instagram](https://instagram.com/riversidedental)\n\n# Services\n- [Dental implants](https://riverside-dental.example.org/implants)');
      }
      return new Response('Unavailable', { status: 503, headers: { 'Content-Type': 'text/html' } });
    },
  });
  assert.equal(result.status, 'complete');
  assert.equal(result.source, 'jina-reader');
  assert.equal(result.email, 'contact@riverside-dental.example.org');
  assert.equal(result.phone, '+91 20 9876 5432');
  assert.ok(result.services.includes('Dental implants'));
  assert.equal(calls[0], TEST_LEAD.website);
  assert.match(calls[1], /^https:\/\/r\.jina\.ai\/https:\/\/riverside-dental\.example\.org\//);
});

test('Tavily is never called without a key when an OSM lead has no website', async () => {
  let requests = 0;
  const service = createEnrichmentService();
  const { result } = await service({
    lead: { ...TEST_LEAD, website: '' },
    fetcher: async () => { requests += 1; throw new Error('Tavily must not be called without a key'); },
  });
  assert.equal(requests, 0);
  assert.equal(result.status, 'no_website');
  assert.equal(result.source, 'openstreetmap');
  assert.match(result.message, /TAVILY_API_KEY is not configured/);
});

test('Tavily searches exact name plus city/category and verifies the candidate public website', async () => {
  const calls = [];
  const service = createEnrichmentService();
  const { result } = await service({
    lead: { ...TEST_LEAD, website: '' },
    tavilyApiKey: 'server-only-test-secret',
    lookup: publicLookup(),
    fetcher: async (url, init = {}) => {
      const parsed = new URL(url);
      calls.push({ url: parsed.href, init });
      if (parsed.hostname === 'api.tavily.com') {
        const body = JSON.parse(init.body);
        assert.match(body.query, /^"Riverside Dental Care" "Pune" Dentist$/);
        assert.equal(body.api_key, 'server-only-test-secret');
        return new Response(JSON.stringify({ results: [{ url: 'https://riverside-dental.example.org/' }] }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (parsed.pathname === '/') return htmlResponse(sampleHtml());
      return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/html' } });
    },
  });
  assert.equal(result.status, 'complete');
  assert.equal(result.source, 'tavily+verified-website');
  assert.equal(result.discoveredWebsite, 'https://riverside-dental.example.org/');
  assert.equal(result.evidence.some((item) => item.field === 'discoveredWebsite' && /matched/.test(item.evidence)), true);
  assert.equal(calls[0].url, 'https://api.tavily.com/search');
});

test('Tavily candidates are rejected unless their fetched public page matches the exact business name', async () => {
  const service = createEnrichmentService();
  const { result } = await service({
    lead: { ...TEST_LEAD, website: '' },
    tavilyApiKey: 'key',
    lookup: publicLookup(),
    fetcher: async (url) => {
      const parsed = new URL(url);
      if (parsed.hostname === 'api.tavily.com') {
        return new Response(JSON.stringify({ results: [{ url: 'https://unrelated-business.example.org/' }] }), { headers: { 'Content-Type': 'application/json' } });
      }
      return htmlResponse('<html><head><title>Another Clinic</title></head><body>Another Clinic in Pune</body></html>');
    },
  });
  assert.equal(result.status, 'no_public_details');
  assert.equal(result.discoveredWebsite, '');
  assert.equal(result.source, 'tavily');
});

test('Tavily verifies the full bounded homepage text, not only its first 300 characters', async () => {
  const service = createEnrichmentService();
  const { result } = await service({
    lead: { ...TEST_LEAD, website: '' },
    tavilyApiKey: 'key',
    lookup: publicLookup(),
    fetcher: async (url) => {
      const parsed = new URL(url);
      if (parsed.hostname === 'api.tavily.com') {
        return new Response(JSON.stringify({ results: [{ url: 'https://riverside-dental.example.org/' }] }), { headers: { 'Content-Type': 'application/json' } });
      }
      return htmlResponse(`<html><head><title>Welcome</title></head><body>${'Public homepage text. '.repeat(25)}Riverside Dental Care</body></html>`);
    },
  });
  assert.equal(result.status, 'complete');
  assert.equal(result.discoveredWebsite, 'https://riverside-dental.example.org/');
});

test('enrichment inspects no more than five pages in a run, including the homepage', async () => {
  const paths = ['/contact', '/contact-us', '/about', '/about-us', '/team', '/services'];
  const links = paths.map((path) => `<a href="${path}">${path}</a>`).join('');
  const calls = [];
  const service = createEnrichmentService();
  await service({
    lead: TEST_LEAD,
    lookup: publicLookup(),
    fetcher: async (url) => {
      const parsed = new URL(url);
      calls.push(parsed.pathname);
      if (parsed.pathname === '/') return htmlResponse(`<html><body>${links}</body></html>`);
      return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/html' } });
    },
  });
  assert.equal(calls.length, 5, 'one homepage plus at most four internal pages');
  assert.deepEqual(new Set(calls.slice(1)), new Set(paths.slice(0, 4)));
});

test('Tavily candidate checks and accepted-site pages share one five-page budget', async () => {
  const pageCalls = [];
  const service = createEnrichmentService();
  const { result } = await service({
    lead: { ...TEST_LEAD, website: '' },
    tavilyApiKey: 'key',
    lookup: publicLookup(),
    fetcher: async (url, init = {}) => {
      const parsed = new URL(url);
      if (parsed.hostname === 'api.tavily.com') {
        return new Response(JSON.stringify({ results: [
          { url: 'https://unrelated-business.example.org/' },
          { url: 'https://riverside-dental.example.org/' },
        ] }), { headers: { 'Content-Type': 'application/json' } });
      }
      pageCalls.push(parsed.href);
      if (parsed.hostname === 'unrelated-business.example.org') {
        return htmlResponse('<html><title>Another Clinic</title><body>Another Clinic</body></html>');
      }
      if (parsed.pathname === '/') {
        const links = ['/contact', '/contact-us', '/about', '/about-us', '/team']
          .map((path) => `<a href="${path}">${path}</a>`).join('');
        return htmlResponse(`<html><title>Riverside Dental Care</title><body>Riverside Dental Care ${links}</body></html>`);
      }
      return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/html' } });
    },
  });
  assert.equal(result.status, 'complete');
  assert.equal(pageCalls.length, 5);
  assert.equal(pageCalls.filter((url) => new URL(url).hostname === 'unrelated-business.example.org').length, 1);
  assert.equal(pageCalls.filter((url) => new URL(url).hostname === 'riverside-dental.example.org').length, 4);
});

test('server enrichment cache reuses a result for 24 hours and expires it afterward', async () => {
  let now = Date.parse('2026-10-07T12:00:00.000Z');
  let requests = 0;
  const service = createEnrichmentService({ now: () => now });
  const lead = { ...TEST_LEAD, website: '' };
  const first = await service({ lead });
  const second = await service({ lead, fetcher: async () => { requests += 1; throw new Error('cached value expected'); } });
  assert.equal(first.cached, false);
  assert.equal(second.cached, true);
  assert.equal(second.result.timestamp, first.result.timestamp);
  assert.equal(requests, 0);
  now += ENRICHMENT_CACHE_TTL_MS + 1;
  const third = await service({ lead });
  assert.equal(third.cached, false);
  assert.notEqual(third.result.timestamp, first.result.timestamp);
});

test('applying enrichment keeps existing user-entered and verified contact fields unchanged', () => {
  const crm = applyEnrichmentToCrm({
    email: 'owner@example.com', emailVerifiedByUser: true, emailPermissionConfirmed: true,
    whatsappOptInConfirmed: true, enrichmentEmail: '', enrichmentPhone: '',
  }, {
    status: 'complete', timestamp: '2026-10-07T12:00:00.000Z', source: 'website', confidence: 'high',
    email: 'info@example.org', phone: '+1 555 0100', whatsappUrl: 'https://wa.me/15550100',
    evidence: [{ field: 'email', value: 'info@example.org', source: 'Website /contact', evidence: 'Public mailto link', confidence: 'high' }],
  });
  assert.equal(crm.email, 'owner@example.com');
  assert.equal(crm.emailVerifiedByUser, true);
  assert.equal(crm.emailPermissionConfirmed, true);
  assert.equal(crm.whatsappOptInConfirmed, true);
  assert.equal(crm.enrichmentEmail, 'info@example.org');
  assert.equal(crm.enrichmentPhone, '+1 555 0100');
});

test('SSRF validation blocks loopback, private, link-local, and internal hostname targets', () => {
  for (const url of [
    'http://127.0.0.1/', 'http://2130706433/', 'http://0x7f000001/', 'http://10.0.0.8/',
    'http://172.16.0.1/', 'http://192.168.1.2/', 'http://192.0.2.1/',
    'http://169.254.169.254/', 'http://[::1]/', 'http://[2001:db8::1]/', 'http://metadata.google.internal/',
    'https://service.local/', 'https://printer.lan/', 'file:///etc/passwd',
  ]) assert.throws(() => assertSafeUrl(url), UnsafeWebsiteError, url);
  assert.equal(isPublicAddress('93.184.216.34'), true);
  assert.equal(isPublicAddress('10.0.0.1'), false);
  assert.equal(isPublicAddress('169.254.169.254'), false);
  assert.equal(isPublicAddress('fc00::1'), false);
  assert.equal(isPublicAddress('fe80::1'), false);
});

test('public website fetching rejects Google Maps URLs and map redirects', () => {
  for (const url of [
    'https://www.google.com/maps/place/Riverside', 'https://maps.google.co.uk/',
    'https://maps.app.goo.gl/abc123', 'https://goo.gl/maps/abc123',
  ]) assert.throws(() => assertBusinessWebsiteUrl(url), UnsafeWebsiteError, url);
  assert.equal(assertBusinessWebsiteUrl('https://www.google.com/').hostname, 'www.google.com');
});

test('DNS resolution with any private address fails closed before the HTTP fetch', async () => {
  let requests = 0;
  await assert.rejects(fetchPublicContent('https://mixed.example.org/', {
    lookup: async () => [
      { address: '93.184.216.34', family: 4 },
      { address: '192.168.1.2', family: 4 },
    ],
    fetcher: async () => { requests += 1; return htmlResponse('<p>unsafe</p>'); },
  }), UnsafeWebsiteError);
  assert.equal(requests, 0);
});

test('DNS lookup timeouts fail closed before the HTTP request', async () => {
  let requests = 0;
  await assert.rejects(fetchPublicContent('https://slow.example.org/', {
    dnsTimeoutMs: 5,
    lookup: () => new Promise(() => {}),
    fetcher: async () => { requests += 1; return htmlResponse('<p>unreachable</p>'); },
  }), UnsafeWebsiteError);
  assert.equal(requests, 0);
});

test('unsafe redirects to loopback and HTTPS-to-HTTP downgrades are never followed', async () => {
  for (const location of ['http://127.0.0.1/admin', 'http://public.example.org/']) {
    let requests = 0;
    await assert.rejects(fetchPublicContent('https://public.example.org/', {
      lookup: publicLookup(),
      fetcher: async () => {
        requests += 1;
        return new Response('', { status: 302, headers: { Location: location } });
      },
    }), UnsafeWebsiteError);
    assert.equal(requests, 1, `redirect to ${location} must not be fetched`);
  }
});

test('enrichment never follows a public-website redirect into Google Maps', async () => {
  let requests = 0;
  const service = createEnrichmentService();
  await assert.rejects(service({
    lead: TEST_LEAD,
    lookup: publicLookup(),
    fetcher: async () => {
      requests += 1;
      return new Response(null, { status: 302, headers: { Location: 'https://www.google.com/maps/place/Riverside' } });
    },
  }), UnsafeWebsiteError);
  assert.equal(requests, 1);
});

test('website response size is enforced while reading a mocked response', async () => {
  await assert.rejects(fetchPublicContent('https://public.example.org/', {
    lookup: publicLookup(),
    maxBytes: 8,
    fetcher: async () => htmlResponse('<html>response too large</html>'),
  }), /exceeds the 0 KB analysis limit/);
});
