import type { NextRequest } from 'next/server';
import { ok, serverError } from '@/lib/api';
import { getCampaign, getDb } from '@/lib/db';
import { buildFollowUpPlan, followUpBuckets } from '@/lib/outreach/followup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/follow-ups?campaign=&limit=
 * Everything that needs a human touch today. Suggestions only — the app never
 * sends anything by itself.
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const campaignId = url.searchParams.get('campaign');
    const limit = Math.min(100, Number.parseInt(url.searchParams.get('limit') ?? '25', 10) || 25);
    const db = getDb();

    const leads = db.leads.filter((l) => (campaignId ? l.campaignId === campaignId : true));
    const buckets = followUpBuckets(leads);
    const campaign = campaignId ? getCampaign(campaignId) : null;

    const withPlan = (rows: typeof leads) =>
      rows.slice(0, limit).map((lead) => ({
        lead,
        plan: buildFollowUpPlan(lead, lead.campaignId ? getCampaign(lead.campaignId) ?? campaign : campaign),
      }));

    return ok({
      overdue: withPlan(buckets.overdue),
      today: withPlan(buckets.today),
      upcoming: withPlan(buckets.upcoming),
      unscheduled: buckets.unscheduled.length,
      counts: {
        overdue: buckets.overdue.length,
        today: buckets.today.length,
        upcoming: buckets.upcoming.length,
        unscheduled: buckets.unscheduled.length,
      },
    });
  } catch (err) {
    return serverError(err);
  }
}
