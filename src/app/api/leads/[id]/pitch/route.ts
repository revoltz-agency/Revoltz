import type { NextRequest } from 'next/server';
import { notFound, ok, readJson, serverError } from '@/lib/api';
import { pitchSchema } from '@/lib/validation';
import { getLead, getSettings, updateLead } from '@/lib/db';
import { generateOutreach } from '@/lib/outreach/generate';
import type { ServiceKey } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/leads/:id/pitch
 * Generates (and stores) an email subject/body + WhatsApp draft.
 * Nothing is sent — the response only contains copy and mailto:/wa.me links.
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const lead = getLead(id);
    if (!lead) return notFound('Lead');

    const payload = pitchSchema.parse(await readJson(req).catch(() => ({})));
    const settings = getSettings();

    const result = await generateOutreach({
      lead,
      settings,
      tone: payload.tone,
      service: (payload.service ?? undefined) as ServiceKey | null | undefined,
      preferAi: payload.preferAi,
    });

    const updated = updateLead(id, { outreach: result.draft });

    return ok({
      outreach: result.draft,
      lead: updated,
      notice: result.notice,
      usedAi: result.usedAi,
      compliance:
        'Draft only — nothing was sent. Review the copy, then send it yourself from your own mail client or WhatsApp. Only contact businesses that publish their details for enquiries and honour opt-outs immediately.',
    });
  } catch (err) {
    return serverError(err);
  }
}
