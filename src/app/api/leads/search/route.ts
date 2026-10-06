import type { NextRequest } from 'next/server';
import { fail, ok, readJson, serverError } from '@/lib/api';
import { searchSchema } from '@/lib/validation';
import { runLeadSearch } from '@/lib/services/lead-search';
import { getConfig } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/leads/search
 * { industry, city, radiusKm?, maxResults?, latitude?, longitude?, demo? }
 *
 * Returns CANDIDATES only — nothing is written to the CRM until the user
 * imports them via POST /api/leads/import.
 */
export async function POST(req: NextRequest) {
  try {
    const payload = searchSchema.parse(await readJson(req));
    const cfg = getConfig();

    if (!cfg.googlePlaces.configured && payload.demo === false) {
      return fail(
        {
          code: 'GOOGLE_NOT_CONFIGURED',
          message: 'Google Places API not configured — Demo Mode active.',
          hint: 'Set GOOGLE_PLACES_API_KEY in .env.local and restart the server, or keep using Demo Mode.',
        },
        409,
      );
    }

    const result = await runLeadSearch(payload);
    return ok({
      mode: result.mode,
      candidates: result.candidates,
      total: result.candidates.length,
      textQuery: result.textQuery,
      locationBiasUsed: result.locationBiasUsed,
      notices: result.notices,
      query: result.query,
      googleConfigured: result.googleConfigured,
    });
  } catch (err) {
    return serverError(err);
  }
}
