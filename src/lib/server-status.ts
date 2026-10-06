/**
 * Server-rendered configuration status.
 * Only booleans/enums are exposed — never key material.
 */

import { getConfig } from './config';
import { getDb, storageInfo } from './db';
import { DETAILS_FIELD_MASK, SEARCH_FIELD_MASK } from './google/places';

export interface ServerStatus {
  googleConfigured: boolean;
  aiConfigured: boolean;
  aiProvider: 'openai' | 'gemini' | null;
  aiModel: string | null;
  websiteAnalysisEnabled: boolean;
  demoMode: boolean;
  storageDriver: 'json-file' | 'memory';
  storagePersistent: boolean;
  regionCode: string;
  languageCode: string;
  googleDataMaxAgeDays: number;
  /** The literal field masks sent to Google, disclosed in Settings. */
  googleFieldMasks: { search: string; details: string };
  counts: { leads: number; campaigns: number; suppression: number };
  banner: string | null;
  version: string;
}

export function getServerStatus(): ServerStatus {
  const cfg = getConfig();
  const db = getDb();
  const storage = storageInfo();
  const demoMode = cfg.demoMode || db.settings.demoMode;

  return {
    googleConfigured: cfg.googlePlaces.configured,
    aiConfigured: cfg.ai.enabled,
    aiProvider: cfg.ai.enabled ? cfg.ai.provider : null,
    aiModel: cfg.ai.enabled ? cfg.ai.model : null,
    websiteAnalysisEnabled: cfg.websiteAnalysis.enabled,
    demoMode,
    storageDriver: storage.persistent ? 'json-file' : 'memory',
    storagePersistent: storage.persistent,
    regionCode: cfg.googlePlaces.regionCode,
    languageCode: cfg.googlePlaces.languageCode,
    googleDataMaxAgeDays: cfg.googlePlaces.dataMaxAgeDays,
    googleFieldMasks: { search: SEARCH_FIELD_MASK, details: DETAILS_FIELD_MASK },
    counts: {
      leads: db.leads.length,
      campaigns: db.campaigns.length,
      suppression: db.suppression.length,
    },
    banner: cfg.googlePlaces.configured ? null : 'Google Places API not configured — Demo Mode active.',
    version: cfg.version,
  };
}
