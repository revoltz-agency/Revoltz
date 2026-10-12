import { addDays, localDateString } from './dates.js';

// Prospect CRM no longer collects contact email addresses: outreach runs through
// WhatsApp drafts only. These keys existed in earlier versions, so they are
// stripped whenever a stored record is loaded (see stripLegacyCrmEmail).
export const LEGACY_CRM_EMAIL_FIELDS = [
  'email',
  'emailVerifiedByUser',
  'emailPermissionConfirmed',
  'enrichmentEmail',
];

/**
 * Removes legacy prospect email fields from a stored CRM record.
 *
 * The migration is idempotent and total: it never throws, never touches keys
 * outside LEGACY_CRM_EMAIL_FIELDS, and returns a new object so callers can keep
 * treating CRM records as immutable. Unrelated lead and CRM data is preserved.
 */
export function stripLegacyCrmEmail(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return {};
  const next = { ...record };
  for (const field of LEGACY_CRM_EMAIL_FIELDS) delete next[field];
  return next;
}

export const DEFAULT_CRM_RECORD = {
  status: 'NEW',
  notes: '',
  lastContacted: '',
  lastContactedAt: '',
  followUpAnchorDate: '',
  followUpStep: 0,
  nextFollowUp: '',
  assignedService: 'Website',
  estimatedDealValue: '',
  whatsappOptInConfirmed: false,
  enrichmentStatus: 'not_enriched',
  enrichmentTimestamp: '',
  enrichmentSource: '',
  enrichmentConfidence: '',
  enrichmentPhone: '',
  enrichmentWhatsappUrl: '',
  enrichmentSocialLinks: [],
  enrichmentAddress: '',
  enrichmentBusinessName: '',
  enrichmentServices: [],
  enrichmentOpeningHours: '',
  enrichmentContactPage: '',
  discoveredWebsite: '',
  enrichmentEvidence: [],
  tags: [],
};

export function updateCrmRecord(current, patch) {
  // Strip first so a legacy stored record can never reintroduce an email field,
  // then again after merging so a caller-supplied patch cannot either.
  const base = stripLegacyCrmEmail(current);
  const next = { ...DEFAULT_CRM_RECORD, ...base, ...stripLegacyCrmEmail(patch) };
  if (next.status === 'DO NOT CONTACT') {
    next.whatsappOptInConfirmed = false;
  }
  next.followUpStep = Math.max(0, Math.min(4, Number.parseInt(next.followUpStep, 10) || 0));
  const enrichmentTextLimits = {
    enrichmentStatus: 40, enrichmentTimestamp: 40, enrichmentSource: 80, enrichmentConfidence: 16,
    enrichmentPhone: 80, enrichmentWhatsappUrl: 2_000,
    enrichmentAddress: 300, enrichmentBusinessName: 160, enrichmentOpeningHours: 300,
    enrichmentContactPage: 2_000, discoveredWebsite: 2_000,
  };
  for (const [field, limit] of Object.entries(enrichmentTextLimits)) {
    next[field] = typeof next[field] === 'string' ? next[field].slice(0, limit) : '';
  }
  next.enrichmentSocialLinks = [...new Set((Array.isArray(next.enrichmentSocialLinks) ? next.enrichmentSocialLinks : [])
    .filter((value) => typeof value === 'string').map((value) => value.slice(0, 2_000)).filter(Boolean))].slice(0, 8);
  next.enrichmentServices = [...new Set((Array.isArray(next.enrichmentServices) ? next.enrichmentServices : [])
    .filter((value) => typeof value === 'string').map((value) => value.trim().slice(0, 120)).filter(Boolean))].slice(0, 12);
  // 'email' is intentionally absent: discovered addresses are never persisted
  // to the prospect CRM record. server/enrich.js still reports the public
  // signal; the CRM simply does not store it.
  const evidenceFields = new Set(['phone', 'whatsappUrl', 'socialLinks', 'address', 'businessName', 'services', 'openingHours', 'contactPage', 'discoveredWebsite']);
  next.enrichmentEvidence = (Array.isArray(next.enrichmentEvidence) ? next.enrichmentEvidence : []).slice(0, 40)
    .filter((item) => item && typeof item === 'object' && evidenceFields.has(item.field) && typeof item.value === 'string')
    .map((item) => ({
      field: item.field,
      value: item.value.slice(0, 240),
      source: typeof item.source === 'string' ? item.source.slice(0, 160) : '',
      evidence: typeof item.evidence === 'string' ? item.evidence.slice(0, 240) : '',
      confidence: ['high', 'medium', 'low'].includes(item.confidence) ? item.confidence : 'low',
    }));
  next.tags = [...new Set((Array.isArray(next.tags) ? next.tags : []).map((tag) => String(tag).trim()).filter(Boolean))].slice(0, 20);
  return next;
}

