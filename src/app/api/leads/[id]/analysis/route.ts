import type { NextRequest } from 'next/server';
import { notFound, ok, readJson, serverError } from '@/lib/api';
import { analysisSchema } from '@/lib/validation';
import { getLead } from '@/lib/db';
import { runWebsiteAnalysis } from '@/lib/services/website-analysis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 45;

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/leads/:id/analysis
 * Runs the heuristic website audit (robots.txt respected, SSRF-guarded).
 * Demo records return a clearly-labelled simulated report instead.
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const lead = getLead(id);
    if (!lead) return notFound('Lead');

    const payload = analysisSchema.parse(await readJson(req).catch(() => ({})));
    const result = await runWebsiteAnalysis(lead, payload.url ?? null);
    if (!result.ok) {
      return ok({ analysis: result.analysis, lead: result.lead, notice: result.notice, ok: false });
    }

    return ok({
      analysis: result.analysis,
      lead: result.lead,
      notice: result.notice,
      ok: true,
      scored: result.lead?.score ?? null,
    });
  } catch (err) {
    return serverError(err);
  }
}
