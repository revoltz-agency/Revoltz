/** Dashboard & campaign metrics, computed from stored workflow data only. */

import type { Campaign, Lead, LeadStatus, ScoreBand, ServiceKey } from './types';
import { FUNNEL_STAGES, LEAD_STATUSES, SERVICES } from './types';
import { groupCount } from './utils';

/** Cumulative stage definitions used by the stat cards. */
export const STAGE_SETS: Record<'contacted' | 'replies' | 'meetings' | 'won', LeadStatus[]> = {
  contacted: ['CONTACTED', 'REPLIED', 'INTERESTED', 'CALL_BOOKED', 'PROPOSAL', 'WON'],
  replies: ['REPLIED', 'INTERESTED', 'CALL_BOOKED', 'PROPOSAL', 'WON'],
  meetings: ['CALL_BOOKED', 'PROPOSAL', 'WON'],
  won: ['WON'],
};

export interface DashboardMetrics {
  total: number;
  highPriority: number;
  mediumPriority: number;
  lowPriority: number;
  contacted: number;
  replies: number;
  meetings: number;
  won: number;
  lost: number;
  doNotContact: number;
  new: number;
  researched: number;
  avgScore: number;
  pipelineValue: number;
  wonValue: number;
  byStatus: Record<string, number>;
  byBand: Record<ScoreBand, number>;
  byService: { service: ServiceKey; label: string; count: number; value: number }[];
  funnel: { stage: LeadStatus; label: string; count: number }[];
  activity: { date: string; contacted: number; replies: number; won: number }[];
  websiteCoverage: { withWebsite: number; withoutWebsite: number; analyzed: number };
  dataHealth: { live: number; demo: number; stale: number };
  replyRate: number;
  winRate: number;
}

export function computeMetrics(leads: Lead[], opts: { staleIds?: Set<string>; days?: number } = {}): DashboardMetrics {
  const days = opts.days ?? 14;
  const byStatus = groupCount(leads, (l) => l.status);
  const countIn = (statuses: LeadStatus[]) => leads.filter((l) => statuses.includes(l.status)).length;

  const bands: Record<ScoreBand, number> = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  let scoreSum = 0;
  let scoredCount = 0;
  for (const lead of leads) {
    if (lead.score) {
      bands[lead.score.band] += 1;
      scoreSum += lead.score.score;
      scoredCount += 1;
    }
  }

  const today = new Date();
  const activity: DashboardMetrics['activity'] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    const events = leads.flatMap((l) => l.statusHistory.filter((e) => e.at.slice(0, 10) === key));
    activity.push({
      date: key,
      contacted: events.filter((e) => STAGE_SETS.contacted.includes(e.status)).length,
      replies: events.filter((e) => STAGE_SETS.replies.includes(e.status)).length,
      won: events.filter((e) => e.status === 'WON').length,
    });
  }

  const contacted = countIn(STAGE_SETS.contacted);
  const replies = countIn(STAGE_SETS.replies);
  const won = countIn(STAGE_SETS.won);

  return {
    total: leads.length,
    highPriority: bands.HIGH,
    mediumPriority: bands.MEDIUM,
    lowPriority: bands.LOW,
    contacted,
    replies,
    meetings: countIn(STAGE_SETS.meetings),
    won,
    lost: byStatus.LOST ?? 0,
    doNotContact: byStatus.DO_NOT_CONTACT ?? 0,
    new: byStatus.NEW ?? 0,
    researched: byStatus.RESEARCHED ?? 0,
    avgScore: scoredCount > 0 ? Math.round(scoreSum / scoredCount) : 0,
    pipelineValue: leads
      .filter((l) => !['WON', 'LOST', 'DO_NOT_CONTACT'].includes(l.status))
      .reduce((sum, l) => sum + (l.crm.estimatedDealValue ?? 0), 0),
    wonValue: leads.filter((l) => l.status === 'WON').reduce((sum, l) => sum + (l.crm.estimatedDealValue ?? 0), 0),
    byStatus,
    byBand: bands,
    byService: SERVICES.map((s) => {
      const rows = leads.filter((l) => l.crm.assignedService === s.key);
      return { service: s.key, label: s.label, count: rows.length, value: rows.reduce((sum, l) => sum + (l.crm.estimatedDealValue ?? 0), 0) };
    }),
    funnel: FUNNEL_STAGES.map((stage) => ({ stage, label: stage, count: countIn(LEAD_STATUSES.slice(0, LEAD_STATUSES.indexOf(stage) + 1)) })),
    activity,
    websiteCoverage: {
      withWebsite: leads.filter((l) => Boolean(l.place.websiteUri)).length,
      withoutWebsite: leads.filter((l) => !l.place.websiteUri).length,
      analyzed: leads.filter((l) => l.analysis?.fetched).length,
    },
    dataHealth: {
      live: leads.filter((l) => !l.isDemo).length,
      demo: leads.filter((l) => l.isDemo).length,
      stale: opts.staleIds ? leads.filter((l) => opts.staleIds!.has(l.id)).length : 0,
    },
    replyRate: contacted > 0 ? Math.round((replies / contacted) * 100) : 0,
    winRate: contacted > 0 ? Math.round((won / contacted) * 100) : 0,
  };
}

export interface CampaignStats {
  leads: number;
  contacted: number;
  replies: number;
  meetings: number;
  won: number;
  lost: number;
  pipelineValue: number;
  wonValue: number;
  avgScore: number;
  highPriority: number;
  followUpsDue: number;
  conversion: number;
  byStatus: Record<string, number>;
}

export function computeCampaignStats(leads: Lead[]): CampaignStats {
  const countIn = (statuses: LeadStatus[]) => leads.filter((l) => statuses.includes(l.status)).length;
  const contacted = countIn(STAGE_SETS.contacted);
  const won = countIn(STAGE_SETS.won);
  const scores = leads.map((l) => l.score?.score ?? 0).filter((s) => s > 0);
  const today = new Date().toISOString().slice(0, 10);

  return {
    leads: leads.length,
    contacted,
    replies: countIn(STAGE_SETS.replies),
    meetings: countIn(STAGE_SETS.meetings),
    won,
    lost: leads.filter((l) => l.status === 'LOST').length,
    pipelineValue: leads.filter((l) => !['WON', 'LOST', 'DO_NOT_CONTACT'].includes(l.status)).reduce((s, l) => s + (l.crm.estimatedDealValue ?? 0), 0),
    wonValue: leads.filter((l) => l.status === 'WON').reduce((s, l) => s + (l.crm.estimatedDealValue ?? 0), 0),
    avgScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
    highPriority: leads.filter((l) => l.score?.band === 'HIGH').length,
    followUpsDue: leads.filter((l) => l.crm.nextFollowUpAt && l.crm.nextFollowUpAt.slice(0, 10) <= today && !['WON', 'LOST', 'DO_NOT_CONTACT'].includes(l.status)).length,
    conversion: contacted > 0 ? Math.round((won / contacted) * 100) : 0,
    byStatus: groupCount(leads, (l) => l.status),
  };
}