export function enrichmentCrmPatch(enrichment = {}) {
  return {
    enrichmentStatus: typeof enrichment.status === 'string' ? enrichment.status : 'unavailable',
    enrichmentTimestamp: typeof enrichment.timestamp === 'string' ? enrichment.timestamp : '',
    enrichmentSource: typeof enrichment.source === 'string' ? enrichment.source : '',
    enrichmentConfidence: typeof enrichment.confidence === 'string' ? enrichment.confidence : 'low',
    enrichmentPhone: typeof enrichment.phone === 'string' ? enrichment.phone : '',
    enrichmentWhatsappUrl: typeof enrichment.whatsappUrl === 'string' ? enrichment.whatsappUrl : '',
    enrichmentSocialLinks: Array.isArray(enrichment.socialLinks) ? enrichment.socialLinks : [],
    enrichmentAddress: typeof enrichment.address === 'string' ? enrichment.address : '',
    enrichmentBusinessName: typeof enrichment.businessName === 'string' ? enrichment.businessName : '',
    enrichmentServices: Array.isArray(enrichment.services) ? enrichment.services : [],
    enrichmentOpeningHours: typeof enrichment.openingHours === 'string' ? enrichment.openingHours : '',
    enrichmentContactPage: typeof enrichment.contactPage === 'string' ? enrichment.contactPage : '',
    discoveredWebsite: typeof enrichment.discoveredWebsite === 'string' ? enrichment.discoveredWebsite : '',
    enrichmentEvidence: Array.isArray(enrichment.evidence) ? enrichment.evidence : [],
  };
}

export function applyEnrichmentToCrm(current, enrichment) {
  // Enrichment has its own fields; never replace the operator's consent or
  // verification state with an automatically discovered contact address.
  // enrichmentCrmPatch omits email by design, and updateCrmRecord strips any
  // legacy email key that is still present on the stored record.
  return updateCrmRecord(current, enrichmentCrmPatch(enrichment));
}

export function markLeadContacted(current, date = new Date()) {
  const day = date instanceof Date ? localDateString(date) : String(date).slice(0, 10);
  const timestamp = date instanceof Date ? date.toISOString() : new Date(`${day}T12:00:00Z`).toISOString();
  const saved = updateCrmRecord(current, {});
  const anchor = saved.followUpAnchorDate || saved.lastContacted || day;
  const currentStep = saved.followUpStep || (saved.lastContacted ? 1 : 0);
  const scheduledStage = [3, 7, 14].findIndex((offset) => addDays(anchor, offset) === saved.nextFollowUp) + 1;
  const nextStep = Math.min(4, Math.max(currentStep + 1, scheduledStage ? scheduledStage + 1 : 1));
  const nextFollowUp = nextStep < 4 ? addDays(anchor, [3, 7, 14][nextStep - 1]) : '';
  return updateCrmRecord(saved, {
    status: 'CONTACTED',
    lastContacted: day,
    lastContactedAt: timestamp,
    followUpAnchorDate: anchor,
    followUpStep: nextStep,
    nextFollowUp,
  });
}

export function validateOutreachContact(channel, lead, crm) {
  if (crm?.status === 'DO NOT CONTACT') return { allowed: false, reason: 'Do Not Contact is active.' };
  if (lead?.demo) return { allowed: false, reason: 'Fictional demo records cannot be contacted.' };
  if (lead?.needsRefresh) return { allowed: false, reason: 'Refresh this saved place before contacting.' };
  // Email outreach was removed from prospect CRM; only WhatsApp drafts remain.
  if (channel === 'email') {
    return { allowed: false, reason: 'Email outreach is no longer available in AgencyOS.' };
  }
  if (channel === 'whatsapp') {
    const phone = String(lead?.internationalPhoneNumber || lead?.phone || '').trim();
    const digits = phone.replace(/\D/g, '');
    const normalizedIndiaPhone = /^\d{10}$/.test(digits) ? `91${digits}` : digits;
    const hasUsablePhone = /^\+[1-9]/.test(phone) ? digits.length >= 8 && digits.length <= 15 : /^91\d{10}$/.test(normalizedIndiaPhone);
    if (lead?.demo || lead?.needsRefresh || !hasUsablePhone) return { allowed: false, reason: 'A valid business phone is required for WhatsApp.' };
    if (!crm?.whatsappOptInConfirmed) return { allowed: false, reason: 'Confirm the recipient’s WhatsApp opt-in first.' };
    return { allowed: true, reason: '' };
  }
  return { allowed: false, reason: 'Unsupported outreach channel.' };
}
