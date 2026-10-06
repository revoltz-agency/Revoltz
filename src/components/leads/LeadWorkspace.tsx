'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Campaign, Lead } from '@/lib/types';
import { STATUS_LABELS } from '@/lib/types';
import { Badge, Card, CardBody, CardHeader, GoogleAttribution, StatusBadge, WebsiteLink } from '@/components/ui/display';
import { Button } from '@/components/ui/controls';
import { Banner, CopyButton, EmptyState, useToast } from '@/components/ui/feedback';
import { Icon } from '@/components/icons';
import { apiFetch, describeError } from '@/lib/client/api';
import { ScorePanel } from './ScorePanel';
import { WebsiteAnalysisPanel } from './WebsiteAnalysisPanel';
import { CrmPanel } from './CrmPanel';
import { FollowUpPanel } from './FollowUpPanel';
import { OutreachCard } from '@/components/outreach/OutreachCard';
import { cn, daysBetween, formatDateTime, formatNumber, relativeTime } from '@/lib/utils';

export function LeadWorkspace({
  initialLead,
  campaign,
  campaigns,
  suppressed,
  stale,
  defaultCountryCode,
  maxAgeDays,
}: {
  initialLead: Lead;
  campaign: Campaign | null;
  campaigns: Campaign[];
  suppressed: boolean;
  stale: boolean;
  defaultCountryCode: string;
  maxAgeDays: number;
}) {
  const toast = useToast();
  const [lead, setLead] = useState<Lead>(initialLead);
  const [refreshing, setRefreshing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const phone = lead.place.internationalPhoneNumber ?? lead.place.nationalPhoneNumber;
  const dataAge = daysBetween(lead.place.retrievedAt);

  async function refresh() {
    setRefreshing(true);
    try {
      const res = await apiFetch<{ lead: Lead; notice: string }>(`/api/leads/${lead.id}/refresh`, { method: 'POST' });
      setLead(res.lead);
      toast.push({ tone: 'success', title: 'Refreshed from Google Places', description: res.notice });
    } catch (err) {
      toast.push({ tone: 'error', title: 'Refresh failed', description: describeError(err) });
    } finally {
      setRefreshing(false);
    }
  }

  async function markDoNotContact() {
    try {
      const res = await apiFetch<{ lead: Lead }>(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'DO_NOT_CONTACT', note: 'Manually marked do-not-contact' }),
      });
      setLead(res.lead);
      toast.push({ tone: 'warn', title: 'Marked DO NOT CONTACT', description: 'Added to your suppression list. Outreach actions are now disabled.' });
    } catch (err) {
      toast.push({ tone: 'error', title: 'Could not update the lead', description: describeError(err) });
    }
  }

  async function remove() {
    try {
      await apiFetch(`/api/leads/${lead.id}`, { method: 'DELETE' });
      toast.push({ tone: 'success', title: 'Lead deleted' });
      window.location.href = '/leads';
    } catch (err) {
      toast.push({ tone: 'error', title: 'Delete failed', description: describeError(err) });
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardBody className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <Link href="/leads" className="btn-ghost btn-xs">
              <Icon name="chevronLeft" size={12} /> All leads
            </Link>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={lead.status} />
              {lead.isDemo ? <Badge tone="warn">Demo record</Badge> : null}
              {stale ? <Badge tone="danger">Snapshot {dataAge}d old</Badge> : null}
              {suppressed || lead.status === 'DO_NOT_CONTACT' ? <Badge tone="danger" icon="shield">Do not contact</Badge> : null}
            </div>
          </div>

          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-semibold tracking-tight text-ink-100 sm:text-2xl">{lead.place.displayName}</h2>
              <p className="mt-1 text-sm text-ink-300">
                {lead.place.primaryType ?? 'Local business'}
                {lead.place.businessStatus ? ` · ${lead.place.businessStatus.replace(/_/g, ' ').toLowerCase()}` : ''}
                {lead.place.openNow === true ? ' · open now' : lead.place.openNow === false ? ' · closed now' : ''}
              </p>
              <div className="mt-3 grid gap-2 text-xs text-ink-300 sm:grid-cols-2">
                <span className="flex items-start gap-1.5">
                  <Icon name="mapPin" size={13} className="mt-0.5 shrink-0 text-ink-400" />
                  <span className="min-w-0">{lead.place.formattedAddress ?? 'Address not returned'}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <Icon name="star" size={13} className="shrink-0 text-amber-300" strokeWidth={1.4} />
                  {lead.place.rating !== null ? `${lead.place.rating.toFixed(1)} · ${formatNumber(lead.place.userRatingCount)} reviews` : 'No rating returned'}
                </span>
                <span className="flex items-center gap-1.5">
                  <Icon name="phone" size={13} className="shrink-0 text-ink-400" />
                  {phone ?? 'No phone returned'}
                  {phone ? <CopyButton value={phone} label="" size="xs" className="ml-1 border-transparent bg-transparent px-1" /> : null}
                </span>
                <span className="flex items-center gap-1.5">
                  <Icon name="globe" size={13} className="shrink-0 text-ink-400" />
                  <WebsiteLink url={lead.place.websiteUri} />
                </span>
                <span className="flex items-center gap-1.5">
                  <Icon name="mail" size={13} className="shrink-0 text-ink-400" />
                  {lead.email ? `${lead.email} (${lead.emailSource ?? 'source unknown'})` : 'No email on record'}
                </span>
                {lead.place.googleMapsUri ? (
                  <a href={lead.place.googleMapsUri} target="_blank" rel="noopener noreferrer" className="link inline-flex items-center gap-1.5">
                    <Icon name="external" size={12} /> Open in Google Maps
                  </a>
                ) : null}
              </div>
            </div>

            <div className="flex shrink-0 flex-col items-center gap-2 rounded-xl border border-white/[0.07] bg-ink-900/60 px-4 py-3">
              <p className="text-[11px] uppercase tracking-wider text-ink-400">Opportunity</p>
              <p className="text-3xl font-semibold tabular-nums text-ink-100">{lead.score?.score ?? '—'}</p>
              {lead.score ? <Badge tone={lead.score.band === 'HIGH' ? 'danger' : lead.score.band === 'MEDIUM' ? 'warn' : 'neutral'}>{lead.score.band === 'HIGH' ? '🔥 High priority' : lead.score.band === 'MEDIUM' ? '🟡 Medium' : '⚪ Low'}</Badge> : null}
            </div>
          </div>

          {lead.score?.reason ? (
            <p className="rounded-xl border border-white/[0.07] bg-ink-900/50 px-3 py-2.5 text-[13px] leading-relaxed text-ink-200">
              <span className="mr-1.5 text-[11px] uppercase tracking-wider text-ink-500">Why:</span>
              {lead.score.reason}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-3">
            <a href="#outreach" className="btn-primary btn-sm">
              <Icon name="sparkles" size={14} /> Generate pitch
            </a>
            {lead.place.websiteUri ? (
              <a href="#analysis" className="btn-secondary btn-sm">
                <Icon name="globe" size={14} /> Analyze website
              </a>
            ) : null}
            <Button size="sm" variant="secondary" icon="refresh" loading={refreshing} onClick={refresh} disabled={lead.isDemo}>
              Refresh from Google
            </Button>
            <Button size="sm" variant="ghost" icon="shield" onClick={markDoNotContact} disabled={lead.status === 'DO_NOT_CONTACT'}>
              Do not contact
            </Button>
            <span className="ml-auto text-[11px] text-ink-500">
              Added {relativeTime(lead.createdAt)} · updated {relativeTime(lead.updatedAt)}
            </span>
          </div>
        </CardBody>
      </Card>

      {suppressed && lead.status !== 'DO_NOT_CONTACT' ? (
        <Banner tone="danger" icon="shield">
          This lead&apos;s phone/email appears on your suppression list. Outreach actions are disabled until you remove it in Settings.
        </Banner>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <ScorePanel lead={lead} onLeadChange={setLead} />
          <div id="analysis">
            <WebsiteAnalysisPanel lead={lead} onLeadChange={setLead} />
          </div>
          <div id="outreach">
            <OutreachCard lead={lead} draft={lead.outreach} onDraftChange={(draft) => setLead((prev) => ({ ...prev, outreach: draft }))} onLeadChange={setLead} suppressed={suppressed || lead.status === 'DO_NOT_CONTACT'} defaultCountryCode={defaultCountryCode} />
          </div>
        </div>

        <div className="space-y-4">
          <CrmPanel lead={lead} campaigns={campaigns} onLeadChange={setLead} />
          <FollowUpPanel lead={lead} campaign={campaign} onLeadChange={setLead} />

          <Card>
            <CardHeader title="Place data & compliance" subtitle="What was retrieved, when, and from where" icon="google" />
            <CardBody className="space-y-3">
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
                <div className="col-span-2">
                  <dt className="text-ink-500">Place ID</dt>
                  <dd className="flex items-center gap-2 font-mono text-[11px] text-ink-200">
                    <span className="truncate">{lead.place.placeId}</span>
                    <CopyButton value={lead.place.placeId} label="" size="xs" className="border-transparent bg-transparent px-1" />
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-500">Source</dt>
                  <dd className="text-ink-200">{lead.isDemo ? 'Demo dataset (fictional)' : 'Google Places API (New)'}</dd>
                </div>
                <div>
                  <dt className="text-ink-500">Retrieved</dt>
                  <dd className="text-ink-200">{formatDateTime(lead.place.retrievedAt)}</dd>
                </div>
                <div>
                  <dt className="text-ink-500">Age</dt>
                  <dd className={cn('tabular-nums', stale ? 'text-rose-200' : 'text-ink-200')}>
                    {dataAge} day(s){stale ? ` · stale (>${maxAgeDays}d)` : ''}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-500">Last query</dt>
                  <dd className="text-ink-200">{lead.query ? `${lead.query.industry} · ${lead.query.city} (${lead.query.mode})` : '—'}</dd>
                </div>
              </dl>

              {lead.place.types.length > 0 ? (
                <div>
                  <p className="label">Google place types</p>
                  <div className="flex flex-wrap gap-1.5">
                    {lead.place.types.map((type) => (
                      <span key={type} className="badge-neutral">
                        {type.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {stale ? (
                <Banner tone="warn" title="Snapshot is stale">
                  Google&apos;s Places policies allow indefinite storage of <code className="font-mono">place_id</code> only. Refresh the snapshot before
                  contacting this business, or purge cached fields in Settings → Data policy.
                </Banner>
              ) : null}

              <GoogleAttribution />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Activity" subtitle="Status history for this lead" icon="clock" />
            <CardBody>
              {lead.statusHistory.length === 0 ? (
                <EmptyState icon="clock" title="No activity yet" className="py-6" />
              ) : (
                <ol className="space-y-2">
                  {[...lead.statusHistory].reverse().map((event, index) => (
                    <li key={`${event.at}-${index}`} className="flex items-start gap-2.5">
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-400" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] text-ink-100">{STATUS_LABELS[event.status]}</span>
                        <span className="block text-[11px] text-ink-400">
                          {formatDateTime(event.at)}
                          {event.note ? ` · ${event.note}` : ''}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Danger zone" subtitle="Delete this CRM record" icon="alert" />
            <CardBody>
              {confirmDelete ? (
                <div className="space-y-2">
                  <p className="text-xs leading-relaxed text-ink-300">
                    Delete <span className="font-medium text-ink-100">{lead.place.displayName}</span>? Notes, drafts and history are removed. If they
                    asked not to be contacted, use <span className="text-ink-100">Do not contact</span> instead.
                  </p>
                  <div className="flex gap-2">
                    <Button size="xs" variant="danger" icon="trash" onClick={remove}>
                      Yes, delete
                    </Button>
                    <Button size="xs" variant="ghost" onClick={() => setConfirmDelete(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button size="xs" variant="danger" icon="trash" onClick={() => setConfirmDelete(true)}>
                  Delete lead
                </Button>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
