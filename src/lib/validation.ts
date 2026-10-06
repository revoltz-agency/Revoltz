import { z } from 'zod';
import { LEAD_STATUSES, SERVICES, type LeadStatus, type ServiceKey } from './types';

const statusValues = LEAD_STATUSES as [LeadStatus, ...LeadStatus[]];
const serviceKeys = SERVICES.map((s) => s.key) as [ServiceKey, ...ServiceKey[]];

export const searchSchema = z.object({
  industry: z.string().trim().min(2, 'Industry is required').max(120),
  city: z.string().trim().min(2, 'City/location is required').max(120),
  radiusKm: z.coerce.number().min(0).max(50).nullish(),
  maxResults: z.coerce.number().int().min(1).max(20).default(20),
  latitude: z.coerce.number().min(-90).max(90).nullish(),
  longitude: z.coerce.number().min(-180).max(180).nullish(),
  demo: z.boolean().optional(),
  campaignId: z.string().nullish(),
});
export type SearchPayload = z.infer<typeof searchSchema>;

export const leadPatchSchema = z.object({
  status: z.enum(statusValues).optional(),
  note: z.string().max(500).nullish(),
  email: z.string().trim().max(160).nullable().optional(),
  campaignId: z.string().max(64).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(32)).max(20).optional(),
  crm: z
    .object({
      notes: z.string().max(5000).optional(),
      lastContactedAt: z.string().max(40).nullable().optional(),
      nextFollowUpAt: z.string().max(20).nullable().optional(),
      assignedService: z.enum(serviceKeys).nullable().optional(),
      estimatedDealValue: z.coerce.number().min(0).max(1_000_000_000).nullable().optional(),
      currency: z.string().trim().length(3).optional(),
      owner: z.string().trim().max(120).nullable().optional(),
    })
    .optional(),
});
export type LeadPatchPayload = z.infer<typeof leadPatchSchema>;

export const pitchSchema = z.object({
  tone: z.enum(['professional', 'friendly', 'direct']).optional(),
  service: z.enum(serviceKeys).nullable().optional(),
  preferAi: z.boolean().optional(),
});

export const bulkSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
  patch: leadPatchSchema.omit({ note: true }).partial(),
  action: z.enum(['update', 'delete']).default('update'),
});

export const campaignSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).optional(),
  service: z.enum(serviceKeys).nullable().optional(),
  status: z.enum(['draft', 'active', 'paused', 'completed']).optional(),
  sequence: z
    .array(
      z.object({
        day: z.coerce.number().int().min(0).max(365),
        label: z.string().trim().min(1).max(80),
        channel: z.enum(['email', 'whatsapp', 'call']),
        note: z.string().trim().max(300).optional(),
      }),
    )
    .min(1)
    .max(8)
    .optional(),
});

export const campaignLeadsSchema = z.object({
  leadIds: z.array(z.string().min(1)).min(1).max(500),
});

export const settingsSchema = z.object({
  agency: z
    .object({
      name: z.string().trim().max(120).optional(),
      senderName: z.string().trim().max(120).optional(),
      senderEmail: z.string().trim().max(160).optional(),
      whatsappNumber: z.string().trim().max(32).optional(),
      website: z.string().trim().max(200).optional(),
      city: z.string().trim().max(120).optional(),
      defaultCountryCode: z.string().trim().max(4).optional(),
      currency: z.string().trim().length(3).optional(),
    })
    .optional(),
  pitch: z
    .object({
      tone: z.enum(['professional', 'friendly', 'direct']).optional(),
      services: z.array(z.enum(serviceKeys)).max(8).optional(),
      introLine: z.string().trim().max(400).optional(),
      offerLine: z.string().trim().max(400).optional(),
      ctaLine: z.string().trim().max(400).optional(),
    })
    .optional(),
  dataPolicy: z
    .object({
      googleDataMaxAgeDays: z.coerce.number().int().min(1).max(365).optional(),
      purgeAfterDays: z.coerce.number().int().min(1).max(365).optional(),
      keepOnlyPlaceIdWhenPurging: z.boolean().optional(),
    })
    .optional(),
  demoMode: z.boolean().optional(),
});

export const suppressionSchema = z.object({
  kind: z.enum(['phone', 'email', 'domain', 'business']),
  value: z.string().trim().min(2).max(160),
  reason: z.string().trim().max(300).optional(),
});

export const analysisSchema = z.object({
  url: z.string().trim().url().max(500).optional(),
  force: z.boolean().optional(),
});

export const searchQueryRecordSchema = z.object({
  industry: z.string().max(160),
  city: z.string().max(160),
  radiusKm: z.number().nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  maxResults: z.number().int().min(1).max(20),
  executedAt: z.string().max(40),
  mode: z.enum(['live', 'demo']),
});

/**
 * Snapshots come straight from the Places API (or the demo dataset), so we
 * re-validate them on import instead of trusting the browser payload.
 */
export const placeSnapshotSchema = z.object({
  placeId: z.string().min(1).max(400),
  displayName: z.string().min(1).max(300),
  formattedAddress: z.string().max(600).nullable().optional(),
  nationalPhoneNumber: z.string().max(60).nullable().optional(),
  internationalPhoneNumber: z.string().max(60).nullable().optional(),
  websiteUri: z.string().max(600).nullable().optional(),
  rating: z.number().min(0).max(5).nullable().optional(),
  userRatingCount: z.number().int().min(0).nullable().optional(),
  googleMapsUri: z.string().max(2000).nullable().optional(),
  primaryType: z.string().max(160).nullable().optional(),
  types: z.array(z.string().max(80)).max(30).optional(),
  businessStatus: z.string().max(60).nullable().optional(),
  openNow: z.boolean().nullable().optional(),
  priceLevel: z.string().max(60).nullable().optional(),
  retrievedAt: z.string().max(40),
  source: z.enum(['google_places', 'demo']),
});

export const importSchema = z.object({
  candidates: z.array(z.object({ place: placeSnapshotSchema })).min(1).max(20),
  query: searchQueryRecordSchema.nullish(),
  campaignId: z.string().max(64).nullish(),
  isDemo: z.boolean().optional(),
});
export type ImportPayloadInput = z.infer<typeof importSchema>;
