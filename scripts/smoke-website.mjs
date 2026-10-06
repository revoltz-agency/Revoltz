#!/usr/bin/env node
/**
 * Live website-analysis integration test.
 *
 * Spins up a local fixture site (known HTML properties, robots.txt, redirects,
 * a JSON endpoint and a slow endpoint) plus an app instance with the
 * testing-only `WEBSITE_ANALYSIS_ALLOW_PRIVATE=true` flag, then asserts the REAL
 * fetch path: robots.txt handling, HTML heuristics, scoring impact, content-type
 * and timeout behaviour. No internet access required.
 *
 * Usage: npm run build && node scripts/smoke-website.mjs
 */

import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_PORT = Number(process.env.WEB_APP_PORT || 3101);
const SITE_PORT = Number(process.env.WEB_SITE_PORT || 3998);
const DATA_FILE = path.join(ROOT, 'data', 'smoke-website.json');

let passed = 0;
let failed = 0;
const failures = [];
function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
const label = (n) => console.log(`\n▸ ${n}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Fixture site ─────────────────────────────────────────────────────────
const YEAR = new Date().getUTCFullYear();

const GOOD_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mock Modern Dental Clinic | Family Dentistry in Pune</title>
<meta name="description" content="A meta description long enough to pass the heuristic check because it comfortably exceeds seventy characters.">
<style>@media (max-width: 600px) { .hide-me { display: none; } }</style>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Dentist","name":"Mock Modern Dental Clinic","email":"hello@mockmodern.example","telephone":"+912040001234","address":{"@type":"PostalAddress","streetAddress":"1 MG Road","addressLocality":"Pune","postalCode":"411001"},"openingHoursSpecification":[{"@type":"OpeningHoursSpecification","dayOfWeek":["Monday","Tuesday"],"opens":"09:00","closes":"20:00"}],"sameAs":["https://instagram.com/mockmodern"]}</script>
</head>
<body>
<h1>Mock Modern Dental Clinic</h1>
<p>Visit us at 1 MG Road, Pune 411001. Opening hours: Monday to Saturday, 9 am to 8 pm. Phone +91 20 4000 1234.</p>
<a href="tel:+912040001234">Call now</a>
<a href="mailto:hello@mockmodern.example">Email us</a>
<a href="https://wa.me/912040001234?text=Hi">Chat on WhatsApp</a>
<a href="https://facebook.com/mockmodern">Facebook</a>
<a href="https://instagram.com/mockmodern">Instagram</a>
<a href="/book">Book online</a>
<a href="/quote">Get a quote</a>
<a href="/contact">Contact us</a>
<form action="/enquire" method="post">
  <input type="email" name="email" placeholder="Your email">
  <input type="tel" name="phone" placeholder="Your phone">
  <textarea name="message"></textarea>
  <button type="submit">Book an appointment</button>
</form>
<img src="/hero.webp" alt="Clinic reception" width="1200" height="600" loading="lazy">
<p>&copy; ${YEAR} Mock Modern Dental Clinic</p>
</body>
</html>`;

const BAD_PAGE = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Old</title>
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<script src="/js/jquery-1.11.0.min.js"></script>
<script src="/js/jquery-1.11.0.plugins.js"></script>
<script src="/js/a.js"></script>
<script src="/js/b.js"></script>
<script src="/js/c.js"></script>
<script src="/js/d.js"></script>
<script src="/js/e.js"></script>
<link rel="stylesheet" href="/css/bootstrap/3.3.7/css/bootstrap.min.css">
</head>
<body bgcolor="#ffffff">
<marquee scrollamount="3">Welcome to our website</marquee>
<font size="2">Legacy Dental Care</font>
<table width="100%" cellpadding="4"><tr><td>Left column</td><td>Right column</td></tr></table>
<img src="/photo1.jpg"><img src="/photo2.jpg">
<p>Copyright 2015 Legacy Dental Care</p>
</body>
</html>`;

const fixtureServer = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${SITE_PORT}`);
  const set = (status, body, type = 'text/html; charset=utf-8', extra = {}) => {
    res.writeHead(status, { 'Content-Type': type, 'Content-Length': Buffer.byteLength(body), ...extra });
    res.end(body);
  };

  if (url.pathname === '/robots.txt') {
    return set(200, 'User-agent: *\nDisallow: /blocked\nAllow: /good\n', 'text/plain');
  }
  if (url.pathname === '/good') {
    return set(200, GOOD_PAGE, 'text/html; charset=utf-8', { 'Last-Modified': new Date().toUTCString() });
  }
  if (url.pathname === '/bad') {
    return set(200, BAD_PAGE, 'text/html; charset=utf-8', { 'Last-Modified': 'Mon, 01 Jun 2015 10:00:00 GMT' });
  }
  if (url.pathname === '/redirect') {
    res.writeHead(302, { Location: '/good' });
    return res.end();
  }
  if (url.pathname === '/blocked/page') {
    return set(200, GOOD_PAGE);
  }
  if (url.pathname === '/data.json') {
    return set(200, JSON.stringify({ hello: 'world' }), 'application/json');
  }
  if (url.pathname === '/slow') {
    return setTimeout(() => set(200, GOOD_PAGE), 6000);
  }
  if (url.pathname === '/broken') {
    return set(500, 'Internal Server Error', 'text/plain');
  }
  return set(404, '<html><head><title>Not found</title></head><body>404</body></html>');
});

