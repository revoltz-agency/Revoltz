import test from 'node:test';
import assert from 'node:assert/strict';
import { opportunityReason, scoreOpportunity } from '../src/lib/qualification.js';
import { buildWorkflowCsv } from '../src/lib/csv.js';
import { dedupeLeads, recommendService, whyThisLead } from '../src/lib/leadUtils.js';

const noWebsiteLead = {
  name: 'Sample Bistro',
  placeId: 'place-sample',
  category: 'Restaurant',
  city: 'Pune',
  website: '',
  phone: '',
  rating: 4.8,
  reviews: 428,
  businessStatus: 'OPERATIONAL',
};

test('normalizes observable raw signals and assigns the requested priority band', () => {
  const score = scoreOpportunity(noWebsiteLead);
  assert.equal(score.rawScore, 65);
  assert.equal(score.score, 93);
  assert.equal(score.tier, 'high');
  assert.equal(score.signals.find((signal) => signal.key === 'no-website').points, 30);
});

test('website gaps and social links count only after an audit signal exists', () => {
  const unanalyzed = scoreOpportunity({ ...noWebsiteLead, website: 'https://example.com' });
  assert.equal(unanalyzed.rawScore, 35);

  const analyzed = scoreOpportunity({
    ...noWebsiteLead,
    website: 'https://example.com',
    websiteAudit: { weakWebsite: true, contactFlowDetected: false, socialLinks: ['https://social.example/profile'] },
  });
  assert.equal(analyzed.rawScore, 70);
  assert.equal(analyzed.score, 100);
});

test('reason uses evidence present on the lead and does not invent a missing rating', () => {
  const reason = opportunityReason({ name: 'Sample Bistro', website: '', rating: null, reviews: 0 });
  assert.match(reason, /no website is listed/i);
  assert.doesNotMatch(reason, /reviews|rating/i);
});

test('missing website and phone are described as listing gaps without inventing contact data', () => {
  const reasons = whyThisLead({ ...noWebsiteLead, website: '', phone: '' });
  assert.ok(reasons.some((reason) => /no website is listed/i.test(reason.text)));
  assert.ok(reasons.some((reason) => /phone was not returned/i.test(reason.text)));
  assert.equal(recommendService({ ...noWebsiteLead, website: '' })[0].service, 'Website');
  assert.equal(scoreOpportunity({ ...noWebsiteLead, website: '' }).signals.find((signal) => signal.key === 'no-website').active, true);
});

test('deduplicates place IDs and never overwrites known details with missing/default fields', () => {
  const deduped = dedupeLeads([
    { id: 'p1', placeId: 'p1', name: 'Known business', website: 'https://known.example', phone: '02012345678', rating: 4.7, reviews: 56, businessStatus: 'OPERATIONAL' },
    { id: 'p1', placeId: 'p1', name: '', website: '', phone: '', rating: null, reviews: 0, businessStatus: '' },
    { id: 'p2', placeId: 'p2', name: 'Second business' },
  ]);
  assert.equal(deduped.length, 2);
  assert.equal(deduped[0].name, 'Known business');
  assert.equal(deduped[0].website, 'https://known.example');
  assert.equal(deduped[0].rating, 4.7);
  assert.equal(deduped[0].reviews, 56);
});

test('saved place ID placeholders are not scored as known website or contact gaps', () => {
  const placeholder = { id: 'p3', placeId: 'p3', needsRefresh: true, name: 'Saved business' };
  assert.equal(scoreOpportunity(placeholder).rawScore, 0);
  assert.match(opportunityReason(placeholder), /refresh current listing details/i);
  assert.equal(recommendService(placeholder)[0].service, 'Manual review');
});

test('CSV contains labeled CRM fields only and neutralizes spreadsheet formulas', () => {
  const lead = { id: 'place-1', placeId: 'place-1', source: 'google', name: 'Do not export name' };
  const csv = buildWorkflowCsv([lead], () => ({
    status: 'NEW', notes: '=HYPERLINK("https://bad.example")', lastContacted: '', nextFollowUp: '',
    assignedService: 'Website', estimatedDealValue: 5000, email: '', emailVerifiedByUser: false,
    emailPermissionConfirmed: false, whatsappOptInConfirmed: false, tags: [],
  }));
  assert.match(csv, /google_place_id_google_sourced/);
  assert.match(csv, /user_status/);
  assert.match(csv, /'=HYPERLINK/);
  assert.doesNotMatch(csv, /Do not export name/);
  assert.doesNotMatch(csv, /Sample Bistro/);
});
