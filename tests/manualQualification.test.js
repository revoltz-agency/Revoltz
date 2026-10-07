import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkflowCsv } from '../src/lib/csv.js';
import { buildOutreach } from '../src/lib/outreach.js';
import { applyManualLeadUpdate, createManualLead } from '../src/lib/manualLeads.js';
import { opportunityReason, scoreOpportunity } from '../src/lib/qualification.js';
import { recommendService, whyThisLead } from '../src/lib/leadUtils.js';

const crmFor = (lead) => ({
  status: lead.initialCRM?.status || 'NEW',
  notes: lead.initialCRM?.notes || '',
  email: lead.initialCRM?.email || '',
  emailVerifiedByUser: false,
  emailPermissionConfirmed: false,
  whatsappOptInConfirmed: false,
  lastContacted: '', lastContactedAt: '', followUpAnchorDate: '', followUpStep: 0,
  nextFollowUp: '', assignedService: 'Website', estimatedDealValue: '', tags: [],
});

test('missing manual website and phone are unknown, not confirmed qualification weaknesses', () => {
  const lead = createManualLead({ name: 'North Star Cafe', category: 'Cafe', city: 'Pune' }, { id: 'manual-no-data' });
  const score = scoreOpportunity(lead);
  assert.equal(score.rawScore, 0);
  assert.equal(score.signals.find((signal) => signal.key === 'no-website').active, false);
  assert.equal(score.signals.find((signal) => signal.key === 'contact-flow').active, false);
  assert.match(score.signals.find((signal) => signal.key === 'reviews').label, /not provided/i);
  assert.match(score.signals.find((signal) => signal.key === 'rating').label, /not provided/i);
  assert.match(score.signals.find((signal) => signal.key === 'social').label, /not provided/i);
  assert.match(opportunityReason(lead), /not provided.*unknown/i);
  assert.equal(recommendService(lead)[0].service, 'Manual review');
  const reasons = whyThisLead(lead);
  assert.ok(reasons.find((reason) => reason.key === 'website-not-provided').type === 'neutral');
  assert.ok(reasons.find((reason) => reason.key === 'phone-not-provided').type === 'neutral');
  assert.match(reasons.map((reason) => reason.text).join(' '), /Review count: Not provided.*Rating: Not provided.*Social profile links: Not provided/i);
  assert.doesNotMatch(reasons.map((reason) => reason.text).join(' '), /no website is listed|phone was not returned/i);
});

test('manual leads use the existing score signals for user-provided data without claiming Google verification', () => {
  const lead = createManualLead({
    name: 'North Star Cafe', category: 'Cafe', city: 'Pune', website: 'northstar.example',
    rating: '4.8', reviews: '125', instagram: 'instagram.com/northstar',
  }, { id: 'manual-with-data' });
  const score = scoreOpportunity(lead);
  assert.equal(score.signals.find((signal) => signal.key === 'reviews').active, true);
  assert.equal(score.signals.find((signal) => signal.key === 'rating').active, true);
  assert.equal(score.signals.find((signal) => signal.key === 'social').active, true);
  assert.match(opportunityReason(lead), /user-provided/i);
  assert.doesNotMatch(opportunityReason(lead), /Google listing/i);
});

test('user-entered updates on Google leads retain source attribution in qualification and outreach', () => {
  const lead = applyManualLeadUpdate({
    id: 'place-updated-rating', source: 'google', name: 'Old Name', category: 'Cafe', city: 'Pune',
    phone: '+91 11111 11111', internationalPhoneNumber: '+91 11111 11111', website: 'https://northstar.example', rating: 4.5, reviews: 120,
  }, {
    name: 'North Star Cafe', category: 'Cafe', city: 'Pune', phone: '+91 98765 43210', rating: '4.8', reviews: '125',
  });
  const score = scoreOpportunity(lead);
  assert.equal(lead.source, 'google');
  assert.equal(score.signals.find((signal) => signal.key === 'rating').label, 'Strong user-provided rating (4.5+)');
  assert.equal(score.signals.find((signal) => signal.key === 'reviews').label, '100+ user-provided reviews');
  assert.match(opportunityReason(lead), /user-provided rating.*user-provided reviews/i);
  const evidence = whyThisLead(lead).map((reason) => reason.text).join(' ');
  assert.match(evidence, /entered manually/);
  assert.doesNotMatch(evidence, /Phone was not returned/);
  assert.match(buildOutreach(lead).emailBody, /user-provided rating.*user-provided reviews/i);
});

test('CSV export includes manual details and still excludes Google Places listing content', () => {
  const manual = createManualLead({
    name: 'North Star Cafe', category: 'Cafe', city: 'Pune', website: 'northstar.example',
    phone: '+91 98765 43210', email: 'owner@northstar.example', mapsUrl: 'https://maps.google.com/?q=northstar',
    address: 'Koregaon Park', rating: '4.8', reviews: '125', instagram: 'instagram.com/northstar', facebook: 'facebook.com/northstar', notes: 'Follow up next week',
  }, { id: 'manual-export' });
  const google = {
    id: 'place-secret', placeId: 'place-secret', source: 'google', name: 'Google-only business', category: 'Restaurant',
    city: 'Mumbai', address: 'Google address', website: 'https://google-only.example', phone: '+91 11111 11111', rating: 4.9, reviews: 900,
  };
  const csv = buildWorkflowCsv([manual, google], crmFor);
  assert.match(csv, /lead_source/);
  assert.match(csv, /manual_business_name_user_entered/);
  assert.match(csv, /"Manual","North Star Cafe","Cafe","Pune"/);
  assert.match(csv, /owner@northstar\.example/);
  assert.match(csv, /"Google Places"/);
  assert.match(csv, /place-secret/);
  assert.doesNotMatch(csv, /Google-only business|google-only\.example|Google address|11111 11111/);
});

test('CSV export includes manually entered updates on a Google record only in user-entered columns', () => {
  const lead = {
    id: 'place-updated', placeId: 'place-updated', source: 'google', name: 'User corrected name', category: 'Cafe', city: 'Pune',
    website: 'https://user-entered.example', phone: '', mapsUrl: '', address: '', rating: null, reviews: null,
    manualUserFields: ['name', 'category', 'city', 'website'],
  };
  const csv = buildWorkflowCsv([lead], crmFor);
  assert.match(csv, /"Google Places","User corrected name","Cafe","Pune","https:\/\/user-entered\.example/);
  assert.match(csv, /place-updated/);
});

test('manual outreach draft does not claim that a missing website or rating came from Google', () => {
  const draft = buildOutreach({ name: 'North Star Cafe', category: 'Cafe', city: 'Pune', source: 'manual', website: '' });
  assert.match(draft.emailBody, /website was not provided/i);
  assert.doesNotMatch(draft.emailBody, /Google business listing does not include a website/i);
  assert.doesNotMatch(draft.emailBody, /Google listing shows/i);
});
