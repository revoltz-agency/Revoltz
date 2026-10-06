'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Campaign, Lead, LeadStatus, OutreachDraft, ScoreBand, ServiceKey } from '@/lib/types';
import { LEAD_STATUSES, SERVICES, SERVICE_LABELS } from '@/lib/types';
import type { SortKey } from '@/lib/services/lead-query';
import { apiFetch, describeError } from '@/lib/client/api';
import { Button, Field, Select, TextInput } from '@/components/ui/controls';
import { Badge, Card, CardBody, Modal } from '@/components/ui/display';
import { Banner, EmptyState, useToast } from '@/components/ui/feedback';
import { Icon } from '@/components/icons';
import { cn, digitsOnly, normalisePhone } from '@/lib/utils';
import { LeadsTable, BulkBar, type RowAction, type SortState } from './LeadsTable';
import { OutreachCard } from '@/components/outreach/OutreachCard';

interface Props {
  initialLeads: Lead[];
  campaigns: Campaign[];
  staleIds: string[];
  suppressedIds: string[];
  defaultCountryCode: string;
  initialQuery?: Record<string, string>;
}

type BandFilter = ScoreBand | 'ALL';

export function LeadsExplorer({ initialLeads, campaigns, staleIds, suppressedIds, defaultCountryCode, initialQuery }: Props) {
  const toast = useToast();
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [q, setQ] = useState(initialQuery?.q ?? '');
  const [statusFilter, setStatusFilter] = useState<LeadStatus[]>(
    initialQuery?.status ? (initialQuery.status.split(',').filter((s) => (LEAD_STATUSES as string[]).includes(s)) as LeadStatus[]) : [],
  );
  const [bandFilter, setBandFilter] = useState<BandFilter>((initialQuery?.band as BandFilter) ?? 'ALL');
  const [serviceFilter, setServiceFilter] = useState<string>('');
  const [campaignFilter, setCampaignFilter] = useState<string>(initialQuery?.campaign ?? '');
  const [websiteFilter, setWebsiteFilter] = useState<string>('any');
  const [dataFilter, setDataFilter] = useState<string>('all'); // all | live | demo | stale
  const [sort, setSort] = useState<SortState>({ key: (initialQuery?.sortBy as SortKey) ?? 'score', dir: 'desc' });
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pitchLead, setPitchLead] = useState<Lead | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ ids: string[]; label: string } | null>(null);
  const [showFilters, setShowFilters] = useState(Boolean(initialQuery?.status || initialQuery?.band || initialQuery?.campaign));
  const [suppressedLocal, setSuppressedLocal] = useState<Set<string>>(new Set());

  const staleSet = useMemo(() => new Set(staleIds), [staleIds]);
  const suppressedSet = useMemo(() => new Set(suppressedIds), [suppressedIds]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let rows = leads.filter((lead) => {
      if (needle) {
        const haystack = [lead.place.displayName, lead.place.formattedAddress ?? '', lead.place.primaryType ?? '', lead.crm.notes, lead.tags.join(' ')]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      if (statusFilter.length && !statusFilter.includes(lead.status)) return false;
      if (bandFilter !== 'ALL' && lead.score?.band !== bandFilter) return false;
      if (serviceFilter && lead.crm.assignedService !== serviceFilter) return false;
      if (campaignFilter === 'none' && lead.campaignId !== null) return false;
      if (campaignFilter && campaignFilter !== 'none' && lead.campaignId !== campaignFilter) return false;
      if (websiteFilter === 'yes' && !lead.place.websiteUri) return false;
      if (websiteFilter === 'no' && lead.place.websiteUri) return false;
      if (dataFilter === 'live' && lead.isDemo) return false;
      if (dataFilter === 'demo' && !lead.isDemo) return false;
      if (dataFilter === 'stale' && !staleSet.has(lead.id)) return false;
      return true;
    });

    const dir = sort.dir === 'asc' ? 1 : -1;
    const valueOf = (l: Lead): number | string => {
      switch (sort.key) {
        case 'rating':
          return l.place.rating ?? -1;
        case 'reviews':
          return l.place.userRatingCount ?? -1;
        case 'name':
          return l.place.displayName.toLowerCase();
        case 'createdAt':
          return l.createdAt;
        case 'updatedAt':
          return l.updatedAt;
        case 'nextFollowUpAt':
          return l.crm.nextFollowUpAt ?? '9999-12-31';
        case 'dealValue':
          return l.crm.estimatedDealValue ?? -1;
        case 'score':
        default:
          return l.score?.score ?? -1;
      }
    };
    rows = [...rows].sort((a, b) => {
      const av = valueOf(a);
      const bv = valueOf(b);
      if (typeof av === 'string' || typeof bv === 'string') return String(av).localeCompare(String(bv)) * dir;
      return (av - bv) * dir;
    });
    return rows;
  }, [leads, q, statusFilter, bandFilter, serviceFilter, campaignFilter, websiteFilter, dataFilter, sort, staleSet]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const paged = filtered.slice(currentPage * pageSize, currentPage * pageSize + pageSize);
  const allSelected = paged.length > 0 && paged.every((l) => selected.has(l.id));
  const activeFilterCount =
    (q ? 1 : 0) +
    (statusFilter.length ? 1 : 0) +
    (bandFilter !== 'ALL' ? 1 : 0) +
    (serviceFilter ? 1 : 0) +
    (campaignFilter ? 1 : 0) +
    (websiteFilter !== 'any' ? 1 : 0) +
    (dataFilter !== 'all' ? 1 : 0);

  function replaceLead(updated: Lead) {
    setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
    setPitchLead((prev) => (prev && prev.id === updated.id ? updated : prev));
  }

  function toggleSort(key: SortKey) {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' }));
  }

  function clearFilters() {
    setQ('');
    setStatusFilter([]);
    setBandFilter('ALL');
    setServiceFilter('');
    setCampaignFilter('');
    setWebsiteFilter('any');
    setDataFilter('all');
    setPage(0);
  }

  async function patchLead(id: string, body: Record<string, unknown>, successMessage?: string) {
    setBusyId(id);
    try {
      const res = await apiFetch<{ lead: Lead }>(`/api/leads/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
      replaceLead(res.lead);
      if (successMessage) toast.push({ tone: 'success', title: successMessage });
      return res.lead;
    } catch (err) {
      toast.push({ tone: 'error', title: 'Update failed', description: describeError(err) });
      return null;
    } finally {
      setBusyId(null);
    }
  }

  async function handleStatusChange(lead: Lead, status: LeadStatus) {
    const body: Record<string, unknown> = { status };
    if (status === 'CONTACTED') {
      body.crm = { lastContactedAt: new Date().toISOString(), nextFollowUpAt: shiftDays(3) };
    }
    const updated = await patchLead(lead.id, body, status === 'DO_NOT_CONTACT' ? 'Marked DO NOT CONTACT and added to your suppression list.' : undefined);
    if (updated && status === 'DO_NOT_CONTACT') {
      setSuppressedLocal((prev) => new Set(prev).add(lead.id));
    }
  }

  const effectiveSuppressed = useMemo(() => new Set([...suppressedSet, ...suppressedLocal]), [suppressedSet, suppressedLocal]);

  async function generatePitch(lead: Lead): Promise<{ draft: OutreachDraft; updated: Lead } | null> {
    setBusyId(lead.id);
    try {
      const res = await apiFetch<{ outreach: OutreachDraft; lead: Lead; notice: string | null }>('/api/leads/' + lead.id + '/pitch', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      replaceLead(res.lead);
      return { draft: res.outreach, updated: res.lead };
    } catch (err) {
      toast.push({ tone: 'error', title: 'Pitch generation failed', description: describeError(err) });
      return null;
    } finally {
      setBusyId(null);
    }
  }

  async function handleAction(action: RowAction, lead: Lead) {
    switch (action) {
      case 'open':
        window.location.href = `/leads/${lead.id}`;
        return;
      case 'pitch': {
        setPitchLead(lead);
        if (!lead.outreach) {
          const result = await generatePitch(lead);
          if (result) setPitchLead(result.updated);
        }
        return;
      }
      case 'analyze': {
        setBusyId(lead.id);
        try {
          const res = await apiFetch<{ lead: Lead | null; notice: string; ok: boolean }>(`/api/leads/${lead.id}/analysis`, {
            method: 'POST',
            body: JSON.stringify({}),
          });
          if (res.lead) replaceLead(res.lead);
          toast.push({
            tone: res.ok ? 'success' : 'warn',
            title: res.ok ? 'Website analysis complete' : 'Website analysis skipped',
            description: `${res.notice}${res.lead?.score ? ` Opportunity Score is now ${res.lead.score.score}/100.` : ''}`,
          });
        } catch (err) {
          toast.push({ tone: 'error', title: 'Analysis failed', description: describeError(err) });
        } finally {
          setBusyId(null);
        }
        return;
      }
      case 'refresh': {
        setBusyId(lead.id);
        try {
          const res = await apiFetch<{ lead: Lead; notice: string }>(`/api/leads/${lead.id}/refresh`, { method: 'POST' });
          replaceLead(res.lead);
          toast.push({ tone: 'success', title: 'Snapshot refreshed', description: res.notice });
        } catch (err) {
          toast.push({ tone: 'error', title: 'Refresh failed', description: describeError(err) });
        } finally {
          setBusyId(null);
        }
        return;
      }
      case 'whatsapp': {
        const phone = normalisePhone(lead.place.internationalPhoneNumber ?? lead.place.nationalPhoneNumber, defaultCountryCode);
        if (!phone) {
          toast.push({ tone: 'warn', title: 'No phone number retrieved for this lead.' });
          return;
        }
        // Open the window synchronously so browsers do not block the popup.
        const win = window.open('', '_blank', 'noopener,noreferrer');
        const draft = lead.outreach ?? (await generatePitch(lead))?.draft ?? null;
        const text = draft?.whatsappDraft ?? `Hi ${lead.place.displayName}, I came across your business on Google.`;
        const href = `https://wa.me/${digitsOnly(phone)}?text=${encodeURIComponent(text)}`;
        if (win) win.location.href = href;
        else window.open(href, '_blank', 'noopener,noreferrer');
        toast.push({
          tone: 'info',
          title: 'WhatsApp opened — you send it',
          description: 'Review the draft in WhatsApp and press send yourself. Nothing is automated.',
        });
        return;
      }
      case 'email': {
        if (!lead.email) {
          toast.push({
            tone: 'warn',
            title: 'No email address on record',
            description: 'Add one on the lead page, or run Analyze Website to find a public mailto address.',
          });
          return;
        }
        const draft = lead.outreach ?? (await generatePitch(lead))?.draft ?? null;
        const subject = draft?.emailSubject ?? `Quick idea for ${lead.place.displayName}`;
        const body = draft?.emailBody ?? '';
        window.location.href = `mailto:${lead.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        return;
      }
      case 'contacted':
        await handleStatusChange(lead, 'CONTACTED');
        toast.push({ tone: 'success', title: 'Marked contacted', description: 'Day-3 follow-up scheduled.' });
        return;
      case 'follow-up':
        await handleStatusChange(lead, 'DO_NOT_CONTACT');
        return;
      case 'copy-phone': {
        const phone = lead.place.internationalPhoneNumber ?? lead.place.nationalPhoneNumber ?? '';
        try {
          await navigator.clipboard.writeText(phone);
          toast.push({ tone: 'success', title: 'Phone copied', description: phone });
        } catch {
          toast.push({ tone: 'error', title: 'Clipboard blocked by the browser', description: phone });
        }
        return;
      }
      case 'delete':
        setConfirmDelete({ ids: [lead.id], label: lead.place.displayName });
        return;
      default:
        return;
    }
  }

  async function bulkPatch(patch: Record<string, unknown>, message: string) {
    const ids = [...selected];
    if (ids.length === 0) return;
    try {
      await apiFetch('/api/leads/bulk', { method: 'POST', body: JSON.stringify({ ids, patch }) });
      // Re-read the touched leads so the table reflects server-side side effects.
      for (const id of ids) {
        try {
          const res = await apiFetch<{ lead: Lead }>(`/api/leads/${id}`);
          replaceLead(res.lead);
        } catch {
          /* ignore individual refresh failures */
        }
      }
      toast.push({ tone: 'success', title: message, description: `${ids.length} lead(s) updated.` });
      setSelected(new Set());
    } catch (err) {
      toast.push({ tone: 'error', title: 'Bulk update failed', description: describeError(err) });
    }
  }

  async function confirmDeleteAction() {
    if (!confirmDelete) return;
    const ids = confirmDelete.ids;
    try {
      if (ids.length === 1) {
        await apiFetch(`/api/leads/${ids[0]}`, { method: 'DELETE' });
      } else {
        await apiFetch('/api/leads/bulk', { method: 'POST', body: JSON.stringify({ ids, action: 'delete' }) });
      }
      setLeads((prev) => prev.filter((l) => !ids.includes(l.id)));
      setSelected(new Set());
      toast.push({ tone: 'success', title: ids.length === 1 ? 'Lead deleted' : `${ids.length} leads deleted` });
    } catch (err) {
      toast.push({ tone: 'error', title: 'Delete failed', description: describeError(err) });
    } finally {
      setConfirmDelete(null);
    }
  }

  function exportHref(ids?: string[]) {
    const params = new URLSearchParams();
    if (ids?.length) params.set('ids', ids.join(','));
    else {
      if (q) params.set('q', q);
      if (statusFilter.length) params.set('status', statusFilter.join(','));
      if (bandFilter !== 'ALL') params.set('band', bandFilter);
      if (serviceFilter) params.set('service', serviceFilter);
      if (campaignFilter) params.set('campaign', campaignFilter);
      if (websiteFilter !== 'any') params.set('hasWebsite', websiteFilter === 'yes' ? 'true' : 'false');
      if (dataFilter === 'demo') params.set('demo', 'true');
      if (dataFilter === 'live') params.set('demo', 'false');
      if (dataFilter === 'stale') params.set('stale', 'true');
    }
    params.set('sortBy', sort.key);
    params.set('sortDir', sort.dir);
    return `/api/export/leads?${params.toString()}`;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Icon name="search" size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <TextInput
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(0);
                }}
                placeholder="Search business, address, category or notes…"
                className="pl-9"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {(['ALL', 'HIGH', 'MEDIUM', 'LOW'] as BandFilter[]).map((band) => (
                <button
                  key={band}
                  type="button"
                  className={cn('chip', bandFilter === band && 'chip-active')}
                  onClick={() => {
                    setBandFilter(band);
                    setPage(0);
                  }}
                >
                  {band === 'ALL' ? 'All priorities' : band === 'HIGH' ? '🔥 High' : band === 'MEDIUM' ? '🟡 Medium' : '⚪ Low'}
                </button>
              ))}
            </div>

            <div className="ml-auto flex items-center gap-2">
              <Button size="xs" variant="ghost" icon="filter" onClick={() => setShowFilters((v) => !v)}>
                Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
              </Button>
              <a href={exportHref()} className="btn-secondary btn-sm" download>
                <Icon name="download" size={14} /> Export CSV
              </a>
              <Link href="/find" className="btn-primary btn-sm">
                <Icon name="search" size={14} /> Find leads
              </Link>
            </div>
          </div>

          {showFilters ? (
            <div className="grid gap-3 border-t border-white/[0.06] pt-3 sm:grid-cols-2 lg:grid-cols-5">
              <Field label="Status">
                <Select
                  value={statusFilter.length === 1 ? statusFilter[0] : ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    setStatusFilter(value ? [value as LeadStatus] : []);
                    setPage(0);
                  }}
                >
                  <option value="">Any status</option>
                  {LEAD_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s.replace(/_/g, ' ')}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Assigned service">
                <Select
                  value={serviceFilter}
                  onChange={(e) => {
                    setServiceFilter(e.target.value);
                    setPage(0);
                  }}
                >
                  <option value="">Any service</option>
                  {SERVICES.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Campaign">
                <Select
                  value={campaignFilter}
                  onChange={(e) => {
                    setCampaignFilter(e.target.value);
                    setPage(0);
                  }}
                >
                  <option value="">Any campaign</option>
                  <option value="none">No campaign</option>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Website">
                <Select
                  value={websiteFilter}
                  onChange={(e) => {
                    setWebsiteFilter(e.target.value);
                    setPage(0);
                  }}
                >
                  <option value="any">Any</option>
                  <option value="yes">Has website</option>
                  <option value="no">No website</option>
                </Select>
              </Field>
              <Field label="Data source">
                <Select
                  value={dataFilter}
                  onChange={(e) => {
                    setDataFilter(e.target.value);
                    setPage(0);
                  }}
                >
                  <option value="all">All records</option>
                  <option value="live">Live (Google Places)</option>
                  <option value="demo">Demo dataset</option>
                  <option value="stale">Stale snapshots</option>
                </Select>
              </Field>
              {activeFilterCount > 0 ? (
                <div className="sm:col-span-2 lg:col-span-5">
                  <Button size="xs" variant="ghost" icon="close" onClick={clearFilters}>
                    Clear all filters
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </CardBody>
      </Card>

      {effectiveSuppressed.size > 0 ? (
        <Banner tone="warn" icon="shield">
          {effectiveSuppressed.size} lead(s) are on your do-not-contact list — outreach actions are disabled for them.{' '}
          <Link href="/settings" className="link">
            Manage suppression list
          </Link>
        </Banner>
      ) : null}

      <Card>
        <CardBody className="space-y-3 p-0 sm:p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3">
            <p className="text-xs text-ink-400">
              Showing <span className="text-ink-100">{paged.length}</span> of <span className="text-ink-100">{filtered.length}</span> leads
              {filtered.length !== leads.length ? ` (filtered from ${leads.length})` : ''}
            </p>
            <div className="flex items-center gap-2">
              <Select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(0);
                }}
                className="input-sm w-auto"
                aria-label="Rows per page"
              >
                {[25, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n} / page
                  </option>
                ))}
              </Select>
              <div className="flex items-center gap-1">
                <Button size="xs" variant="ghost" icon="chevronLeft" disabled={currentPage === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                  <span className="sr-only">Previous page</span>
                </Button>
                <span className="px-1 text-[11px] tabular-nums text-ink-400">
                  {currentPage + 1} / {pageCount}
                </span>
                <Button
                  size="xs"
                  variant="ghost"
                  iconRight="chevronRight"
                  disabled={currentPage >= pageCount - 1}
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                >
                  <span className="sr-only">Next page</span>
                </Button>
              </div>
            </div>
          </div>

          <LeadsTable
            leads={paged}
            selected={selected}
            onToggle={(id) =>
              setSelected((prev) => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              })
            }
            onToggleAll={() =>
              setSelected((prev) => {
                const next = new Set(prev);
                if (allSelected) paged.forEach((l) => next.delete(l.id));
                else paged.forEach((l) => next.add(l.id));
                return next;
              })
            }
            allSelected={allSelected}
            sort={sort}
            onSort={toggleSort}
            staleIds={staleSet}
            suppressedIds={effectiveSuppressed}
            onStatusChange={handleStatusChange}
            onAction={handleAction}
            busyId={busyId}
          />

          <div className="px-4 pb-3">
            <BulkBar count={selected.size} onClear={() => setSelected(new Set())}>
              <Select
                className="input-sm w-auto"
                value=""
                onChange={(e) => {
                  const value = e.target.value as LeadStatus;
                  if (!value) return;
                  void bulkPatch({ status: value }, `Status set to ${value.replace(/_/g, ' ')}`);
                }}
                aria-label="Set status for selected leads"
              >
                <option value="">Set status…</option>
                {LEAD_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, ' ')}
                  </option>
                ))}
              </Select>
              <Select
                className="input-sm w-auto"
                value=""
                onChange={(e) => {
                  const value = e.target.value as ServiceKey;
                  if (!value) return;
                  void bulkPatch({ crm: { assignedService: value } }, `Service set to ${SERVICE_LABELS[value]}`);
                }}
                aria-label="Assign service to selected leads"
              >
                <option value="">Assign service…</option>
                {SERVICES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </Select>
              <Select
                className="input-sm w-auto"
                value=""
                onChange={(e) => {
                  const value = e.target.value;
                  if (!value) return;
                  void bulkPatch({ campaignId: value === 'none' ? null : value }, value === 'none' ? 'Removed from campaign' : 'Added to campaign');
                }}
                aria-label="Move selected leads to a campaign"
              >
                <option value="">Move to campaign…</option>
                <option value="none">No campaign</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              <a href={exportHref([...selected])} className="btn-secondary btn-sm" download>
                <Icon name="download" size={13} /> Export selected
              </a>
              <Button size="sm" variant="danger" icon="trash" onClick={() => setConfirmDelete({ ids: [...selected], label: `${selected.size} leads` })}>
                Delete
              </Button>
            </BulkBar>
          </div>
        </CardBody>
      </Card>

      {leads.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon="leads"
              title="No leads yet"
              description="AgencyOS starts empty. Search for businesses (or restore the demo dataset in Settings) to build your pipeline."
              action={
                <div className="flex gap-2">
                  <Link href="/find" className="btn-primary btn-sm">
                    <Icon name="search" size={14} /> Find leads
                  </Link>
                  <Link href="/settings" className="btn-secondary btn-sm">
                    Demo data
                  </Link>
                </div>
              }
            />
          </CardBody>
        </Card>
      ) : null}

      <Modal
        open={Boolean(pitchLead)}
        onClose={() => setPitchLead(null)}
        title={pitchLead ? `Outreach · ${pitchLead.place.displayName}` : 'Outreach'}
        subtitle="Drafts only — AgencyOS never sends messages. Review, then send from your own mail client or WhatsApp."
        size="lg"
        footer={
          pitchLead ? (
            <>
              <Badge tone="neutral" icon="shield">
                Manual send only
              </Badge>
              <Link href={`/leads/${pitchLead.id}`} className="btn-secondary btn-sm">
                Open full lead <Icon name="chevronRight" size={12} />
              </Link>
            </>
          ) : null
        }
      >
        {pitchLead ? (
          <OutreachCard
            lead={pitchLead}
            draft={pitchLead.outreach}
            compact
            defaultCountryCode={defaultCountryCode}
            suppressed={effectiveSuppressed.has(pitchLead.id)}
            onDraftChange={(draft) => setPitchLead((prev) => (prev ? { ...prev, outreach: draft } : prev))}
            onLeadChange={(lead) => replaceLead(lead)}
          />
        ) : null}
      </Modal>

      <Modal
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        title="Delete lead?"
        subtitle="This removes the CRM record, notes and drafts. It cannot be undone."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button variant="danger" icon="trash" onClick={confirmDeleteAction}>
              Delete {confirmDelete?.label}
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-300">
          If this business asked not to be contacted, use <span className="text-ink-100">DO NOT CONTACT</span> instead of deleting so you keep a
          suppression record.
        </p>
      </Modal>
    </div>
  );
}

function shiftDays(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
