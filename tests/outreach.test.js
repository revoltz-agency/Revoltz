import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOutreach } from '../src/lib/outreach.js';
import { addDays, followUpPlan } from '../src/lib/dates.js';
import { markLeadContacted, updateCrmRecord, validateOutreachContact } from '../src/lib/crm.js';
import { createManualLead } from '../src/lib/manualLeads.js';

test('outreach uses only the listing details supplied to the generator', () => {
  const lead = { name: 'Sample Bistro', category: 'Restaurant', city: 'Pune', website: '', rating: 4.8, reviews: 428 };
  const draft = buildOutreach(lead);
  assert.match(draft.subject, /Sample Bistro/);
  assert.match(draft.emailBody, /Google business listing does not include a website/);
  assert.doesNotMatch(draft.emailBody, /award-winning|helped 500|open until/i);
  const listedWebsiteDraft = buildOutreach({ ...lead, website: 'https://example.com' });
  assert.match(listedWebsiteDraft.emailBody, /4\.8 rating across 428 reviews/);
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
  const dnc = updateCrmRecord(contacted, { status: 'DO NOT CONTACT', emailPermissionConfirmed: true, whatsappOptInConfirmed: true });
  assert.equal(dnc.status, 'DO NOT CONTACT');
  assert.equal(dnc.emailPermissionConfirmed, false);
  assert.equal(dnc.whatsappOptInConfirmed, false);
});

test('email outreach requires a user-verified address and an appropriate contact basis', () => {
  const lead = { name: 'Business', phone: '+91 2012345678' };
  const base = { status: 'NEW', email: 'owner@business.example' };
  assert.equal(validateOutreachContact('email', lead, base).allowed, false);
  assert.match(validateOutreachContact('email', lead, base).reason, /verified/i);
  const verified = { ...base, emailVerifiedByUser: true };
  assert.equal(validateOutreachContact('email', lead, verified).allowed, false);
  assert.match(validateOutreachContact('email', lead, verified).reason, /contact basis/i);
  assert.equal(validateOutreachContact('email', lead, { ...verified, emailPermissionConfirmed: true }).allowed, true);
  assert.equal(validateOutreachContact('email', lead, { ...verified, emailPermissionConfirmed: true, status: 'DO NOT CONTACT' }).allowed, false);
});

test('WhatsApp outreach requires a public phone and explicit per-lead opt-in', () => {
  const lead = { name: 'Business', phone: '+91 2012345678', source: 'google' };
  assert.equal(validateOutreachContact('whatsapp', lead, { status: 'NEW' }).allowed, false);
  assert.match(validateOutreachContact('whatsapp', lead, { status: 'NEW' }).reason, /opt-in/i);
  assert.equal(validateOutreachContact('whatsapp', lead, { status: 'NEW', whatsappOptInConfirmed: true }).allowed, true);
  assert.equal(validateOutreachContact('whatsapp', { ...lead, phone: '' }, { status: 'NEW', whatsappOptInConfirmed: true }).allowed, false);
  assert.equal(validateOutreachContact('whatsapp', { ...lead, demo: true }, { status: 'NEW', whatsappOptInConfirmed: true }).allowed, false);
});

test('manual lead outreach keeps email verification, contact-basis, WhatsApp opt-in, and Do Not Contact gates', () => {
  const lead = createManualLead({ name: 'North Star', category: 'Cafe', city: 'Pune', email: 'owner@example.com', phone: '+91 98765 43210' }, { id: 'manual-outreach' });
  const crm = { status: 'NEW', email: lead.initialCRM.email, emailVerifiedByUser: false, emailPermissionConfirmed: false, whatsappOptInConfirmed: false };
  assert.equal(validateOutreachContact('email', lead, crm).allowed, false);
  assert.equal(validateOutreachContact('email', lead, { ...crm, emailVerifiedByUser: true }).allowed, false);
  assert.equal(validateOutreachContact('email', lead, { ...crm, emailVerifiedByUser: true, emailPermissionConfirmed: true }).allowed, true);
  assert.equal(validateOutreachContact('whatsapp', lead, crm).allowed, false);
  assert.equal(validateOutreachContact('whatsapp', lead, { ...crm, whatsappOptInConfirmed: true }).allowed, true);
  const dnc = { ...crm, status: 'DO NOT CONTACT', emailVerifiedByUser: true, emailPermissionConfirmed: true, whatsappOptInConfirmed: true };
  assert.equal(validateOutreachContact('email', lead, dnc).allowed, false);
  assert.equal(validateOutreachContact('whatsapp', lead, dnc).allowed, false);
});
