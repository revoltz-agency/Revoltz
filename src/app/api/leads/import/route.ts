import type { NextRequest } from 'next/server';
import { ok, readJson, serverError } from '@/lib/api';
import { importSchema } from '@/lib/validation';
import { importCandidates } from '@/lib/services/lead-search';
import { recordSearch } from '@/lib/db';
import type { PlaceSnapshot, SearchQueryRecord } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/leads/import
 * Saves the candidates the user picked. Deduped by place_id: an existing lead
 * gets a refreshed Google snapshot while notes/status/drafts are preserved.
 */
export async function POST(req: NextRequest) {
  try {
    const payload = importSchema.parse(await readJson(req));
    const query = (payload.query ?? null) as SearchQueryRecord | null;

    const result = importCandidates({
      candidates: payload.candidates.map((c) => ({ place: c.place as PlaceSnapshot })),
      query,
      campaignId: payload.campaignId ?? null,
      isDemo: payload.isDemo,
    });

    if (query) recordSearch(query);

    return ok({
      imported: result.imported,
      created: result.created,
      refreshed: result.refreshed,
      notice: result.notice,
    });
  } catch (err) {
    return serverError(err);
  }
}
