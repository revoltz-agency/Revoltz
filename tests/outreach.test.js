import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOutreach } from '../src/lib/outreach.js';
import { addDays, followUpPlan } from '../src/lib/dates.js';
import { markLeadContacted, updateCrmRecord, validateOutreachContact } from '../src/lib/crm.js';
import { createManualLead } from '../src/lib/manualLeads.js';

test('outreach uses only the listing details supplied to the generator', () => {
  const lead = { name: 'Sample Bistro', category: 'Restaurant', city: 'Pune', website: '', rating: 4.8, reviews: 428 };
  const draft = buildOutreach(lead);
  assert.match(draft.whatsappBody, /Sample Bistro/);
  assert.match(draft.whatsappBody, /Google business listing does not include a website/);
  assert.doesNotMatch(draft.whatsappBody, /award-winning|helped 500|open until/i);
  const listedWebsiteDraft = buildOutreach({ ...lead, website: 'https://example.com' });
  assert.match(listedWebsiteDraft.whatsappBody, /4\.8 rating across 428 reviews/);
});

test('outreach no longer produces an email draft', () => {
  const draft = buildOutreach({ name: 'Sample Bistro', category: 'Restaurant', city: 'Pune' });
  assert.equal(draft.subject, undefined);
  assert.equal(draft.emailBody, undefined);
  assert.equal(typeof draft.whatsappBody, 'string');
  assert.ok(draft.whatsappBody.length > 0);
});

test('follow-up cadence includes Day 3, Day 7, and Day 14 relative to the first contact', () => {
  assert.equal(addDays('2026-10-06', 3), '2026-10-09');
  const plan = followUpPlan({}, { status: 'CONTACTED', lastContacted: '2026-10-06', followUpAnchorDate: '2026-10-06', followUpStep: 1 });
  assert.deepEqual(plan.map((step) => step.date), ['2026-10-06', '2026-10-09', '2026-10-13', '2026-10-20']);
  assert.deepEqual(plan.map((step) => step.day), ['Day 0', 'Day 3', 'Day 7', 'Day 14']);
  assert.equal(plan[0].completed, true);
  assert.equal(plan[1].completed, false);
  assert.deepEqual(followUpPlan({}, { status: 'DO NOT CONTACT' }), []);
});

test('marking contacts stores a timestamp and advances the manual follow-up stage', () => {
  const day0 = markLeadContacted({}, '2026-10-06');
  assert.equal(day0.status, 'CONTACTED');
  assert.equal(day0.lastContacted, '2026-10-06');
  assert.match(day0.lastContactedAt, /^2026-10-06T/);
  assert.equal(day0.followUpAnchorDate, '2026-10-06');
  assert.equal(day0.nextFollowUp, '2026-10-09');

  const day3 = markLeadContacted(day0, '2026-10-09');
  assert.equal(day3.followUpStep, 2);
  assert.equal(day3.nextFollowUp, '2026-10-13');
  const day7 = markLeadContacted(day3, '2026-10-13');
  assert.equal(day7.nextFollowUp, '2026-10-20');
  const day14 = markLeadContacted(day7, '2026-10-20');
  assert.equal(day14.followUpStep, 4);
  assert.equal(day14.nextFollowUp, '');
});

test('CRM status changes preserve workflow fields and Do Not Contact revokes channel checks', () => {
  const current = updateCrmRecord({}, { status: 'RESEARCHED', notes: 'Call after review', tags: ['Pune'] });
  const contacted = updateCrmRecord(current, { status: 'CONTACTED', lastContacted: '2026-10-06' });
  assert.equal(contacted.status, 'CONTACTED');
  assert.equal(contacted.notes, 'Call after review');
  const dnc = updateCrmRecord(contacted, { status: 'DO NOT CONTACT', whatsappOptInConfirmed: true });
  assert.equal(dnc.status, 'DO NOT CONTACT');
  assert.equal(dnc.whatsappOptInConfirmed, false);
  // Legacy email keys cannot be reintroduced even when explicitly patched in.
  assert.equal(dnc.emailPermissionConfirmed, undefined);
  assert.equal(dnc.email, undefined);
});

test('email outreach is unavailable regardless of any legacy email data', () => {
  const lead = { name: 'Business', phone: '+91 2012345678' };
  const legacy = {
    status: 'NEW',
    email: 'owner@business.example',
    emailVerifiedByUser: true,
    emailPermissionConfirmed: true,
  };
  const result = validateOutreachContact('email', lead, legacy);
  assert.equal(result.allowed, false);
  assert.match(result.reason, /no longer available/i);
  assert.equal(validateOutreachContact('email', lead, { status: 'NEW' }).allowed, false);
  assert.match(validateOutreachContact('unknown-channel', lead, legacy).reason, /unsupported/i);
});

test('WhatsApp outreach requires a public phone and explicit per-lead opt-in', () => {
  const lead = { name: 'Business', phone: '+91 2012345678', source: 'google' };
  assert.equal(validateOutreachContact('whatsapp', lead, { status: 'NEW' }).allowed, false);
  assert.match(validateOutreachContact('whatsapp', lead, { status: 'NEW' }).reason, /opt-in/i);
  assert.equal(validateOutreachContact('whatsapp', lead, { status: 'NEW', whatsappOptInConfirmed: true }).allowed, true);
  assert.equal(validateOutreachContact('whatsapp', { ...lead, phone: '' }, { status: 'NEW', whatsappOptInConfirmed: true }).allowed, false);
  assert.equal(validateOutreachContact('whatsapp', { ...lead, demo: true }, { status: 'NEW', whatsappOptInConfirmed: true }).allowed, false);
});

test('manual lead outreach keeps the WhatsApp opt-in and Do Not Contact gates', () => {
  const lead = createManualLead({ name: 'North Star', category: 'Cafe', city: 'Pune', phone: '+91 98765 43210' }, { id: 'manual-outreach' });
  // A manual lead no longer carries an email on the record or in its initial CRM.
  assert.equal(lead.email, undefined);
  const crm = { status: 'NEW', whatsappOptInConfirmed: false };
  assert.equal(validateOutreachContact('whatsapp', lead, crm).allowed, false);
  assert.equal(validateOutreachContact('whatsapp', lead, { ...crm, whatsappOptInConfirmed: true }).allowed, true);
  const dnc = { ...crm, status: 'DO NOT CONTACT', whatsappOptInConfirmed: true };
  assert.equal(validateOutreachContact('whatsapp', lead, dnc).allowed, false);
  assert.equal(validateOutreachContact('email', lead, dnc).allowed, false);
});
