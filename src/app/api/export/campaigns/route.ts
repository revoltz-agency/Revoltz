import type { NextRequest } from 'next/server';
import { serverError } from '@/lib/api';
import { leadsForCampaign, listCampaigns } from '@/lib/db';
import { CAMPAIGN_CSV_COLUMNS, toCsv } from '@/lib/csv';
import { computeCampaignStats } from '@/lib/metrics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/export/campaigns — CSV summary of campaigns and their results. */
export async function GET(_req: NextRequest) {
  try {
    const campaigns = listCampaigns();
    const rows = campaigns.map((campaign) => {
      const stats = computeCampaignStats(leadsForCampaign(campaign.id));
      return {
        ...campaign,
        leadCount: stats.leads,
        contacted: stats.contacted,
        replies: stats.replies,
        won: stats.won,
        pipelineValue: stats.pipelineValue,
      };
    });
    const csv = toCsv(rows, CAMPAIGN_CSV_COLUMNS);
    const stamp = new Date().toISOString().slice(0, 10);

    return new Response(`\uFEFF${csv}`, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="agencyos-campaigns-${stamp}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return serverError(err);
  }
}
