'use client';

import Link from 'next/link';
import type { Lead, LeadStatus } from '@/lib/types';
import type { SortKey } from '@/lib/services/lead-query';
import { cn, formatNumber, prettyHostname } from '@/lib/utils';
import { Badge, BandBadge, ScoreRing, WebsiteLink } from '@/components/ui/display';
import { Icon } from '@/components/icons';
import { Dropdown, MenuItem, MenuLabel, MenuSeparator } from '@/components/ui/menu';
import { StatusSelect } from './StatusSelect';
import { EmptyState } from '@/components/ui/feedback';

export type RowAction =
  | 'open'
  | 'pitch'
  | 'analyze'
  | 'refresh'
  | 'whatsapp'
  | 'email'
  | 'contacted'
  | 'follow-up'
  | 'copy-phone'
  | 'delete';

export interface SortState {
  key: SortKey;
  dir: 'asc' | 'desc';
}

const COLUMNS: { key: SortKey | null; label: string; className?: string }[] = [
  { key: 'name', label: 'Business' },
  { key: null, label: 'Category', className: 'hidden xl:table-cell' },
  { key: null, label: 'Location', className: 'hidden lg:table-cell' },
  { key: 'rating', label: 'Rating', className: 'hidden md:table-cell' },
  { key: 'reviews', label: 'Reviews', className: 'hidden md:table-cell' },
  { key: null, label: 'Website', className: 'hidden xl:table-cell' },
  { key: null, label: 'Phone', className: 'hidden lg:table-cell' },
  { key: null, label: 'Email', className: 'hidden 2xl:table-cell' },
  { key: 'score', label: 'Opportunity Score' },
  { key: null, label: 'Status' },
  { key: null, label: 'Actions', className: 'text-right' },
];

