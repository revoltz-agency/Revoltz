import type { NextRequest } from 'next/server';
import { notFound, ok, readJson, serverError } from '@/lib/api';
import { campaignSchema } from '@/lib/validation';
import { deleteCampaign, getCampaign, leadsForCampaign, saveCampaign } from '@/lib/db';
import { computeCampaignStats } from '@/lib/metrics';
import type { ServiceKey } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const campaign = getCampaign(id);
    if (!campaign) return notFound('Campaign');
    const leads = leadsForCampaign(id);
    return ok({ campaign, leads, stats: computeCampaignStats(leads) });
  } catch (err) {
    return serverError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const campaign = getCampaign(id);
    if (!campaign) return notFound('Campaign');

    const payload = campaignSchema.partial().parse(await readJson(req));
    const updated = {
      ...campaign,
      ...payload,
      service: (payload.service ?? campaign.service) as ServiceKey | null,
      sequence: payload.sequence
        ? payload.sequence.map((s) => ({ ...s, note: s.note ?? '' }))
        : campaign.sequence,
      manualSendOnly: true as const,
    };
    const saved = saveCampaign(updated);
    return ok({ campaign: saved, stats: computeCampaignStats(leadsForCampaign(id)) });
  } catch (err) {
    return serverError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const removed = deleteCampaign(id);
    if (!removed) return notFound('Campaign');
    return ok({ deleted: id, notice: 'Campaign deleted. Its leads were kept and unassigned.' });
  } catch (err) {
    return serverError(err);
  }
}
