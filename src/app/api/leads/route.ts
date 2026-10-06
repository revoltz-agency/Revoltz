import type { NextRequest } from 'next/server';
import { ok, serverError } from '@/lib/api';
import { getDb, isStale, listLeads } from '@/lib/db';
import { parseLeadFilters } from '@/lib/services/lead-query';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/leads?q=&status=&band=&service=&campaign=&hasWebsite=&demo=&stale=
 *     &sortBy=score&sortDir=desc&limit=&offset=
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const filters = parseLeadFilters(url, { paging: true });
    const { leads, total } = listLeads(filters);

    const db = getDb();
    const staleIds = leads.filter((l) => isStale(l, db.settings.dataPolicy.googleDataMaxAgeDays)).map((l) => l.id);

    return ok({ leads, total, staleIds, returnedAt: new Date().toISOString() });
  } catch (err) {
    return serverError(err);
  }
}
