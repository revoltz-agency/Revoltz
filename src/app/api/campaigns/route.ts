import type { NextRequest } from 'next/server';
import { ok, readJson, serverError } from '@/lib/api';
import { campaignSchema } from '@/lib/validation';
import { leadsForCampaign, listCampaigns, makeCampaign, saveCampaign } from '@/lib/db';
import { computeCampaignStats } from '@/lib/metrics';
import type { ServiceKey } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/campaigns — list with computed stats. */
export async function GET() {
  try {
    const campaigns = listCampaigns();
    const rows = campaigns.map((campaign) => ({
      ...campaign,
      stats: computeCampaignStats(leadsForCampaign(campaign.id)),
    }));
    return ok({ campaigns: rows, total: rows.length });
  } catch (err) {
    return serverError(err);
  }
}

/** POST /api/campaigns — create a campaign (manual-send-only by design). */
export async function POST(req: NextRequest) {
  try {
    const payload = campaignSchema.parse(await readJson(req));
    const campaign = makeCampaign({
      name: payload.name,
      description: payload.description,
      service: (payload.service ?? null) as ServiceKey | null,
    });
    if (payload.sequence) campaign.sequence = payload.sequence.map((s) => ({ ...s, note: s.note ?? '' }));
    if (payload.status) campaign.status = payload.status;

    const saved = saveCampaign(campaign);
    return ok({ campaign: saved, stats: computeCampaignStats([]) });
  } catch (err) {
    return serverError(err);
  }
}