export function LeadsTable({
  leads,
  selected,
  onToggle,
  onToggleAll,
  allSelected,
  sort,
  onSort,
  staleIds,
  suppressedIds,
  onStatusChange,
  onAction,
  busyId,
}: {
  leads: Lead[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  allSelected: boolean;
  sort: SortState;
  onSort: (key: SortKey) => void;
  staleIds: Set<string>;
  suppressedIds: Set<string>;
  onStatusChange: (lead: Lead, status: LeadStatus) => Promise<void>;
  onAction: (action: RowAction, lead: Lead) => void;
  busyId: string | null;
}) {
  if (leads.length === 0) {
    return (
      <EmptyState
        icon="leads"
        title="No leads match these filters"
        description="Adjust the filters, or run a new search to add prospects."
        action={
          <Link href="/find" className="btn-primary btn-sm">
            <Icon name="search" size={14} /> Find leads
          </Link>
        }
      />
    );
  }

  return (
    <div className="table-wrap">
      <table className="w-full border-collapse">
        <thead className="sticky top-0 z-10 border-b border-white/[0.07] bg-ink-900/95 backdrop-blur">
          <tr>
            <th className="th w-8">
              <input type="checkbox" checked={allSelected} onChange={onToggleAll} aria-label="Select all rows" className="accent-brand-500" />
            </th>
            {COLUMNS.map((col) => (
              <th key={col.label} className={cn('th', col.className)}>
                {col.key ? (
                  <button
                    type="button"
                    onClick={() => onSort(col.key!)}
                    className={cn('inline-flex items-center gap-1 transition-colors hover:text-ink-200', sort.key === col.key && 'text-brand-200')}
                  >
                    {col.label}
                    <Icon
                      name={sort.key === col.key ? (sort.dir === 'asc' ? 'chevronDown' : 'sort') : 'sort'}
                      size={11}
                      className={cn('opacity-50', sort.key === col.key && sort.dir === 'desc' && 'rotate-180')}
                    />
                  </button>
                ) : (
                  col.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => {
            const busy = busyId === lead.id;
            const stale = staleIds.has(lead.id);
            const suppressed = suppressedIds.has(lead.id) || lead.status === 'DO_NOT_CONTACT';
            const phone = lead.place.internationalPhoneNumber ?? lead.place.nationalPhoneNumber;

            return (
              <tr
                key={lead.id}
                className={cn(
                  'row-hover border-b border-white/[0.05] last:border-0',
                  selected.has(lead.id) && 'bg-brand-500/[0.07]',
                  suppressed && 'opacity-70',
                  busy && 'opacity-60',
                )}
              >
                <td className="td">
                  <input
                    type="checkbox"
                    checked={selected.has(lead.id)}
                    onChange={() => onToggle(lead.id)}
                    aria-label={`Select ${lead.place.displayName}`}
                    className="accent-brand-500"
                  />
                </td>

                <td className="td">
                  <div className="flex max-w-[260px] items-start gap-2">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-ink-800 text-ink-300">
                      <Icon name="building" size={13} />
                    </span>
                    <div className="min-w-0">
                      <Link href={`/leads/${lead.id}`} className="block truncate text-[13px] font-medium text-ink-100 hover:text-brand-200 hover:underline">
                        {lead.place.displayName}
                      </Link>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        {lead.isDemo ? (
                          <span className="rounded border border-amber-400/25 bg-amber-500/10 px-1 text-[10px] text-amber-200">demo</span>
                        ) : null}
                        {stale ? (
                          <span className="rounded border border-rose-400/25 bg-rose-500/10 px-1 text-[10px] text-rose-200" title="Google snapshot older than your freshness window">
                            stale
                          </span>
                        ) : null}
                        {suppressed ? (
                          <span className="rounded border border-rose-400/30 bg-rose-500/15 px-1 text-[10px] text-rose-100" title="On the do-not-contact list">
                            DNC
                          </span>
                        ) : null}
                        {lead.analysis?.fetched ? (
                          <span className="rounded border border-cyan-400/25 bg-cyan-500/10 px-1 text-[10px] text-cyan-100" title={`Website heuristic score ${lead.analysis.siteScore}/100`}>
                            site {lead.analysis.siteScore}
                          </span>
                        ) : null}
                        {lead.crm.nextFollowUpAt ? (
                          <span className="rounded border border-white/10 bg-white/5 px-1 text-[10px] text-ink-300" title="Next follow-up">
                            {lead.crm.nextFollowUpAt.slice(5, 10)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </td>

                <td className="td hidden xl:table-cell">
                  <span className="text-xs text-ink-300">{lead.place.primaryType ?? '—'}</span>
                </td>

                <td className="td hidden lg:table-cell">
                  <span className="block max-w-[200px] truncate text-xs text-ink-400" title={lead.place.formattedAddress ?? ''}>
                    {lead.place.formattedAddress ?? lead.query?.city ?? '—'}
                  </span>
                </td>

                <td className="td hidden md:table-cell">
                  {lead.place.rating !== null ? (
                    <span className="inline-flex items-center gap-1 text-xs tabular-nums text-ink-200">
                      <Icon name="star" size={11} className="text-amber-300" strokeWidth={1.4} />
                      {lead.place.rating.toFixed(1)}
                    </span>
                  ) : (
                    <span className="text-xs text-ink-500">—</span>
                  )}
                </td>

                <td className="td hidden md:table-cell">
                  <span className="text-xs tabular-nums text-ink-300">{formatNumber(lead.place.userRatingCount)}</span>
                </td>

                <td className="td hidden xl:table-cell">
                  <WebsiteLink url={lead.place.websiteUri} />
                </td>

                <td className="td hidden lg:table-cell">
                  {phone ? (
                    <span className="text-xs tabular-nums text-ink-300" title={phone}>
                      {phone}
                    </span>
                  ) : (
                    <span className="text-xs text-ink-500">—</span>
                  )}
                </td>

                <td className="td hidden 2xl:table-cell">
                  {lead.email ? (
                    <span className="block max-w-[160px] truncate text-xs text-ink-300" title={`${lead.email} (${lead.emailSource ?? 'source unknown'})`}>
                      {lead.email}
                    </span>
                  ) : (
                    <span className="text-xs text-ink-500">—</span>
                  )}
                </td>

                <td className="td">
                  {lead.score ? (
                    <span className="inline-flex items-center gap-2">
                      <ScoreRing score={lead.score.score} size={34} strokeWidth={3.5} />
                      <span className="hidden sm:block">
                        <BandBadge band={lead.score.band} />
                      </span>
                    </span>
                  ) : (
                    <span className="text-xs text-ink-500">—</span>
                  )}
                </td>

                <td className="td">
                  <StatusSelect value={lead.status} onChange={(next) => onStatusChange(lead, next)} disabled={busy} />
                </td>

                <td className="td text-right">
                  <div className="inline-flex items-center gap-1">
                    {phone && !suppressed ? (
                      <button
                        type="button"
                        className="btn-ghost btn-xs"
                        title={lead.outreach?.whatsappHref ? 'Open WhatsApp with the saved draft' : 'Generate a pitch first, then open WhatsApp'}
                        onClick={() => onAction('whatsapp', lead)}
                      >
                        <Icon name="whatsapp" size={13} />
                      </button>
                    ) : null}
                    {lead.email && !suppressed ? (
                      <button type="button" className="btn-ghost btn-xs" title="Open email draft" onClick={() => onAction('email', lead)}>
                        <Icon name="mail" size={13} />
                      </button>
                    ) : null}
                    <Dropdown
                      align="right"
                      buttonClassName="border-transparent bg-transparent px-1.5"
                      label={<span className="sr-only">Actions</span>}
                      icon={<Icon name="chevronDown" size={13} />}
                    >
                      {(close) => (
                        <>
                          <MenuItem icon={<Icon name="eye" size={12} />} href={`/leads/${lead.id}`} onClick={close}>
                            Open lead
                          </MenuItem>
                          <MenuSeparator />
                          <MenuLabel>Research</MenuLabel>
                          <MenuItem icon={<Icon name="sparkles" size={12} />} onClick={() => { close(); onAction('pitch', lead); }}>
                            Generate pitch
                          </MenuItem>
                          <MenuItem
                            icon={<Icon name="globe" size={12} />}
                            disabled={!lead.place.websiteUri}
                            onClick={() => { close(); onAction('analyze', lead); }}
                          >
                            Analyze website
                          </MenuItem>
                          <MenuItem icon={<Icon name="refresh" size={12} />} disabled={lead.isDemo} onClick={() => { close(); onAction('refresh', lead); }}>
                            Refresh from Google
                          </MenuItem>
                          <MenuSeparator />
                          <MenuLabel>Outreach (manual)</MenuLabel>
                          <MenuItem icon={<Icon name="whatsapp" size={12} />} disabled={!phone || suppressed} onClick={() => { close(); onAction('whatsapp', lead); }}>
                            Open WhatsApp
                          </MenuItem>
                          <MenuItem icon={<Icon name="mail" size={12} />} disabled={!lead.email || suppressed} onClick={() => { close(); onAction('email', lead); }}>
                            Open email draft
                          </MenuItem>
                          <MenuItem icon={<Icon name="check" size={12} />} disabled={suppressed} onClick={() => { close(); onAction('contacted', lead); }}>
                            Mark contacted + Day 3
                          </MenuItem>
                          <MenuItem icon={<Icon name="copy" size={12} />} disabled={!phone} onClick={() => { close(); onAction('copy-phone', lead); }}>
                            Copy phone number
                          </MenuItem>
                          <MenuSeparator />
                          <MenuItem icon={<Icon name="external" size={12} />} href={lead.place.googleMapsUri ?? '#'}>
                            Google Maps
                          </MenuItem>
                          {lead.place.websiteUri ? (
                            <MenuItem icon={<Icon name="external" size={12} />} href={lead.place.websiteUri}>
                              Visit {prettyHostname(lead.place.websiteUri)}
                            </MenuItem>
                          ) : null}
                          <MenuSeparator />
                          <MenuItem icon={<Icon name="shield" size={12} />} tone="danger" onClick={() => { close(); onAction('follow-up', lead); }}>
                            {lead.status === 'DO_NOT_CONTACT' ? 'Already do-not-contact' : 'Mark do not contact'}
                          </MenuItem>
                          <MenuItem icon={<Icon name="trash" size={12} />} tone="danger" onClick={() => { close(); onAction('delete', lead); }}>
                            Delete lead
                          </MenuItem>
                        </>
                      )}
                    </Dropdown>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function LeadsTableSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="skeleton h-10 w-full" />
      ))}
    </div>
  );
}

export function BulkBar({
  count,
  onClear,
  children,
}: {
  count: number;
  onClear: () => void;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className="sticky bottom-4 z-20 mx-auto mt-3 flex w-fit max-w-full flex-wrap items-center gap-2 rounded-xl border border-brand-400/25 bg-ink-850/95 px-3 py-2 shadow-glow backdrop-blur">
      <Badge tone="brand">{count} selected</Badge>
      {children}
      <button type="button" className="btn-ghost btn-xs" onClick={onClear}>
        <Icon name="close" size={12} /> Clear
      </button>
    </div>
  );
}
