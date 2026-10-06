import type { NextRequest } from 'next/server';
import { badRequest, notFound, ok, readJson, serverError } from '@/lib/api';
import { leadPatchSchema } from '@/lib/validation';
import { deleteLead, getCampaign, getLead, getSettings, isSuppressed, updateLead } from '@/lib/db';
import { buildFollowUpPlan } from '@/lib/outreach/followup';
import { attachLinks } from '@/lib/outreach/generate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

function decorate(lead: NonNullable<ReturnType<typeof getLead>>) {
  const campaign = lead.campaignId ? getCampaign(lead.campaignId) : null;
  const settings = getSettings();
  return {
    ...lead,
    outreach: lead.outreach ? attachLinks(lead.outreach, lead, settings) : null,
    followUp: buildFollowUpPlan(lead, campaign),
    campaign: campaign ? { id: campaign.id, name: campaign.name } : null,
    suppressed: isSuppressed(lead),
  };
}

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const lead = getLead(id);
    if (!lead) return notFound('Lead');
    return ok({ lead: decorate(lead) });
  } catch (err) {
    return serverError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const existing = getLead(id);
    if (!existing) return notFound('Lead');

    const payload = leadPatchSchema.parse(await readJson(req));
    // updateLead() re-scores automatically whenever `place` or `analysis` change.
    const updated = updateLead(id, payload);
    if (!updated) return notFound('Lead');

    return ok({ lead: decorate(updated) });
  } catch (err) {
    return serverError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const removed = deleteLead(id);
    if (!removed) return notFound('Lead');
    return ok({ deleted: id });
  } catch (err) {
    return serverError(err);
  }
}

export async function PUT(req: NextRequest, ctx: Params) {
  // PUT is not supported — PATCH is the update verb for leads.
  void req;
  void ctx;
  return badRequest('Use PATCH to update a lead.');
}
