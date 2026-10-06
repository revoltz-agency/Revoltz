import type { NextRequest } from 'next/server';
import { ok, readJson, serverError } from '@/lib/api';
import { bulkSchema } from '@/lib/validation';
import { bulkUpdateLeads, deleteLeads, getCampaign } from '@/lib/db';
import { nextFollowUpAfterContact } from '@/lib/outreach/followup';
import { nowIso } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/leads/bulk
 * Bulk CRM updates only (status, campaign, service, tags) or bulk delete.
 * There is deliberately NO bulk messaging action anywhere in this app.
 */
export async function POST(req: NextRequest) {
  try {
    const payload = bulkSchema.parse(await readJson(req));
    const patch = { ...payload.patch };

    // Marking leads as contacted in bulk also schedules the Day-3 follow-up,
    // which the user then sends manually from the lead page.
    if (patch.status === 'CONTACTED') {
      const campaign = patch.campaignId ? getCampaign(patch.campaignId) : null;
      patch.crm = {
        ...(patch.crm ?? {}),
        lastContactedAt: patch.crm?.lastContactedAt ?? nowIso(),
        nextFollowUpAt: patch.crm?.nextFollowUpAt ?? nextFollowUpAfterContact(nowIso(), campaign),
      };
    }

    if (payload.action === 'delete') {
      const removed = deleteLeads(payload.ids);
      return ok({ removed, notice: `${removed} lead(s) deleted.` });
    }

    const updated = bulkUpdateLeads(payload.ids, patch);
    return ok({ updated, notice: `${updated} lead(s) updated.` });
  } catch (err) {
    return serverError(err);
  }
}
