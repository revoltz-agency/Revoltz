import test from 'node:test';
import assert from 'node:assert/strict';

import { buildWorkflowCsv } from '../src/lib/csv.js';
import {
  DEFAULT_CRM_RECORD,
  LEGACY_CRM_EMAIL_FIELDS,
  applyEnrichmentToCrm,
  enrichmentCrmPatch,
  stripLegacyCrmEmail,
  updateCrmRecord,
  validateOutreachContact,
} from '../src/lib/crm.js';
import { buildOutreach } from '../src/lib/outreach.js';
import {
  MANUAL_FIELD_LABELS,
  MANUAL_LEAD_FIELDS,
  applyManualLeadUpdate,
  createManualLead,
  parseManualLeadCsv,
  validateManualLead,
} from '../src/lib/manualLeads.js';

// ---------------------------------------------------------------------------
// A. Prospect CRM no longer holds email data
// ---------------------------------------------------------------------------

test('the CRM record shape contains no prospect email fields', () => {
  for (const field of LEGACY_CRM_EMAIL_FIELDS) {
    assert.equal(field in DEFAULT_CRM_RECORD, false, `${field} must not exist on the record shape`);
  }
  assert.deepEqual(LEGACY_CRM_EMAIL_FIELDS.sort(), [
    'email', 'emailPermissionConfirmed', 'emailVerifiedByUser', 'enrichmentEmail',
  ].sort());
});

test('updateCrmRecord strips legacy email fields from stored records and patches', () => {
  const legacy = {
    email: 'owner@example.com',
    emailVerifiedByUser: true,
    emailPermissionConfirmed: true,
    enrichmentEmail: 'info@example.org',
    status: 'CONTACTED',
    notes: 'keep me',
    tags: ['Pune'],
  };
  const next = updateCrmRecord(legacy, {});
  for (const field of LEGACY_CRM_EMAIL_FIELDS) assert.equal(field in next, false, field);
  // Unrelated data is preserved.
  assert.equal(next.status, 'CONTACTED');
  assert.equal(next.notes, 'keep me');
  assert.deepEqual(next.tags, ['Pune']);

  // A patch cannot smuggle an email back in either.
  const patched = updateCrmRecord({}, { email: 'smuggled@example.com', notes: 'ok' });
  assert.equal(patched.email, undefined);
  assert.equal(patched.notes, 'ok');
});

test('stripLegacyCrmEmail is idempotent, total, and preserves unrelated keys', () => {
  const once = stripLegacyCrmEmail({
    email: 'a@b.example', emailVerifiedByUser: true, status: 'NEW', notes: 'n', tags: ['x'],
  });
  const twice = stripLegacyCrmEmail(once);
  assert.deepEqual(once, twice);
  assert.deepEqual(stripLegacyCrmEmail(once), once);

  // Total: never throws on hostile input, always returns a fresh object.
  for (const input of [undefined, null, 0, 'text', [], ['a'], true]) {
    assert.deepEqual(stripLegacyCrmEmail(input), {});
  }
  // The input object is not mutated.
  const original = { email: 'x@y.example', status: 'NEW' };
  const copy = stripLegacyCrmEmail(original);
  assert.equal(original.email, 'x@y.example');
  assert.equal(copy.email, undefined);
  assert.notEqual(original, copy);
});

test('Do Not Contact still revokes the WhatsApp opt-in and needs no email key', () => {
  const dnc = updateCrmRecord({ whatsappOptInConfirmed: true }, { status: 'DO NOT CONTACT' });
  assert.equal(dnc.status, 'DO NOT CONTACT');
  assert.equal(dnc.whatsappOptInConfirmed, false);
});

test('email outreach is refused while WhatsApp validation is unchanged', () => {
  const lead = { name: 'Biz', phone: '+91 2012345678', source: 'google' };
  assert.equal(validateOutreachContact('email', lead, {
    email: 'owner@example.com', emailVerifiedByUser: true, emailPermissionConfirmed: true,
  }).allowed, false);

  // WhatsApp gates are intact.
  assert.equal(validateOutreachContact('whatsapp', lead, { status: 'NEW' }).allowed, false);
  assert.equal(validateOutreachContact('whatsapp', lead, { status: 'NEW', whatsappOptInConfirmed: true }).allowed, true);
  assert.equal(validateOutreachContact('whatsapp', { ...lead, demo: true }, { status: 'NEW', whatsappOptInConfirmed: true }).allowed, false);
  assert.equal(validateOutreachContact('whatsapp', lead, { status: 'DO NOT CONTACT', whatsappOptInConfirmed: true }).allowed, false);
  assert.match(validateOutreachContact('telepathy', lead, {}).reason, /unsupported/i);
});

