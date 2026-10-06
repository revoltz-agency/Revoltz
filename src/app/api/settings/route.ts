import type { NextRequest } from 'next/server';
import { ok, readJson, serverError } from '@/lib/api';
import { settingsSchema } from '@/lib/validation';
import { getSettings, saveSettings } from '@/lib/db';
import { getConfig } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/settings — agency profile, pitch defaults, data policy. */
export async function GET() {
  try {
    const cfg = getConfig();
    return ok({
      settings: getSettings(),
      // Read-only reflection of what the server actually has configured.
      integrations: {
        googlePlacesConfigured: cfg.googlePlaces.configured,
        aiConfigured: cfg.ai.enabled,
        aiProvider: cfg.ai.enabled ? cfg.ai.provider : null,
        websiteAnalysisEnabled: cfg.websiteAnalysis.enabled,
        googleDataMaxAgeDays: cfg.googlePlaces.dataMaxAgeDays,
      },
    });
  } catch (err) {
    return serverError(err);
  }
}

/** PATCH /api/settings — update agency profile / pitch defaults / data policy. */
export async function PATCH(req: NextRequest) {
  try {
    const payload = settingsSchema.parse(await readJson(req));
    const settings = saveSettings(payload);
    return ok({ settings, notice: 'Settings saved.' });
  } catch (err) {
    return serverError(err);
  }
}
