'use client';

import { useState } from 'react';
import type { Lead, OpportunityScore } from '@/lib/types';
import { BAND_META } from '@/lib/scoring/opportunity';
import { Badge, Card, CardBody, CardHeader, ProgressBar, ScoreRing, BandBadge } from '@/components/ui/display';
import { Button } from '@/components/ui/controls';
import { Banner, useToast } from '@/components/ui/feedback';
import { Icon } from '@/components/icons';
import { apiFetch, describeError } from '@/lib/client/api';
import { cn } from '@/lib/utils';

const STATE_META = {
  awarded: { icon: 'check' as const, className: 'text-emerald-300 border-emerald-400/25 bg-emerald-500/10', label: 'counted' },
  'not-met': { icon: 'close' as const, className: 'text-ink-400 border-white/10 bg-white/5', label: 'not met' },
  unknown: { icon: 'info' as const, className: 'text-amber-200 border-amber-400/25 bg-amber-500/10', label: 'unknown' },
};

export function ScorePanel({ lead, onLeadChange }: { lead: Lead; onLeadChange: (lead: Lead) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const score: OpportunityScore | null = lead.score;

  async function recompute() {
    setBusy(true);
    try {
      const res = await apiFetch<{ lead: Lead; generatedBy: 'ai' | 'template'; notice: string | null }>(`/api/leads/${lead.id}/score`, {
        method: 'POST',
      });
      onLeadChange(res.lead);
      toast.push({
        tone: 'success',
        title: res.generatedBy === 'ai' ? 'Score recalculated · reason rewritten by AI' : 'Score recalculated',
        description: res.notice ?? 'Deterministic scoring from the stored evidence.',
      });
    } catch (err) {
      toast.push({ tone: 'error', title: 'Could not recalculate', description: describeError(err) });
    } finally {
      setBusy(false);
    }
  }

  if (!score) {
    return (
      <Card>
        <CardHeader title="Opportunity Score" icon="target" />
        <CardBody>
          <Banner tone="info">No score yet — it is calculated as soon as place data is stored.</Banner>
        </CardBody>
      </Card>
    );
  }

  const meta = BAND_META[score.band];

  return (
    <Card>
      <CardHeader
        title="Opportunity Score"
        subtitle="Deterministic model — every point traces back to data that was actually retrieved"
        icon="target"
        action={
          <Button size="xs" variant="ghost" icon="refresh" loading={busy} onClick={recompute}>
            Recalculate
          </Button>
        }
      />
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          <ScoreRing score={score.score} size={84} strokeWidth={7} showValue={false} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-3xl font-semibold tracking-tight text-ink-100 tabular-nums">{score.score}</span>
              <span className="text-sm text-ink-400">/100</span>
              <BandBadge band={score.band} />
              <Badge tone={score.generatedBy === 'ai' ? 'brand' : 'neutral'} icon="sparkles">
                {score.generatedBy === 'ai' ? 'AI reason' : 'Template reason'}
              </Badge>
            </div>
            <p className="mt-1 text-[11px] text-ink-400">
              {meta.emoji} {meta.label} ({meta.range})
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-200">{score.reason}</p>
          </div>
        </div>

        <div>
          <ProgressBar value={score.dataCoverage} label={`Signal coverage — ${score.dataCoverage} of 100 points were evaluable with retrieved data`} tone={score.dataCoverage >= 80 ? 'success' : score.dataCoverage >= 50 ? 'warn' : 'danger'} />
        </div>

        {score.dataCoverage < 100 ? (
          <Banner tone="warn" icon="info">
            Some factors are marked <span className="font-medium">unknown</span> because the data was not retrieved. Run the website analysis (or refresh
            from Google) to complete the picture — AgencyOS never guesses a missing signal.
          </Banner>
        ) : null}

        <ul className="space-y-2">
          {score.factors.map((factor) => {
            const stateMeta = STATE_META[factor.state];
            return (
              <li key={factor.key} className="panel-flat p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2">
                    <span className={cn('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border', stateMeta.className)}>
                      <Icon name={stateMeta.icon} size={11} strokeWidth={2.4} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-ink-100">{factor.label}</p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-ink-400">{factor.evidence}</p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={cn('text-sm font-semibold tabular-nums', factor.awarded > 0 ? 'text-emerald-200' : 'text-ink-400')}>
                      +{factor.awarded}
                    </p>
                    <p className="text-[10px] uppercase tracking-wider text-ink-500">
                      of {factor.maxPoints} · {stateMeta.label}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <p className="text-[11px] leading-relaxed text-ink-500">
          Model: no website +30 · poor/weak website +20 · high review volume +15 · strong rating +10 · active-looking business +10 · missing
          enquiry/contact flow +10 · social presence +5. Bands: 🔥 80–100 High, 🟡 50–79 Medium, ⚪ below 50 Low.
        </p>
      </CardBody>
    </Card>
  );
}
