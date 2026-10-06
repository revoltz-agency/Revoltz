import type { NextRequest } from 'next/server';
import { fail, notFound, ok, serverError } from '@/lib/api';
import { getLead, updateLead, upsertLeadFromPlace } from '@/lib/db';
import { getPlaceDetails } from '@/lib/google/places';
import { getConfig } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/leads/:id/refresh
 * Re-reads the place from Google using the stored place_id — the compliant way
 * to keep snapshots fresh. Demo records are never "refreshed" from the network.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const lead = getLead(id);
    if (!lead) return notFound('Lead');

    if (lead.isDemo || lead.place.source === 'demo') {
      return fail(
        {
          code: 'DEMO_RECORD',
          message: 'This is a fictional demo record — there is nothing to refresh.',
          hint: 'Add GOOGLE_PLACES_API_KEY and run a live search to refresh real Places data.',
        },
        409,
      );
    }

    const cfg = getConfig();
    if (!cfg.googlePlaces.configured) {
      return fail(
        {
          code: 'GOOGLE_NOT_CONFIGURED',
          message: 'Google Places API not configured — Demo Mode active.',
          hint: 'Set GOOGLE_PLACES_API_KEY in .env.local to refresh live place data.',
        },
        409,
      );
    }

    const place = await getPlaceDetails(lead.place.placeId);
    const websiteChanged = (lead.place.websiteUri ?? null) !== (place.websiteUri ?? null);

    const { lead: updated, created } = upsertLeadFromPlace({
      place,
      query: lead.query,
      isDemo: false,
      campaignId: lead.campaignId,
    });

    // The old audit described a different (or missing) site — drop it rather
    // than keep claims that no longer match the retrieved data.
    if (websiteChanged) updateLead(updated.id, { analysis: null });

    return ok({
      lead: websiteChanged ? getLead(updated.id) : updated,
      refreshed: true,
      created,
      notice: websiteChanged
        ? `Snapshot refreshed from Google Places (place_id ${place.placeId}). The website changed, so the previous audit was discarded — run Analyze Website again.`
        : `Snapshot refreshed from Google Places (place_id ${place.placeId}). CRM data, notes and drafts were preserved.`,
    });
  } catch (err) {
    return serverError(err);
  }
}
