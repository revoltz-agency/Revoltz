import { ok, serverError, publicConfigStatus } from '@/lib/api';
import { getConfig } from '@/lib/config';
import { getDb, storageInfo } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/status
 * Tells the UI what is actually configured. Never returns key values.
 */
export async function GET() {
  try {
    const cfg = getConfig();
    const db = getDb();
    const storage = storageInfo();

    return ok({
      config: publicConfigStatus({
        googlePlaces: {
          configured: cfg.googlePlaces.configured,
          regionCode: cfg.googlePlaces.regionCode,
          languageCode: cfg.googlePlaces.languageCode,
          missingVars: cfg.googlePlaces.missingVars,
        },
        ai: {
          enabled: cfg.ai.enabled,
          provider: cfg.ai.provider,
          model: cfg.ai.model,
          customBaseUrl: cfg.ai.customBaseUrl,
        },
        websiteAnalysis: {
          enabled: cfg.websiteAnalysis.enabled,
          timeoutMs: cfg.websiteAnalysis.timeoutMs,
          maxBytes: cfg.websiteAnalysis.maxBytes,
        },
        storage,
        counts: {
          leads: db.leads.length,
          campaigns: db.campaigns.length,
          suppression: db.suppression.length,
        },
        demoMode: cfg.demoMode || db.settings.demoMode,
        version: cfg.version,
      }),
      banner: cfg.googlePlaces.configured
        ? null
        : 'Google Places API not configured — Demo Mode active.',
    });
  } catch (err) {
    return serverError(err);
  }
}
