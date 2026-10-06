import type { Campaign, Settings, SuppressionEntry } from '../types';
import { DEFAULT_SEQUENCE } from '../sequence';
import { getConfig } from '../config';
import { newId, nowIso } from '../utils';

export function defaultSettings(): Settings {
  const cfg = getConfig();
  return {
    agency: {
      name: cfg.agency.name,
      senderName: cfg.agency.senderName,
      senderEmail: cfg.agency.senderEmail,
      whatsappNumber: cfg.agency.whatsappNumber,
      website: '',
      city: cfg.agency.city,
      defaultCountryCode: cfg.agency.defaultCountryCode,
      currency: cfg.agency.currency,
    },
    pitch: {
      tone: 'professional',
      services: ['WEBSITE', 'AI_AUTOMATION', 'AI_CHATBOT'],
      introLine: 'I run an AI/web agency that helps local businesses improve their online presence and convert more enquiries.',
      offerLine: 'I had a quick idea for how {business} could improve this.',
      ctaLine: 'Would you be open to seeing a quick demo?',
    },
    dataPolicy: {
      googleDataMaxAgeDays: cfg.googlePlaces.dataMaxAgeDays,
      purgeAfterDays: Math.max(cfg.googlePlaces.dataMaxAgeDays, 30),
      keepOnlyPlaceIdWhenPurging: true,
    },
    demoMode: cfg.demoMode,
    updatedAt: nowIso(),
  };
}

export { DEFAULT_SEQUENCE };

export function defaultCampaigns(): Campaign[] {
  return [];
}

export function defaultSuppression(): SuppressionEntry[] {
  return [];
}

export function makeCampaign(input: { name: string; description?: string; service?: Campaign['service'] }): Campaign {
  const now = nowIso();
  return {
    id: newId('cmp'),
    name: input.name,
    description: input.description ?? '',
    service: input.service ?? null,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
    sequence: DEFAULT_SEQUENCE.map((s) => ({ ...s })),
    manualSendOnly: true,
  };
}