test('buildOutreach produces a WhatsApp draft and no email draft', () => {
  const draft = buildOutreach({ name: 'Biz', category: 'Cafe', city: 'Pune' });
  assert.equal(typeof draft.whatsappBody, 'string');
  assert.ok(draft.whatsappBody.length > 0);
  assert.equal(Object.prototype.hasOwnProperty.call(draft, 'subject'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(draft, 'emailBody'), false);
});

test('enrichment patch omits email and email is not an accepted evidence field', () => {
  const patch = enrichmentCrmPatch({
    email: 'info@example.org', phone: '+1 555 0100', status: 'complete',
    evidence: [{ field: 'email', value: 'info@example.org', source: 's', evidence: 'e', confidence: 'high' }],
  });
  assert.equal(patch.enrichmentEmail, undefined);
  assert.equal(patch.enrichmentPhone, '+1 555 0100');

  const crm = applyEnrichmentToCrm({}, {
    email: 'info@example.org', phone: '+1 555 0100', status: 'complete',
    evidence: [
      { field: 'email', value: 'info@example.org', source: 's', evidence: 'e', confidence: 'high' },
      { field: 'phone', value: '+1 555 0100', source: 's', evidence: 'e', confidence: 'high' },
    ],
  });
  assert.equal(crm.enrichmentEmail, undefined);
  assert.equal(crm.enrichmentEvidence.length, 1);
  assert.equal(crm.enrichmentEvidence[0].field, 'phone');
});

// ---------------------------------------------------------------------------
// D3. Legacy localStorage migration is safe and idempotent
// ---------------------------------------------------------------------------

test('legacy manual-lead records lose email but keep every other field', () => {
  const lead = createManualLead({
    name: 'North Star', category: 'Cafe', city: 'Pune', phone: '+91 98765 43210',
    website: 'https://northstar.example', notes: 'Met at an event', email: 'legacy@example.com',
  }, { id: 'manual-legacy' });

  assert.equal(lead.email, undefined);
  assert.equal(lead.initialCRM.email, undefined);
  assert.equal(lead.name, 'North Star');
  assert.equal(lead.category, 'Cafe');
  assert.equal(lead.city, 'Pune');
  assert.equal(lead.phone, '+91 98765 43210');
  assert.equal(lead.website, 'https://northstar.example/');
  assert.equal(lead.notes, 'Met at an event');
  assert.equal(lead.initialCRM.notes, 'Met at an event');
  assert.equal(lead.initialCRM.status, 'NEW');
});

test('editing a legacy manual lead does not carry an email forward', () => {
  const legacy = {
    id: 'manual-1', source: 'manual', name: 'Old Name', category: 'Cafe', city: 'Pune',
    email: 'old@example.com',
    initialCRM: { status: 'CONTACTED', notes: 'old note', email: 'old@example.com' },
  };
  const updated = applyManualLeadUpdate(legacy, {
    name: 'New Name', category: 'Cafe', city: 'Pune', notes: 'new note', email: 'new@example.com',
  });
  assert.equal(updated.name, 'New Name');
  assert.equal(updated.initialCRM.status, 'CONTACTED');
  assert.equal(updated.initialCRM.notes, 'new note');
  assert.equal(updated.initialCRM.email, undefined);
  assert.equal(updated.email, undefined);
});

// ---------------------------------------------------------------------------
// D6. CSV export schema change + backward-compatible import
// ---------------------------------------------------------------------------

test('manual lead field list and labels no longer include email', () => {
  assert.equal(MANUAL_LEAD_FIELDS.includes('email'), false);
  assert.equal('email' in MANUAL_FIELD_LABELS, false);
  assert.ok(MANUAL_LEAD_FIELDS.includes('phone'));
  assert.ok(MANUAL_LEAD_FIELDS.includes('notes'));
});

test('validateManualLead ignores a supplied email instead of validating it', () => {
  const result = validateManualLead({
    name: 'Shop', category: 'Cafe', city: 'Pune', email: 'not-an-email',
  });
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, {});
  assert.equal('email' in result.values, false);
});

test('CSV export no longer contains the three prospect email columns', () => {
  const lead = { id: 'p1', placeId: 'p1', source: 'manual', name: 'Shop', manualUserFields: ['name'] };
  const csv = buildWorkflowCsv([lead], () => ({
    status: 'NEW', notes: 'n', lastContacted: '', lastContactedAt: '', followUpAnchorDate: '',
    followUpStep: 0, nextFollowUp: '', assignedService: 'Website', estimatedDealValue: '',
    email: 'owner@example.com', emailVerifiedByUser: true, emailPermissionConfirmed: true,
    whatsappOptInConfirmed: false, tags: [],
  }));
  assert.doesNotMatch(csv, /user_entered_business_email/);
  assert.doesNotMatch(csv, /user_verified_email_by_user/);
  assert.doesNotMatch(csv, /user_email_contact_basis_confirmed/);
  assert.doesNotMatch(csv, /owner@example\.com/);
  // Non-email columns are untouched.
  assert.match(csv, /user_status/);
  assert.match(csv, /user_whatsapp_opt_in_confirmed/);
  assert.match(csv, /user_tags/);
});

test('CSV import stays backward compatible with legacy Email columns', () => {
  const csv = [
    'Business Name,Industry,City,Phone,Email,Notes',
    'North Star,Cafe,Pune,+91 98765 43210,hello@northstar.example,Call next week',
    'Bad Email Row,Cafe,Pune,+91 98765 43210,not-an-email,Still imports',
  ].join('\r\n');
  const parsed = parseManualLeadCsv(csv);
  assert.equal(parsed.error, '');
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0].valid, true);
  assert.equal(parsed.rows[0].values.name, 'North Star');
  assert.equal(parsed.rows[0].values.phone, '+91 98765 43210');
  assert.equal(parsed.rows[0].values.notes, 'Call next week');
  assert.equal('email' in parsed.rows[0].values, false);
  // A malformed legacy email must not reject an otherwise valid row.
  assert.equal(parsed.rows[1].valid, true);
  assert.equal(parsed.rows[1].values.name, 'Bad Email Row');
});

test('a legacy Email column is never used as the business-name fallback', () => {
  const parsed = parseManualLeadCsv('Email,Phone\r\nsomeone@example.com,+91 98765 43210');
  // No name-like column exists, so the import must report the actionable error
  // rather than silently using the email column.
  assert.match(parsed.error, /business-name column/i);
});
