import type { NextRequest } from 'next/server';
import { notFound, ok, readJson, serverError } from '@/lib/api';
import { campaignLeadsSchema } from '@/lib/validation';
import { getCampaign, getLead, leadsForCampaign, updateLead } from '@/lib/db';
import { computeCampaignStats } from '@/lib/metrics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** POST — attach leads to a campaign. DELETE-style detach uses ?detach=1. */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const campaign = getCampaign(id);
    if (!campaign) return notFound('Campaign');

    const payload = campaignLeadsSchema.parse(await readJson(req));
    const url = new URL(req.url);
    const detach = url.searchParams.get('detach') === '1';

    let changed = 0;
    for (const leadId of payload.leadIds) {
      const lead = getLead(leadId);
      if (!lead) continue;
      if (detach && lead.campaignId !== id) continue;
      updateLead(leadId, { campaignId: detach ? null : id });
      changed += 1;
    }

    const leads = leadsForCampaign(id);
    return ok({
      changed,
      campaign,
      leads,
      stats: computeCampaignStats(leads),
      notice: detach ? `${changed} lead(s) removed from the campaign.` : `${changed} lead(s) added to "${campaign.name}".`,
    });
  } catch (err) {
    return serverError(err);
  }
}
