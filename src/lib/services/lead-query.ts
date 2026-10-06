/** Shared query-string parsing for lead lists and CSV exports. */

import { LEAD_STATUSES, type LeadStatus, type ScoreBand } from '../types';
import type { LeadFilters } from '../db';

function listParam(url: URL, key: string): string[] {
  const raw = url.searchParams.get(key);
  if (!raw) return [];
  return raw
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function boolParam(url: URL, key: string): boolean | undefined {
  const raw = url.searchParams.get(key);
  if (raw === null) return undefined;
  return raw === 'true' || raw === '1';
}

const SORT_KEYS = ['score', 'rating', 'reviews', 'name', 'createdAt', 'updatedAt', 'nextFollowUpAt', 'dealValue'] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export function parseLeadFilters(url: URL, opts: { paging?: boolean } = {}): LeadFilters {
  const statuses = listParam(url, 'status').filter((s) => (LEAD_STATUSES as string[]).includes(s)) as LeadStatus[];
  const bands = listParam(url, 'band')
    .map((b) => b.toUpperCase())
    .filter((b) => ['HIGH', 'MEDIUM', 'LOW'].includes(b)) as ScoreBand[];
  const campaignParam = url.searchParams.get('campaign');
  const sortBy = url.searchParams.get('sortBy');

  const ids = listParam(url, 'ids');

  const filters: LeadFilters = {
    ids: ids.length ? ids : undefined,
    q: url.searchParams.get('q') ?? undefined,
    statuses: statuses.length ? statuses : undefined,
    bands: bands.length ? bands : undefined,
    service: url.searchParams.get('service') ?? undefined,
    campaignId: campaignParam === null ? undefined : campaignParam === 'none' ? null : campaignParam,
    hasWebsite: boolParam(url, 'hasWebsite'),
    hasPhone: boolParam(url, 'hasPhone'),
    hasEmail: boolParam(url, 'hasEmail'),
    isDemo: boolParam(url, 'demo'),
    staleOnly: boolParam(url, 'stale'),
    sortBy: sortBy && (SORT_KEYS as readonly string[]).includes(sortBy) ? (sortBy as SortKey) : 'score',
    sortDir: url.searchParams.get('sortDir') === 'asc' ? 'asc' : 'desc',
  };

  if (opts.paging) {
    const limit = url.searchParams.get('limit');
    const offset = url.searchParams.get('offset');
    if (limit) filters.limit = Number.parseInt(limit, 10);
    if (offset) filters.offset = Number.parseInt(offset, 10);
  }

  return filters;
}
