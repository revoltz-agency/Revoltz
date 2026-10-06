import type { NextRequest } from 'next/server';
import { notFound, ok, serverError } from '@/lib/api';
import { getLead, getSettings, updateLead } from '@/lib/db';
import { computeOpportunityScore } from '@/lib/scoring/opportunity';
import { generateScoreReason } from '@/lib/outreach/generate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/leads/:id/score
 * Recomputes the deterministic Opportunity Score from the data currently stored,
 * and (optionally, when an AI key exists) rewrites the one-line reason.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const lead = getLead(id);
    if (!lead) return notFound('Lead');

    const settings = getSettings();
    const score = computeOpportunityScore({ place: lead.place, analysis: lead.analysis });

    const ai = await generateScoreReason({ ...lead, score }, settings);
    score.reason = ai.reason;
    score.generatedBy = ai.generatedBy;

    const updated = updateLead(id, { score });

    return ok({ score, lead: updated, generatedBy: ai.generatedBy, notice: ai.notice ?? null });
  } catch (err) {
    return serverError(err);
  }
}
