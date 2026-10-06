import type { NextRequest } from 'next/server';
import { serverError } from '@/lib/api';
import { getDb, listLeads } from '@/lib/db';
import { leadsToCsv } from '@/lib/csv';
import { parseLeadFilters } from '@/lib/services/lead-query';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/export/leads — CSV of the user's own prospecting workflow data.
 * Accepts the same filters as GET /api/leads.
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const filters = parseLeadFilters(url);
    const { leads } = listLeads(filters);
    const db = getDb();
    const csv = leadsToCsv(leads, db.campaigns);
    const stamp = new Date().toISOString().slice(0, 10);

    return new Response(`\uFEFF${csv}`, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="agencyos-leads-${stamp}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return serverError(err);
  }
}
