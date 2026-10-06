'use client';

import { useMemo, useState } from 'react';
import type { Campaign, Lead } from '@/lib/types';
import { buildFollowUpPlan } from '@/lib/outreach/followup';
import { Badge, Card, CardBody, CardHeader } from '@/components/ui/display';
import { Button } from '@/components/ui/controls';
import { Banner, useToast } from '@/components/ui/feedback';
import { Icon } from '@/components/icons';
import { apiFetch, describeError } from '@/lib/client/api';
import { cn, formatDate } from '@/lib/utils';

const STATE_STYLE = {
  done: { className: 'border-white/10 bg-white/5 text-ink-400', label: 'past' },
  today: { className: 'border-amber-400/30 bg-amber-500/12 text-amber-100', label: 'today' },
  overdue: { className: 'border-rose-400/30 bg-rose-500/12 text-rose-100', label: 'overdue' },
  scheduled: { className: 'border-brand-400/25 bg-brand-500/10 text-brand-100', label: 'scheduled' },
} as const;

const CHANNEL_ICON = { email: 'mail', whatsapp: 'whatsapp', call: 'phone' } as const;

export function FollowUpPanel({
  lead,
  campaign,
  onLeadChange,
}: {
  lead: Lead;
  campaign: Campaign | null;
  onLeadChange: (lead: Lead) => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const plan = useMemo(() => buildFollowUpPlan(lead, campaign), [lead, campaign]);

  async function markStep(stepIndex: number) {
    const step = plan.steps[stepIndex];
    if (!step) return;
    setBusy(step.label);
    const now = new Date().toISOString();
    const next = plan.steps[stepIndex + 1];
    try {
      const res = await apiFetch<{ lead: Lead }>(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: lead.status === 'NEW' || lead.status === 'RESEARCHED' ? 'CONTACTED' : undefined,
          note: `${step.label} (${step.channel}) marked as done manually`,
          crm: {
            lastContactedAt: now,
            nextFollowUpAt: next ? next.date : null,
          },
        }),
      });
      onLeadChange(res.lead);
      toast.push({
        tone: 'success',
        title: `${step.label} logged`,
        description: next ? `Next suggested step: ${next.label} on ${formatDate(next.date)}.` : 'Sequence complete — decide the next move yourself.',
      });
    } catch (err) {
      toast.push({ tone: 'error', title: 'Could not log the step', description: describeError(err) });
    } finally {
      setBusy(null);
    }
  }

  async function snooze(days: number) {
    const base = lead.crm.nextFollowUpAt ? new Date(lead.crm.nextFollowUpAt) : new Date();
    base.setUTCDate(base.getUTCDate() + days);
    try {
      const res = await apiFetch<{ lead: Lead }>(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ crm: { nextFollowUpAt: base.toISOString().slice(0, 10) } }),
      });
      onLeadChange(res.lead);
      toast.push({ tone: 'info', title: `Snoozed ${days} day(s)`, description: `Next follow-up ${formatDate(res.lead.crm.nextFollowUpAt)}.` });
    } catch (err) {
      toast.push({ tone: 'error', title: 'Could not snooze', description: describeError(err) });
    }
  }

  return (
    <Card>
      <CardHeader
        title="Follow-up plan"
        subtitle={
          plan.anchorSource === 'next_follow_up'
            ? `Anchored on your next follow-up date (${formatDate(plan.anchorDate)})`
            : plan.anchorSource === 'last_contacted'
              ? `Anchored on last contact (${formatDate(plan.anchorDate)})`
              : 'Not contacted yet — Day 0 starts today'
        }
        icon="clock"
        action={
          plan.overdue ? (
            <Badge tone="danger">Overdue</Badge>
          ) : plan.dueToday ? (
            <Badge tone="warn">Due today</Badge>
          ) : (
            <Badge tone="neutral">On track</Badge>
          )
        }
      />
      <CardBody className="space-y-3">
        {lead.status === 'DO_NOT_CONTACT' ? (
          <Banner tone="danger" icon="shield">
            This lead is marked DO NOT CONTACT. No follow-ups should be sent.
          </Banner>
        ) : null}

        <ol className="relative space-y-2 border-l border-white/[0.08] pl-4">
          {plan.steps.map((step, index) => {
            const style = STATE_STYLE[step.state];
            return (
              <li key={`${step.day}-${step.label}`} className="relative">
                <span
                  className={cn(
                    'absolute -left-[22px] top-2.5 flex h-3 w-3 items-center justify-center rounded-full border-2 border-ink-900',
                    step.state === 'done' ? 'bg-ink-500' : step.state === 'overdue' ? 'bg-rose-400' : step.state === 'today' ? 'bg-amber-400' : 'bg-brand-400',
                  )}
                />
                <div className="panel-flat p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Icon name={CHANNEL_ICON[step.channel]} size={13} className="text-ink-300" />
                      <span className="text-[13px] font-medium text-ink-100">
                        Day {step.day} · {step.label}
                      </span>
                      <span className={cn('badge', style.className)}>{style.label}</span>
                    </div>
                    <span className="text-[11px] tabular-nums text-ink-400">{formatDate(step.date)}</span>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-ink-400">{step.note}</p>
                  {index === 0 || step.state !== 'done' ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Button size="xs" variant="secondary" icon="check" loading={busy === step.label} onClick={() => markStep(index)}>
                        I did this
                      </Button>
                      {step.channel === 'whatsapp' ? (
                        <span className="text-[11px] text-ink-500">Open the lead&apos;s WhatsApp draft to send it manually.</span>
                      ) : step.channel === 'email' ? (
                        <span className="text-[11px] text-ink-500">Use the outreach panel to open your mail client.</span>
                      ) : (
                        <span className="text-[11px] text-ink-500">Log the call outcome in CRM notes.</span>
                      )}
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>

        <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-3">
          <span className="text-[11px] text-ink-400">Snooze:</span>
          <Button size="xs" variant="ghost" onClick={() => snooze(1)}>
            +1 day
          </Button>
          <Button size="xs" variant="ghost" onClick={() => snooze(3)}>
            +3 days
          </Button>
          <Button size="xs" variant="ghost" onClick={() => snooze(7)}>
            +7 days
          </Button>
          <span className="ml-auto text-[11px] text-ink-500">
            Suggested next: <span className="text-ink-300">{formatDate(plan.suggestedNextDate)}</span>
          </span>
        </div>

        <p className="text-[11px] leading-relaxed text-ink-500">
          AgencyOS only suggests dates. It never sends an email, WhatsApp message or SMS automatically, and it has no scheduler.
        </p>
      </CardBody>
    </Card>
  );
}
