import type { NextRequest } from 'next/server';
import { badRequest, ok, readJson, serverError } from '@/lib/api';
import { getDb, getSettings, isStale, purgeStalePlaceData } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Data hygiene, per Google Places caching policy:
 *  • POST { action: 'purge-stale' } keeps `place_id` + your CRM data but drops
 *    the cached Google fields of snapshots older than the configured window.
 *  • GET returns how many snapshots are currently stale.
 */
export async function GET() {
  try {
    const db = getDb();
    const maxAge = db.settings.dataPolicy.googleDataMaxAgeDays;
    const stale = db.leads.filter((l) => isStale(l, maxAge));
    return ok({
      maxAgeDays: maxAge,
      staleCount: stale.length,
      staleLeads: stale.map((l) => ({ id: l.id, name: l.place.displayName, retrievedAt: l.place.retrievedAt })),
    });
  } catch (err) {
    return serverError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const payload = (await readJson<{ action?: string; maxAgeDays?: number }>(req)) as {
      action?: string;
      maxAgeDays?: number;
    };
    if (payload.action !== 'purge-stale') return badRequest('Only action "purge-stale" is supported.');

    const settings = getSettings();
    const maxAge = payload.maxAgeDays ?? settings.dataPolicy.purgeAfterDays ?? settings.dataPolicy.googleDataMaxAgeDays;
    const purged = purgeStalePlaceData(maxAge);
    return ok({
      purged,
      notice: `${purged} stale Google snapshot(s) purged — place_id and your CRM data were kept. Refresh them from Google before contacting again.`,
    });
  } catch (err) {
    return serverError(err);
  }
}
