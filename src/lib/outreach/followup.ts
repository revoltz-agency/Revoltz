/**
 * Follow-up planning (Day 0 / Day 3 / Day 7).
 *
 * The plan is advisory only: AgencyOS never sends anything on a schedule.
 * Each step tells the user what is due and links to the manual send action.
 */

import type { Campaign, Lead } from '../types';
import { DEFAULT_SEQUENCE } from '../sequence';
import { todayIso } from '../utils';

export type StepState = 'done' | 'today' | 'overdue' | 'scheduled';

export interface FollowUpStepView {
  day: number;
  label: string;
  channel: Campaign['sequence'][number]['channel'];
  note: string;
  date: string; // YYYY-MM-DD
  state: StepState;
}

export interface FollowUpPlan {
  anchorDate: string; // YYYY-MM-DD
  anchorSource: 'last_contacted' | 'next_follow_up' | 'today';
  steps: FollowUpStepView[];
  suggestedNextDate: string;
  overdue: boolean;
  dueToday: boolean;
  nextStep: FollowUpStepView | null;
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function buildFollowUpPlan(lead: Lead, campaign?: Campaign | null): FollowUpPlan {
  const sequence = campaign?.sequence?.length ? campaign.sequence : DEFAULT_SEQUENCE;
  const today = todayIso();

  let anchorDate = today;
  let anchorSource: FollowUpPlan['anchorSource'] = 'today';
  if (lead.crm.nextFollowUpAt) {
    anchorDate = lead.crm.nextFollowUpAt.slice(0, 10);
    anchorSource = 'next_follow_up';
  } else if (lead.crm.lastContactedAt) {
    anchorDate = lead.crm.lastContactedAt.slice(0, 10);
    anchorSource = 'last_contacted';
  }

  // When anchoring on "last contacted", day numbers are relative to that date.
  // When anchoring on an explicit next-follow-up date, day 0 is that date.
  const steps: FollowUpStepView[] = sequence.map((step) => {
    const date = shiftDate(anchorDate, step.day);
    let state: StepState = 'scheduled';
    if (date < today) state = 'done';
    else if (date === today) state = 'today';
    if (anchorSource === 'next_follow_up') {
      state = date < today ? 'overdue' : date === today ? 'today' : 'scheduled';
    }
    return { ...step, date, state };
  });

  const pending = steps.find((s) => s.state === 'overdue') ?? steps.find((s) => s.state === 'today') ?? steps.find((s) => s.state === 'scheduled');
  const suggestedNextDate = lead.crm.nextFollowUpAt
    ? lead.crm.nextFollowUpAt.slice(0, 10)
    : pending?.date ?? shiftDate(today, sequence[1]?.day ?? 3);

  const overdue = Boolean(lead.crm.nextFollowUpAt && lead.crm.nextFollowUpAt.slice(0, 10) < today) || steps.some((s) => s.state === 'overdue');
  const dueToday = lead.crm.nextFollowUpAt?.slice(0, 10) === today || steps.some((s) => s.state === 'today');

  return {
    anchorDate,
    anchorSource,
    steps,
    suggestedNextDate,
    overdue,
    dueToday,
    nextStep: pending ?? null,
  };
}

export interface FollowUpBuckets {
  overdue: Lead[];
  today: Lead[];
  upcoming: Lead[];
  unscheduled: Lead[];
}

export function followUpBuckets(leads: Lead[]): FollowUpBuckets {
  const today = todayIso();
  const buckets: FollowUpBuckets = { overdue: [], today: [], upcoming: [], unscheduled: [] };
  for (const lead of leads) {
    if (lead.status === 'DO_NOT_CONTACT' || lead.status === 'WON' || lead.status === 'LOST') continue;
    const next = lead.crm.nextFollowUpAt?.slice(0, 10);
    if (!next) {
      buckets.unscheduled.push(lead);
      continue;
    }
    if (next < today) buckets.overdue.push(lead);
    else if (next === today) buckets.today.push(lead);
    else buckets.upcoming.push(lead);
  }
  const byDate = (a: Lead, b: Lead) => (a.crm.nextFollowUpAt ?? '').localeCompare(b.crm.nextFollowUpAt ?? '');
  buckets.overdue.sort(byDate);
  buckets.today.sort(byDate);
  buckets.upcoming.sort(byDate);
  return buckets;
}

export function nextFollowUpAfterContact(contactedAt: string, campaign?: Campaign | null): string {
  const sequence = campaign?.sequence?.length ? campaign.sequence : DEFAULT_SEQUENCE;
  const follow = sequence[1] ?? DEFAULT_SEQUENCE[1]!;
  return shiftDate(contactedAt.slice(0, 10), follow.day);
}
