import { addDays, localDateString } from './dates.js';

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
  email: '',
  emailVerifiedByUser: false,
  emailPermissionConfirmed: false,
  whatsappOptInConfirmed: false,
  tags: [],
};

export function updateCrmRecord(current, patch) {
  const next = { ...DEFAULT_CRM_RECORD, ...(current || {}), ...(patch || {}) };
  if (next.status === 'DO NOT CONTACT') {
    next.emailPermissionConfirmed = false;
    next.whatsappOptInConfirmed = false;
  }
  next.followUpStep = Math.max(0, Math.min(4, Number.parseInt(next.followUpStep, 10) || 0));
  next.tags = [...new Set((Array.isArray(next.tags) ? next.tags : []).map((tag) => String(tag).trim()).filter(Boolean))].slice(0, 20);
  return next;
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
  if (channel === 'email') {
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(crm?.email || ''));
    if (!validEmail) return { allowed: false, reason: 'Add a valid business email first.' };
    if (!crm?.emailVerifiedByUser) return { allowed: false, reason: 'Confirm that you verified this user-entered business email.' };
    if (!crm?.emailPermissionConfirmed) return { allowed: false, reason: 'Confirm an appropriate email contact basis first.' };
    return { allowed: true, reason: '' };
  }
  if (channel === 'whatsapp') {
    const phone = String(lead?.internationalPhoneNumber || lead?.phone || '').trim();
    const digits = phone.replace(/\D/g, '');
    if (lead?.demo || lead?.needsRefresh || !/^\+[1-9]/.test(phone) || digits.length < 8 || digits.length > 15) return { allowed: false, reason: 'A public business phone in international format is required for WhatsApp.' };
    if (!crm?.whatsappOptInConfirmed) return { allowed: false, reason: 'Confirm the recipient’s WhatsApp opt-in first.' };
    return { allowed: true, reason: '' };
  }
  return { allowed: false, reason: 'Unsupported outreach channel.' };
}
