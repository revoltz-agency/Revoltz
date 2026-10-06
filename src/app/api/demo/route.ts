import type { NextRequest } from 'next/server';
import { badRequest, ok, readJson, serverError } from '@/lib/api';
import { clearAllLeads, clearDemoData, getDb, reseedDemoData } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/demo  { action: 'reseed' | 'clear' | 'clear-all-leads' }
 * Demo data controls. Only ever touches records flagged `isDemo`.
 */
export async function POST(req: NextRequest) {
  try {
    const payload = (await readJson<{ action?: string }>(req)) as { action?: string };
    const action = payload.action ?? 'reseed';

    if (action === 'reseed') {
      const result = reseedDemoData();
      return ok({ ...result, notice: `Demo dataset restored (${result.leads} fictional businesses).` });
    }
    if (action === 'clear') {
      const removed = clearDemoData();
      return ok({ removed, notice: `${removed} demo lead(s) removed.` });
    }
    if (action === 'clear-all-leads') {
      const removed = clearAllLeads();
      return ok({ removed, notice: `All ${removed} lead(s) deleted. Campaigns and settings were kept.` });
    }

    return badRequest(`Unknown demo action "${action}".`);
  } catch (err) {
    return serverError(err);
  }
}

/** GET /api/demo — quick summary of demo vs live records. */
export async function GET(_req: NextRequest) {
  try {
    const db = getDb();
    return ok({
      demoLeads: db.leads.filter((l) => l.isDemo).length,
      liveLeads: db.leads.filter((l) => !l.isDemo).length,
      total: db.leads.length,
    });
  } catch (err) {
    return serverError(err);
  }
}