// ── Helpers ──────────────────────────────────────────────────────────────
/** `npx next start` spawns a child; kill the whole process group. */
function killTree(child) {
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    try {
      child.kill('SIGTERM');
    } catch {
      /* already gone */
    }
  }
  setTimeout(() => {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      /* already gone */
    }
  }, 1500).unref?.();
}

async function waitForApp(url, timeoutMs = 45_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      if ((await fetch(url)).ok) return true;
    } catch {
      /* not ready */
    }
    await sleep(400);
  }
  return false;
}

async function call(method, p, body) {
  const res = await fetch(`http://127.0.0.1:${APP_PORT}${p}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
}

function livePlace(id, website) {
  return {
    placeId: id,
    displayName: `Analysis Target ${id}`,
    formattedAddress: '1 Test Street, Pune, Maharashtra 411001',
    nationalPhoneNumber: '9000000000',
    internationalPhoneNumber: '+919000000000',
    websiteUri: website,
    rating: 4.2,
    userRatingCount: 180,
    googleMapsUri: 'https://www.google.com/maps/search/?api=1&query=test',
    primaryType: 'dentist',
    types: ['dentist', 'health'],
    businessStatus: 'OPERATIONAL',
    openNow: true,
    priceLevel: null,
    retrievedAt: new Date().toISOString(),
    source: 'google_places',
  };
}

async function makeLead(id, website) {
  const res = await call('POST', '/api/leads/import', { candidates: [{ place: livePlace(id, website) }], isDemo: false });
  const lead = res.json?.imported?.[0];
  if (!lead) throw new Error(`could not create lead ${id}: ${res.text?.slice(0, 200)}`);
  return lead;
}

async function analyze(leadId) {
  const res = await call('POST', `/api/leads/${leadId}/analysis`, {});
  return { res, analysis: res.json?.analysis, lead: res.json?.lead };
}

// ── Run ──────────────────────────────────────────────────────────────────
async function main() {
  if (fs.existsSync(DATA_FILE)) fs.rmSync(DATA_FILE);
  await new Promise((r) => fixtureServer.listen(SITE_PORT, '127.0.0.1', r));
  console.log(`Fixture site on 127.0.0.1:${SITE_PORT}`);

  const app = spawn('npx', ['next', 'start', '-p', String(APP_PORT), '-H', '127.0.0.1'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(APP_PORT),
      WEBSITE_ANALYSIS_ENABLED: 'true',
      WEBSITE_ANALYSIS_ALLOW_PRIVATE: 'true',
      WEBSITE_ANALYSIS_TIMEOUT_MS: '2000',
      AGENCYOS_DATA_FILE: DATA_FILE,
      AGENCYOS_SEED_DEMO: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  let appLog = '';
  app.stdout.on('data', (d) => (appLog += d.toString()));
  app.stderr.on('data', (d) => (appLog += d.toString()));

  const createdLeadIds = [];
  try {
    if (!(await waitForApp(`http://127.0.0.1:${APP_PORT}/api/status`))) {
      console.error('App did not become ready.\n', appLog.slice(-2500));
      process.exit(2);
    }

    // ── Good page ────────────────────────────────────────────────────────
    label('1. Strong site: real fetch, real signals');
    const good = await makeLead('SMOKE_WEB_GOOD', `http://127.0.0.1:${SITE_PORT}/good`);
    createdLeadIds.push(good.id);
    const g = await analyze(good.id);
    check('page fetched', g.analysis?.fetched === true, JSON.stringify(g.analysis?.skippedReason));
    check('mode is live', g.analysis?.mode === 'live');
    check('HTTP 200 recorded', g.analysis?.http?.status === 200);
    check('byte count recorded', (g.analysis?.http?.bytes ?? 0) > 500, String(g.analysis?.http?.bytes));
    check('Last-Modified header captured', Boolean(g.analysis?.http?.lastModified));
    check('robots.txt allowed the path', g.analysis?.robotsAllowed === true);
    const gs = Object.fromEntries((g.analysis?.signals ?? []).map((s) => [s.key, s]));
    check('viewport detected → pass', gs.mobile_viewport?.result === 'pass', gs.mobile_viewport?.result);
    check('media queries counted in evidence', /@media|media rule/i.test(gs.mobile_viewport?.detail ?? ''), gs.mobile_viewport?.detail);
    check('plain HTTP flagged → fail', gs.https?.result === 'fail', gs.https?.result);
    check('CTAs detected → pass', gs.cta?.result === 'pass', `${gs.cta?.result}: ${gs.cta?.detail}`);
    check('enquiry form detected → pass', gs.enquiry_form?.result === 'pass', gs.enquiry_form?.detail);
    check('contact flow (tel+mailto+wa.me) → pass', gs.contact_flow?.result === 'pass', gs.contact_flow?.detail);
    check('title + meta description → pass', gs.seo_basics?.result === 'pass', gs.seo_basics?.detail);
    check('single h1 → pass', gs.h1?.result === 'pass', gs.h1?.result);
    check('freshness from copyright year → pass', gs.freshness?.result === 'pass', gs.freshness?.detail);
    check('no legacy markers → pass', gs.stack?.result === 'pass', gs.stack?.detail);
    check('business info from JSON-LD → pass', gs.business_info?.result === 'pass', gs.business_info?.detail);
    check('social profiles extracted', (g.analysis?.socialLinks ?? []).some((s) => s.platform === 'instagram'), JSON.stringify(g.analysis?.socialLinks));
    check('public email discovered', g.analysis?.findings?.discoveredEmail === 'hello@mockmodern.example', g.analysis?.findings?.discoveredEmail);
    check('discovered email saved to the lead', g.lead?.email === 'hello@mockmodern.example', g.lead?.email);
    check('email source recorded as website_analysis', g.lead?.emailSource === 'website_analysis', g.lead?.emailSource);
    check('site quality strong', g.analysis?.siteQuality === 'strong', `${g.analysis?.siteQuality} (${g.analysis?.siteScore})`);
    check('site score >= 75', (g.analysis?.siteScore ?? 0) >= 75, String(g.analysis?.siteScore));
    check('disclaimer says heuristic, not Lighthouse', /not a Lighthouse/i.test(g.analysis?.disclaimer ?? ''));
    check('opportunity text is grounded', (g.analysis?.potentialOpportunity ?? '').length > 30);
    const gScore = g.lead?.score;
    check('weak-website factor NOT awarded for a strong site', gScore?.factors?.find((f) => f.key === 'weak_website')?.state === 'not-met', gScore?.factors?.find((f) => f.key === 'weak_website')?.state);
    check('social presence factor awarded (+5)', gScore?.factors?.find((f) => f.key === 'social_presence')?.awarded === 5);
    check('missing-enquiry-flow factor not met', gScore?.factors?.find((f) => f.key === 'missing_enquiry_flow')?.state === 'not-met');
    check('data coverage is 100% after audit', gScore?.dataCoverage === 100, String(gScore?.dataCoverage));

    // ── Bad page ─────────────────────────────────────────────────────────
    label('2. Weak site: issues detected from the HTML');
    const bad = await makeLead('SMOKE_WEB_BAD', `http://127.0.0.1:${SITE_PORT}/bad`);
    createdLeadIds.push(bad.id);
    const b = await analyze(bad.id);
    const bs = Object.fromEntries((b.analysis?.signals ?? []).map((s) => [s.key, s]));
    check('viewport missing → fail', bs.mobile_viewport?.result === 'fail', bs.mobile_viewport?.result);
    check('no CTA → fail', bs.cta?.result === 'fail', bs.cta?.result);
    check('no form → fail', bs.enquiry_form?.result === 'fail', bs.enquiry_form?.result);
    check('no contact links → fail', bs.contact_flow?.result === 'fail', bs.contact_flow?.result);
    check('no h1 → fail', bs.h1?.result === 'fail', bs.h1?.result);
    check('stale content (2015) → fail', bs.freshness?.result === 'fail', bs.freshness?.detail);
    check('legacy markers detected → fail', bs.stack?.result === 'fail', bs.stack?.detail);
    check('legacy evidence lists real markers', /marquee|jquery 1|bootstrap/i.test(bs.stack?.detail ?? ''), bs.stack?.detail);
    check('page weight heuristic flagged', ['warn', 'pass'].includes(bs.page_weight?.result), bs.page_weight?.result);
    check('site quality weak', b.analysis?.siteQuality === 'weak', `${b.analysis?.siteQuality} (${b.analysis?.siteScore})`);
    check('site score < 50', (b.analysis?.siteScore ?? 100) < 50, String(b.analysis?.siteScore));
    check('conversion issues listed', (b.analysis?.findings?.conversionIssues ?? []).length >= 3, JSON.stringify(b.analysis?.findings?.conversionIssues));
    check('no fabricated email', b.analysis?.findings?.discoveredEmail === null, String(b.analysis?.findings?.discoveredEmail));
    check('no fabricated social links', (b.analysis?.socialLinks ?? []).length === 0);
    check('weak-website factor awarded (+20)', b.lead?.score?.factors?.find((f) => f.key === 'weak_website')?.awarded === 20);
    check('missing-enquiry-flow awarded (+10)', b.lead?.score?.factors?.find((f) => f.key === 'missing_enquiry_flow')?.awarded === 10);
    check('opportunity mentions a rebuild', /mobile|enquiry|WhatsApp/i.test(b.analysis?.potentialOpportunity ?? ''), b.analysis?.potentialOpportunity);

    // ── robots.txt ───────────────────────────────────────────────────────
    label('3. robots.txt is honoured');
    const blocked = await makeLead('SMOKE_WEB_BLOCKED', `http://127.0.0.1:${SITE_PORT}/blocked/page`);
    createdLeadIds.push(blocked.id);
    const bl = await analyze(blocked.id);
    check('disallowed path not fetched', bl.analysis?.fetched === false, JSON.stringify(bl.analysis?.fetched));
    check('robotsAllowed === false', bl.analysis?.robotsAllowed === false);
    check('reason mentions robots.txt', /robots\.txt/i.test(bl.analysis?.skippedReason ?? ''), bl.analysis?.skippedReason);
    check('no signals invented', (bl.analysis?.signals ?? []).length === 0);
    check('site quality unknown', bl.analysis?.siteQuality === 'unknown', bl.analysis?.siteQuality);
    check('score keeps website factor unknown', bl.lead?.score?.factors?.find((f) => f.key === 'weak_website')?.state === 'unknown');
    check('score coverage drops honestly', (bl.lead?.score?.dataCoverage ?? 100) < 100, String(bl.lead?.score?.dataCoverage));

    // ── Redirect ─────────────────────────────────────────────────────────
    label('4. Redirects are followed and reported');
    const redirected = await makeLead('SMOKE_WEB_REDIRECT', `http://127.0.0.1:${SITE_PORT}/redirect`);
    createdLeadIds.push(redirected.id);
    const rd = await analyze(redirected.id);
    check('fetched through the redirect', rd.analysis?.fetched === true, JSON.stringify(rd.analysis?.skippedReason));
    check('final URL recorded', (rd.analysis?.http?.finalUrl ?? '').endsWith('/good'), rd.analysis?.http?.finalUrl);
    check('redirect surfaced as a signal', (rd.analysis?.signals ?? []).some((s) => s.key === 'redirect' || /redirect/i.test(s.detail)));

    // ── Non-HTML, timeout, HTTP error ────────────────────────────────────
    label('5. Non-HTML, timeouts and HTTP errors are reported honestly');
    const json = await makeLead('SMOKE_WEB_JSON', `http://127.0.0.1:${SITE_PORT}/data.json`);
    createdLeadIds.push(json.id);
    const js = await analyze(json.id);
    check('JSON response not treated as a website audit', js.analysis?.fetched === false, JSON.stringify(js.analysis?.fetched));
    check('reason mentions the content type', /application\/json|instead of HTML/i.test(js.analysis?.skippedReason ?? ''), js.analysis?.skippedReason);

    const slow = await makeLead('SMOKE_WEB_SLOW', `http://127.0.0.1:${SITE_PORT}/slow`);
    createdLeadIds.push(slow.id);
    const sl = await analyze(slow.id);
    check('slow site times out instead of hanging', sl.analysis?.fetched === false);
    check('reason mentions the timeout', /timed out|timeout/i.test(sl.analysis?.skippedReason ?? ''), sl.analysis?.skippedReason);

    const broken = await makeLead('SMOKE_WEB_500', `http://127.0.0.1:${SITE_PORT}/broken`);
    createdLeadIds.push(broken.id);
    const br = await analyze(broken.id);
    check('HTTP 500 reported, not fabricated', br.analysis?.fetched === false);
    check('reason mentions HTTP 500', /500/.test(br.analysis?.skippedReason ?? ''), br.analysis?.skippedReason);

    const missing = await makeLead('SMOKE_WEB_NONE', null);
    createdLeadIds.push(missing.id);
    const ms = await analyze(missing.id);
    check('lead without a website is handled', ms.analysis?.fetched === false);
    check('reason says no website is listed', /no website/i.test(ms.analysis?.skippedReason ?? ''), ms.analysis?.skippedReason);
    check('opportunity still useful (build a website)', /website/i.test(ms.analysis?.potentialOpportunity ?? ''));
    check('missing-enquiry-flow awarded without a site', ms.lead?.score?.factors?.find((f) => f.key === 'missing_enquiry_flow')?.awarded === 10);

    // ── Pitch uses audit findings ────────────────────────────────────────
    label('6. Outreach copy reflects the audited gaps');
    const pitch = await call('POST', `/api/leads/${bad.id}/pitch`, {});
    const wa = pitch.json?.outreach?.whatsappDraft ?? '';
    const body = pitch.json?.outreach?.emailBody ?? '';
    check('pitch generated', pitch.status === 200 && body.length > 60, `HTTP ${pitch.status}`);
    check('copy references a real audited gap', /mobile|enquiry|WhatsApp|dated/i.test(body + wa), body.slice(0, 160));
    check('copy does not invent metrics', !/\b\d+(\.\d+)?[x%]\s+(more|increase|growth)\b/i.test(body), body.slice(0, 200));
    check('factsUsed mentions the audit', (pitch.json?.outreach?.factsUsed ?? []).some((f) => /score|form|WhatsApp|website/i.test(f)), JSON.stringify(pitch.json?.outreach?.factsUsed));

    // ── Cleanup ──────────────────────────────────────────────────────────
    label('7. Cleanup');
    for (const id of createdLeadIds) await call('DELETE', `/api/leads/${id}`);
    const remaining = await call('GET', '/api/leads');
    check('all test leads removed', (remaining.json?.total ?? 1) === 0, String(remaining.json?.total));
  } finally {
    killTree(app);
    await sleep(400);
    fixtureServer.close();
    if (fs.existsSync(DATA_FILE)) fs.rmSync(DATA_FILE);
  }

  console.log('\n──────────────────────────────────────────');
  console.log(`Passed: ${passed}   Failed: ${failed}`);
  if (failures.length) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  • ${f}`);
  }
  console.log('──────────────────────────────────────────');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Website-analysis smoke run crashed:', err);
  process.exit(2);
});
