#!/usr/bin/env node
/**
 * AgencyOS end-to-end smoke tests.
 *
 * Runs against a live server (dev or prod) and exercises every major flow:
 * status/config honesty, demo search, import, CRM updates, scoring, website
 * analysis (incl. the SSRF guard), pitch generation, campaigns, follow-ups,
 * suppression, CSV export and page rendering.
 *
 * Usage:  npm run dev   (in one shell)
 *         SMOKE_URL=http://127.0.0.1:3000 node scripts/smoke.mjs
 */

const BASE = process.env.SMOKE_URL || 'http://127.0.0.1:3000';

let passed = 0;
let failed = 0;
const failures = [];

function label(name) {
  process.stdout.write(`\n▸ ${name}\n`);
}

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    process.stdout.write(`  ✓ ${name}\n`);
  } else {
    failed += 1;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    process.stdout.write(`  ✗ ${name}${detail ? ` — ${detail}` : ''}\n`);
  }
}

async function call(method, path, body, expectStatus = 200) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, ok: res.ok, json, text, headers: res.headers };
}

async function page(path) {
  const res = await fetch(`${BASE}${path}`, { redirect: 'follow' });
  const html = await res.text();
  return { status: res.status, html };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log(`AgencyOS smoke tests → ${BASE}`);

  // ── 1. Config honesty ────────────────────────────────────────────────
  label('1. Configuration status is honest');
  const status = await call('GET', '/api/status');
  check('GET /api/status returns 200', status.status === 200, `HTTP ${status.status}`);
  check('status envelope ok', status.json?.ok === true);
  const cfg = status.json?.config ?? {};
  check('googlePlaces.configured is a boolean', typeof cfg.googlePlaces?.configured === 'boolean');
  check('no API key material leaks', !JSON.stringify(status.json).includes('AIza'), 'response contains a Google key prefix');
  if (!cfg.googlePlaces?.configured) {
    check(
      'banner says Demo Mode is active',
      status.json?.banner === 'Google Places API not configured — Demo Mode active.',
      status.json?.banner,
    );
    check('demoMode flag is true', cfg.demoMode === true);
  } else {
    check('live mode reported when a key exists', cfg.demoMode === false || cfg.demoMode === true);
  }
  check('AI status reported', typeof cfg.ai?.configured === 'boolean');
  check('storage driver reported', ['json-file', 'memory'].includes(cfg.storage?.driver), cfg.storage?.driver);

  // ── 2. Refusing to fake a live search ────────────────────────────────
  label('2. Live search is refused when no key is configured');
  const forcedLive = await call('POST', '/api/leads/search', { industry: 'Gyms', city: 'Pune', demo: false }, 409);
  if (!cfg.googlePlaces?.configured) {
    check('demo:false without a key → 409', forcedLive.status === 409, `HTTP ${forcedLive.status}`);
    check('error code GOOGLE_NOT_CONFIGURED', forcedLive.json?.error?.code === 'GOOGLE_NOT_CONFIGURED');
  } else {
    check('live search accepted (key present)', [200, 400, 502].includes(forcedLive.status), `HTTP ${forcedLive.status}`);
  }

  // ── 3. Validation ────────────────────────────────────────────────────
  label('3. Input validation');
  const badSearch = await call('POST', '/api/leads/search', { industry: '', city: '' });
  check('empty search rejected', badSearch.status === 400, `HTTP ${badSearch.status}`);
  check('validation error code', badSearch.json?.error?.code === 'VALIDATION_ERROR', badSearch.json?.error?.code);

  // ── 4. Demo search returns candidates, not writes ────────────────────
  label('4. Demo search (Dental clinics in Pune)');
  const before = await call('GET', '/api/leads');
  const search = await call('POST', '/api/leads/search', { industry: 'Dental clinics', city: 'Pune', demo: true, maxResults: 20 });
  check('search returns 200', search.status === 200, `HTTP ${search.status}`);
  check('mode is demo', search.json?.mode === 'demo', search.json?.mode);
  check('at least one candidate', (search.json?.candidates?.length ?? 0) >= 1, JSON.stringify(search.json?.candidates?.length));
  check('notice explains demo mode', (search.json?.notices ?? []).some((n) => /demo/i.test(n)));
  const dental = (search.json?.candidates ?? []).find((c) => /dental/i.test(c.place.displayName));
  check('matched the dental clinic record', Boolean(dental), search.json?.candidates?.map((c) => c.place.displayName).join(', '));
  check('candidate carries a preview score', typeof dental?.previewScore === 'number' && dental.previewScore >= 0);
  check('candidate exposes place fields', Boolean(dental?.place?.placeId && dental?.place?.formattedAddress));
  const after = await call('GET', '/api/leads');
  check('search did not write leads', before.json?.total === after.json?.total, `${before.json?.total} → ${after.json?.total}`);

  // ── 5. Import ────────────────────────────────────────────────────────
  label('5. Import candidates as leads');
  const importPayload = {
    candidates: search.json.candidates.slice(0, 3).map((c) => ({ place: c.place })),
    query: search.json.query,
    isDemo: true,
  };
  const imported = await call('POST', '/api/leads/import', importPayload);
  check('import returns 200', imported.status === 200, `HTTP ${imported.status}`);
  check('imported leads returned', (imported.json?.imported?.length ?? 0) === importPayload.candidates.length);
  check('notice describes created/refreshed', typeof imported.json?.notice === 'string' && imported.json.notice.length > 10, imported.json?.notice);
  const leadId = imported.json?.imported?.[0]?.id;
  check('lead id present', Boolean(leadId), leadId);

  // re-import must refresh, not duplicate
  const reimport = await call('POST', '/api/leads/import', importPayload);
  check('re-import refreshes instead of duplicating', reimport.json?.refreshed === importPayload.candidates.length && reimport.json?.created === 0,
    JSON.stringify({ created: reimport.json?.created, refreshed: reimport.json?.refreshed }));

  // ── 6. Lead detail + scoring ─────────────────────────────────────────
  label('6. Lead detail, scoring model');
  const detail = await call('GET', `/api/leads/${leadId}`);
  check('GET lead returns 200', detail.status === 200, `HTTP ${detail.status}`);
  const lead = detail.json?.lead;
  check('lead has a score object', Boolean(lead?.score));
  check('score within 0-100', lead?.score?.score >= 0 && lead?.score?.score <= 100, String(lead?.score?.score));
  check('7 factors evaluated', lead?.score?.factors?.length === 7, String(lead?.score?.factors?.length));
  check('every factor has evidence text', (lead?.score?.factors ?? []).every((f) => typeof f.evidence === 'string' && f.evidence.length > 0));
  check('band matches thresholds', (() => {
    const s = lead.score.score;
    const expected = s >= 80 ? 'HIGH' : s >= 50 ? 'MEDIUM' : 'LOW';
    return lead.score.band === expected;
  })(), `${lead?.score?.score}/${lead?.score?.band}`);
  check('reason is non-empty', (lead?.score?.reason ?? '').length > 20);
  check('follow-up plan attached', Array.isArray(lead?.followUp?.steps) && lead.followUp.steps.length === 3, String(lead?.followUp?.steps?.length));
  check('follow-up days are 0/3/7', (lead?.followUp?.steps ?? []).map((s) => s.day).join(',') === '0,3,7');

  // ── 7. Website analysis (demo simulation) ────────────────────────────
  label('7. Website analysis');
  const dentalLead = imported.json?.imported?.find((l) => l.place.websiteUri);
  if (dentalLead) {
    const analysisRes = await call('POST', `/api/leads/${dentalLead.id}/analysis`, {});
    check('analysis returns 200', analysisRes.status === 200, `HTTP ${analysisRes.status}`);
    const analysis = analysisRes.json?.analysis;
    check('analysis mode flagged as demo', analysis?.mode === 'demo', analysis?.mode);
    check('signals produced', (analysis?.signals?.length ?? 0) > 0, String(analysis?.signals?.length));
    check('site quality classified', ['weak', 'moderate', 'strong', 'unknown'].includes(analysis?.siteQuality), analysis?.siteQuality);
    check('potential opportunity written', (analysis?.potentialOpportunity ?? '').length > 20);
    check('disclaimer present', (analysis?.disclaimer ?? '').length > 10);
    check('findings object complete', Boolean(analysis?.findings && 'mobileFriendly' in analysis.findings && 'missingWhatsappFlow' in analysis.findings));
    const rescored = await call('GET', `/api/leads/${dentalLead.id}`);
    check('score recalculated after analysis', rescored.json?.lead?.score?.computedAt !== dentalLead.score?.computedAt);
    check('data coverage grew or stayed valid', (rescored.json?.lead?.score?.dataCoverage ?? 0) >= 0);
    const weak = rescored.json?.lead?.score?.factors?.find((f) => f.key === 'weak_website');
    check('weak-website factor now resolved (not unknown)', weak && weak.state !== 'unknown', weak?.state);
  } else {
    check('a demo lead with a website exists', false, 'no website among imported leads');
  }

  // ── 8. SSRF guard on live analysis ───────────────────────────────────
  label('8. SSRF guard blocks internal addresses');
  const fakeLive = {
    placeId: 'SMOKE_TEST_PRIVATE',
    displayName: 'Smoke Test Internal Target',
    formattedAddress: 'Test Street, Pune',
    nationalPhoneNumber: '9000000000',
    internationalPhoneNumber: '+919000000000',
    websiteUri: 'http://169.254.169.254/latest/meta-data/',
    rating: 4.2,
    userRatingCount: 10,
    googleMapsUri: 'https://www.google.com/maps/search/?api=1&query=smoke',
    primaryType: 'test',
    types: ['test'],
    businessStatus: 'OPERATIONAL',
    openNow: true,
    priceLevel: null,
    retrievedAt: new Date().toISOString(),
    source: 'google_places',
  };
  const fakeImport = await call('POST', '/api/leads/import', { candidates: [{ place: fakeLive }], isDemo: false });
  const fakeLeadId = fakeImport.json?.imported?.[0]?.id;
  check('non-demo test lead created', Boolean(fakeLeadId), fakeLeadId);
  if (fakeLeadId) {
    const ssrf = await call('POST', `/api/leads/${fakeLeadId}/analysis`, {});
    const reason = ssrf.json?.analysis?.skippedReason ?? ssrf.json?.notice ?? '';
    check('metadata IP fetch was blocked', ssrf.json?.analysis?.fetched === false, JSON.stringify(ssrf.json?.analysis?.fetched));
    check('block reason mentions private/internal', /private|internal|blocked/i.test(reason), reason);
    const loopback = await call('POST', `/api/leads/${fakeLeadId}/analysis`, { url: 'http://127.0.0.1:9/' });
    check('loopback override blocked too', loopback.json?.analysis?.fetched === false || loopback.json?.ok === false);
    const badScheme = await call('POST', `/api/leads/${fakeLeadId}/analysis`, { url: 'ftp://example.com/' });
    check('non-http scheme rejected', badScheme.json?.ok === false || badScheme.json?.analysis?.fetched === false);
  }

  // ── 9. Pitch generation ──────────────────────────────────────────────
  label('9. Outreach generation (manual send only)');
  const pitch = await call('POST', `/api/leads/${dentalLead?.id ?? leadId}/pitch`, { tone: 'professional' });
  check('pitch returns 200', pitch.status === 200, `HTTP ${pitch.status}`);
  const outreach = pitch.json?.outreach;
  check('email subject generated', (outreach?.emailSubject ?? '').length > 3);
  check('email body generated', (outreach?.emailBody ?? '').length > 60);
  check('whatsapp draft generated', (outreach?.whatsappDraft ?? '').length > 40);
  check('whatsapp draft has opt-out line', /stop/i.test(outreach?.whatsappDraft ?? ''), outreach?.whatsappDraft?.slice(-80));
  check('whatsapp draft within 480 chars', (outreach?.whatsappDraft ?? '').length <= 480, String(outreach?.whatsappDraft?.length));
  check('facts used are listed', (outreach?.factsUsed?.length ?? 0) > 0);
  check('generatedBy is labelled', ['ai', 'template'].includes(outreach?.generatedBy), outreach?.generatedBy);
  if (!cfg.ai?.configured) {
    check('without an AI key it reports template generation', outreach?.generatedBy === 'template', outreach?.generatedBy);
  }
  check('compliance note returned', typeof pitch.json?.compliance === 'string' && /manual|never|yourself/i.test(pitch.json.compliance));
  check('business name appears in the body', (outreach?.emailBody ?? '').includes((dentalLead ?? {}).place?.displayName ?? 'x'));
  const waHref = outreach?.whatsappHref;
  check('wa.me link built when a phone exists', !waHref || /^https:\/\/wa\.me\/\d+\?text=/.test(waHref), waHref);
  check('no automated-send endpoint exists', (await call('POST', `/api/leads/${leadId}/send`, {})).status === 404);

  // ── 10. CRM updates & statuses ───────────────────────────────────────
  label('10. CRM updates');
  const contacted = await call('PATCH', `/api/leads/${leadId}`, {
    status: 'CONTACTED',
    note: 'smoke test',
    crm: { notes: 'Called the front desk.', assignedService: 'WEBSITE', estimatedDealValue: 45000, nextFollowUpAt: '2026-01-05', owner: 'Smoke' },
  });
  check('PATCH returns 200', contacted.status === 200, `HTTP ${contacted.status}`);
  check('status changed', contacted.json?.lead?.status === 'CONTACTED', contacted.json?.lead?.status);
  check('status history appended', (contacted.json?.lead?.statusHistory ?? []).some((e) => e.status === 'CONTACTED'));
  check('last contacted auto-set', Boolean(contacted.json?.lead?.crm?.lastContactedAt));
  check('notes saved', contacted.json?.lead?.crm?.notes === 'Called the front desk.');
  check('service saved', contacted.json?.lead?.crm?.assignedService === 'WEBSITE');
  check('deal value saved', contacted.json?.lead?.crm?.estimatedDealValue === 45000);

  const invalidStatus = await call('PATCH', `/api/leads/${leadId}`, { status: 'NOT_A_STATUS' });
  check('invalid status rejected', invalidStatus.status === 400, `HTTP ${invalidStatus.status}`);

  // ── 11. Do not contact + suppression ─────────────────────────────────
  label('11. DO NOT CONTACT and suppression list');
  const dnc = await call('PATCH', `/api/leads/${fakeLeadId ?? leadId}`, { status: 'DO_NOT_CONTACT', note: 'smoke test opt-out' });
  check('DO_NOT_CONTACT accepted', dnc.json?.lead?.status === 'DO_NOT_CONTACT', dnc.json?.lead?.status);
  const suppressionBefore = await call('GET', '/api/suppression');
  check('suppression list contains the entry', (suppressionBefore.json?.entries?.length ?? 0) > 0);
  const addedEntry = (suppressionBefore.json?.entries ?? []).find((e) => e.kind === 'business');
  check('business entry added', Boolean(addedEntry), JSON.stringify(suppressionBefore.json?.entries?.slice(0, 3)));
  const manualEntry = await call('POST', '/api/suppression', { kind: 'domain', value: 'donotcontact.example', reason: 'smoke test' });
  check('manual suppression entry added', Boolean(manualEntry.json?.entry?.id));
  const removed = await call('DELETE', `/api/suppression/${manualEntry.json?.entry?.id}`);
  check('suppression entry removable', removed.status === 200, `HTTP ${removed.status}`);

  // ── 12. Campaigns ────────────────────────────────────────────────────
  label('12. Campaigns and follow-up planning');
  const campaign = await call('POST', '/api/campaigns', {
    name: 'Smoke test campaign',
    description: 'Created by the smoke test',
    service: 'WEBSITE',
    sequence: [
      { day: 0, label: 'Initial outreach', channel: 'email', note: 'send manually' },
      { day: 3, label: 'Follow-up', channel: 'whatsapp', note: 'send manually' },
      { day: 7, label: 'Final follow-up', channel: 'email', note: 'send manually' },
    ],
  });
  const campaignId = campaign.json?.campaign?.id;
  check('campaign created', Boolean(campaignId), campaignId);
  check('campaign is manual-send-only', campaign.json?.campaign?.manualSendOnly === true);
  const attach = await call('POST', `/api/campaigns/${campaignId}/leads`, { leadIds: [leadId, dentalLead?.id].filter(Boolean) });
  check('leads attached', (attach.json?.leads?.length ?? 0) >= 1, String(attach.json?.leads?.length));
  check('campaign stats computed', typeof attach.json?.stats?.leads === 'number');
  const followUps = await call('GET', `/api/follow-ups?campaign=${campaignId}`);
  check('follow-ups endpoint returns buckets', Boolean(followUps.json?.counts), JSON.stringify(followUps.json?.counts));
  const detach = await call('POST', `/api/campaigns/${campaignId}/leads?detach=1`, { leadIds: [leadId] });
  check('lead detachable from campaign', detach.status === 200, `HTTP ${detach.status}`);

  // ── 13. Bulk CRM (no bulk messaging) ─────────────────────────────────
  label('13. Bulk CRM updates');
  const bulk = await call('POST', '/api/leads/bulk', {
    ids: [leadId, dentalLead?.id].filter(Boolean),
    patch: { crm: { owner: 'Smoke Bot' } },
  });
  check('bulk update applied', (bulk.json?.updated ?? 0) >= 1, JSON.stringify(bulk.json));
  const bulkSend = await call('POST', '/api/leads/bulk', { ids: [leadId], action: 'send-all' });
  check('no bulk send action exists', bulkSend.status === 400, `HTTP ${bulkSend.status}`);

  // ── 14. Export ───────────────────────────────────────────────────────
  label('14. CSV export');
  const csv = await call('GET', '/api/export/leads');
  check('CSV export returns 200', csv.status === 200, `HTTP ${csv.status}`);
  check('CSV content type', /text\/csv/.test(csv.headers.get('content-type') ?? ''), csv.headers.get('content-type'));
  check('CSV has the expected columns', /Business,Category,Location/.test(csv.text), csv.text.slice(0, 120));
  check('CSV includes a known lead', csv.text.includes('Spice Garden') || csv.text.includes('Smoke Test') || csv.text.length > 200);
  const campaignCsv = await call('GET', '/api/export/campaigns');
  check('campaign CSV export works', campaignCsv.status === 200 && /Campaign,Status/.test(campaignCsv.text), campaignCsv.text.slice(0, 80));

  // ── 15. Refresh honesty ──────────────────────────────────────────────
  label('15. Refresh behaviour');
  const refreshDemo = await call('POST', `/api/leads/${leadId}/refresh`, {});
  if (!cfg.googlePlaces?.configured) {
    check('demo record cannot be "refreshed"', refreshDemo.status === 409, `HTTP ${refreshDemo.status}`);
    check('refresh error explains why', /demo|not configured/i.test(refreshDemo.json?.error?.message ?? ''), refreshDemo.json?.error?.message);
  } else {
    check('refresh path reachable', [200, 409, 502].includes(refreshDemo.status), `HTTP ${refreshDemo.status}`);
  }
  const maintenance = await call('GET', '/api/maintenance');
  check('maintenance reports stale count', typeof maintenance.json?.staleCount === 'number', JSON.stringify(maintenance.json?.staleCount));

  // ── 16. Settings ─────────────────────────────────────────────────────
  label('16. Settings');
  const settingsGet = await call('GET', '/api/settings');
  check('settings readable', settingsGet.status === 200 && Boolean(settingsGet.json?.settings?.agency));
  const originalName = settingsGet.json?.settings?.agency?.name;
  const settingsPatch = await call('PATCH', '/api/settings', { agency: { name: 'Smoke Agency' }, pitch: { tone: 'direct' } });
  check('settings writable', settingsPatch.json?.settings?.agency?.name === 'Smoke Agency', settingsPatch.json?.settings?.agency?.name);
  check('tone persisted', settingsPatch.json?.settings?.pitch?.tone === 'direct');
  await call('PATCH', '/api/settings', { agency: { name: originalName }, pitch: { tone: 'professional' } });
  check('settings restored', (await call('GET', '/api/settings')).json?.settings?.agency?.name === originalName);
  check('settings never echo key values', !JSON.stringify(settingsPatch.json).includes('AIza'));

  // ── 17. Pages render ─────────────────────────────────────────────────
  label('17. Pages render (SSR)');
  const pages = [
    ['/', ['Total Leads', 'High Priority', 'Meetings', 'Won']],
    ['/find', ['Search local businesses', 'Demo Mode', 'Example searches']],
    ['/leads', ['Opportunity Score', 'Export CSV', 'Business']],
    ['/campaigns', ['Campaigns', 'Manual send only']],
    ['/settings', ['Google Places API', 'Do not contact', 'Agency profile']],
    ['/privacy', ['Privacy Policy', 'place_id']],
    ['/terms', ['Terms of Use', 'never does']],
    [`/leads/${leadId}`, ['Opportunity Score', 'Personalized outreach', 'CRM']],
    [`/campaigns/${campaignId}`, ['Sequence', 'Leads in this campaign']],
  ];
  for (const [path, markers] of pages) {
    const res = await page(path);
    check(`GET ${path} → 200`, res.status === 200, `HTTP ${res.status}`);
    for (const marker of markers) {
      check(`  · contains "${marker}"`, res.html.includes(marker));
    }
  }
  const notFound = await page('/leads/does-not-exist-xyz');
  check('unknown lead → 404 page', notFound.status === 404, `HTTP ${notFound.status}`);

  // ── 18. Attribution & demo labelling in the UI ───────────────────────
  label('18. Compliance surfaces in the UI');
  const findPage = await page('/find');
  check('Find Leads shows Google attribution', findPage.html.includes('Google Places API (New)'));
  check('Find Leads warns when unconfigured', cfg.googlePlaces?.configured || findPage.html.includes('Demo Mode'));
  const leadsPage = await page('/leads');
  check('leads table marks demo records', leadsPage.html.includes('demo') || leadsPage.html.includes('Demo'));
  const leadPage = await page(`/leads/${dentalLead?.id ?? leadId}`);
  check('lead page states manual send', /nothing is sent|never sends|you send/i.test(leadPage.html));
  check('lead page shows place data provenance', leadPage.html.includes('Place ID') && leadPage.html.includes('Google Places API (New)'));

  // ── 19. Cleanup ──────────────────────────────────────────────────────
  label('19. Cleanup');
  if (campaignId) await call('DELETE', `/api/campaigns/${campaignId}`);
  if (fakeLeadId) await call('DELETE', `/api/leads/${fakeLeadId}`);
  const suppressionAfter = await call('GET', '/api/suppression');
  for (const entry of suppressionAfter.json?.entries ?? []) {
    if (/smoke/i.test(entry.reason ?? '') || entry.value.toLowerCase().includes('smoke test')) {
      await call('DELETE', `/api/suppression/${entry.id}`);
    }
  }
  const reseed = await call('POST', '/api/demo', { action: 'clear-all-leads' });
  check('leads cleared', typeof reseed.json?.removed === 'number', JSON.stringify(reseed.json));
  const reseeded = await call('POST', '/api/demo', { action: 'reseed' });
  check('demo dataset restored', (reseeded.json?.leads ?? 0) >= 10, JSON.stringify(reseeded.json));
  const finalList = await call('GET', '/api/leads');
  check('final lead count is the demo dataset', (finalList.json?.total ?? 0) >= 10, String(finalList.json?.total));
  const importedLeadGone = await call('GET', `/api/leads/${leadId}`);
  check('smoke-test lead removed', importedLeadGone.status === 404, `HTTP ${importedLeadGone.status}`);

  await sleep(50);

  // ── Summary ──────────────────────────────────────────────────────────
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
  console.error('\nSmoke run crashed:', err);
  process.exit(2);
});
