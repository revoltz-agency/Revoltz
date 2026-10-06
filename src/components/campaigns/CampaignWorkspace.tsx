'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Campaign, Lead, ServiceKey } from '@/lib/types';
import { SERVICES, SERVICE_LABELS, STATUS_LABELS } from '@/lib/types';
import type { CampaignStats } from '@/lib/metrics';
import { Button, Field, Select, TextArea, TextInput } from '@/components/ui/controls';
import { Badge, Card, CardBody, CardHeader, Modal, ProgressBar, ScoreRing, StatusBadge } from '@/components/ui/display';
import { Banner, EmptyState, useToast } from '@/components/ui/feedback';
import { Icon } from '@/components/icons';
import { apiFetch, describeError } from '@/lib/client/api';
import { StatusSelect } from '@/components/leads/StatusSelect';
import { formatDate, formatMoney, relativeTime } from '@/lib/utils';
import { DEFAULT_SEQUENCE } from '@/lib/sequence';

export function CampaignWorkspace({
  campaign,
  campaignLeads,
  stats,
  allLeads,
  currency,
  defaultCountryCode,
}: {
  campaign: Campaign;
  campaignLeads: Lead[];
  stats: CampaignStats;
  allLeads: Lead[];
  currency: string;
  defaultCountryCode: string;
}) {
  const toast = useToast();
  const [data, setData] = useState<Campaign>(campaign);
  const [leads, setLeads] = useState<Lead[]>(campaignLeads);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draftName, setDraftName] = useState(campaign.name);
  const [draftDescription, setDraftDescription] = useState(campaign.description);
  const [draftService, setDraftService] = useState<string>(campaign.service ?? '');
  const [draftSequence, setDraftSequence] = useState(campaign.sequence.map((s) => ({ ...s })));
  const [selectedToAdd, setSelectedToAdd] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');

  const available = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return allLeads.filter((lead) => {
      if (lead.campaignId === data.id) return false;
      if (!needle) return true;
      return [lead.place.displayName, lead.place.primaryType ?? '', lead.query?.city ?? ''].join(' ').toLowerCase().includes(needle);
    });
  }, [allLeads, data.id, query]);

  async function patchCampaign(patch: Record<string, unknown>, message: string) {
    setBusy(true);
    try {
      const res = await apiFetch<{ campaign: Campaign }>(`/api/campaigns/${data.id}`, { method: 'PATCH', body: JSON.stringify(patch) });
      setData(res.campaign);
      toast.push({ tone: 'success', title: message });
    } catch (err) {
      toast.push({ tone: 'error', title: 'Could not update the campaign', description: describeError(err) });
    } finally {
      setBusy(false);
    }
  }

  async function saveEdits() {
    await patchCampaign(
      {
        name: draftName.trim(),
        description: draftDescription.trim(),
        service: (draftService || null) as ServiceKey | null,
        sequence: draftSequence,
      },
      'Campaign updated',
    );
    setEditing(false);
  }

  async function addLeads() {
    const ids = [...selectedToAdd];
    if (ids.length === 0) return;
    try {
      const res = await apiFetch<{ leads: Lead[]; notice: string }>(`/api/campaigns/${data.id}/leads`, {
        method: 'POST',
        body: JSON.stringify({ leadIds: ids }),
      });
      setLeads(res.leads);
      setSelectedToAdd(new Set());
      setAdding(false);
      toast.push({ tone: 'success', title: 'Leads added', description: res.notice });
      window.setTimeout(() => window.location.reload(), 600);
    } catch (err) {
      toast.push({ tone: 'error', title: 'Could not add leads', description: describeError(err) });
    }
  }

  async function removeLead(leadId: string) {
    try {
      const res = await apiFetch<{ leads: Lead[] }>(`/api/campaigns/${data.id}/leads?detach=1`, {
        method: 'POST',
        body: JSON.stringify({ leadIds: [leadId] }),
      });
      setLeads(res.leads);
      toast.push({ tone: 'info', title: 'Lead removed from this campaign' });
    } catch (err) {
      toast.push({ tone: 'error', title: 'Could not remove the lead', description: describeError(err) });
    }
  }

  async function patchLead(lead: Lead, patch: Record<string, unknown>) {
    try {
      const res = await apiFetch<{ lead: Lead }>(`/api/leads/${lead.id}`, { method: 'PATCH', body: JSON.stringify(patch) });
      setLeads((prev) => prev.map((l) => (l.id === lead.id ? res.lead : l)));
      return res.lead;
    } catch (err) {
      toast.push({ tone: 'error', title: 'Update failed', description: describeError(err) });
      return null;
    }
  }

  async function removeCampaign() {
    if (!window.confirm(`Delete campaign "${data.name}"? Its leads are kept and unassigned.`)) return;
    try {
      await apiFetch(`/api/campaigns/${data.id}`, { method: 'DELETE' });
      toast.push({ tone: 'success', title: 'Campaign deleted' });
      window.location.href = '/campaigns';
    } catch (err) {
      toast.push({ tone: 'error', title: 'Delete failed', description: describeError(err) });
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <Link href="/campaigns" className="btn-ghost btn-xs mb-2">
                <Icon name="chevronLeft" size={12} /> All campaigns
              </Link>
              <h2 className="text-xl font-semibold tracking-tight text-ink-100">{data.name}</h2>
              <p className="mt-1 text-[13px] text-ink-300">
                {data.description || 'No description'} · {data.service ? SERVICE_LABELS[data.service] : 'No service set'} · created{' '}
                {relativeTime(data.createdAt)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={data.status}
                onChange={(e) => patchCampaign({ status: e.target.value }, `Campaign ${e.target.value}`)}
                className="input-sm w-auto"
                aria-label="Campaign status"
              >
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="completed">Completed</option>
              </Select>
              <Button size="xs" variant="secondary" icon="settings" onClick={() => setEditing(true)}>
                Edit
              </Button>
              <Button size="xs" variant="primary" icon="plus" onClick={() => setAdding(true)}>
                Add leads
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {[
              { label: 'Leads', value: String(stats.leads), tone: 'text-ink-100' },
              { label: 'High priority', value: String(stats.highPriority), tone: 'text-rose-200' },
              { label: 'Contacted', value: String(stats.contacted), tone: 'text-brand-200' },
              { label: 'Replies', value: String(stats.replies), tone: 'text-cyan-200' },
              { label: 'Meetings', value: String(stats.meetings), tone: 'text-violet-200' },
              { label: 'Won', value: String(stats.won), tone: 'text-emerald-200' },
            ].map((cell) => (
              <div key={cell.label} className="panel-flat p-3">
                <p className="text-[11px] uppercase tracking-wider text-ink-400">{cell.label}</p>
                <p className={`mt-1 text-xl font-semibold tabular-nums ${cell.tone}`}>{cell.value}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="md:col-span-2">
              <ProgressBar value={stats.leads > 0 ? (stats.contacted / stats.leads) * 100 : 0} label="Outreach coverage" tone="brand" />
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-ink-500">Pipeline</p>
                <p className="font-medium text-ink-100">{formatMoney(stats.pipelineValue, currency)}</p>
              </div>
              <div>
                <p className="text-ink-500">Won value</p>
                <p className="font-medium text-emerald-200">{formatMoney(stats.wonValue, currency)}</p>
              </div>
            </div>
          </div>

          <Banner tone="warn" icon="shield">
            Manual send only — AgencyOS will never message these leads for you. Work the list one lead at a time: open the draft, review it, send it
            yourself, then log it here.
          </Banner>
        </CardBody>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Leads in this campaign"
            subtitle={`${leads.length} lead(s) · ${stats.followUpsDue} follow-up(s) due`}
            icon="leads"
            action={
              leads.length > 0 ? (
                <a href={`/api/export/leads?campaign=${data.id}`} className="btn-secondary btn-xs" download>
                  <Icon name="download" size={12} /> Export
                </a>
              ) : null
            }
          />
          <CardBody className="p-0">
            {leads.length === 0 ? (
              <EmptyState
                icon="leads"
                title="No leads in this campaign yet"
                description="Add leads you have already saved, or search for new prospects first."
                action={
                  <div className="flex gap-2">
                    <Button variant="primary" icon="plus" onClick={() => setAdding(true)}>
                      Add leads
                    </Button>
                    <Link href="/find" className="btn-secondary btn-sm">
                      Find new leads
                    </Link>
                  </div>
                }
              />
            ) : (
              <div className="table-wrap rounded-none border-0">
                <table className="w-full border-collapse">
                  <thead className="border-b border-white/[0.07] bg-ink-900/60">
                    <tr>
                      <th className="th">Business</th>
                      <th className="th hidden md:table-cell">Score</th>
                      <th className="th">Status</th>
                      <th className="th hidden lg:table-cell">Next follow-up</th>
                      <th className="th hidden lg:table-cell">Deal value</th>
                      <th className="th text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map((lead) => {
                      const due = lead.crm.nextFollowUpAt && lead.crm.nextFollowUpAt.slice(0, 10) <= today;
                      return (
                        <tr key={lead.id} className="row-hover border-b border-white/[0.05] last:border-0">
                          <td className="td">
                            <Link href={`/leads/${lead.id}`} className="block max-w-[220px] truncate text-[13px] font-medium text-ink-100 hover:text-brand-200 hover:underline">
                              {lead.place.displayName}
                            </Link>
                            <span className="block max-w-[220px] truncate text-[11px] text-ink-400">
                              {lead.place.primaryType ?? '—'} · {lead.query?.city ?? '—'}
                            </span>
                          </td>
                          <td className="td hidden md:table-cell">
                            <span className="inline-flex items-center gap-2">
                              <ScoreRing score={lead.score?.score ?? 0} size={30} strokeWidth={3.5} />
                              {lead.score ? <span className="text-[11px] text-ink-400">{lead.score.band}</span> : null}
                            </span>
                          </td>
                          <td className="td">
                            <StatusSelect
                              value={lead.status}
                              onChange={async (status) => {
                                await patchLead(lead, { status });
                              }}
                              size="xs"
                            />
                          </td>
                          <td className="td hidden lg:table-cell">
                            {lead.crm.nextFollowUpAt ? (
                              <span className={due ? 'text-xs text-amber-200' : 'text-xs text-ink-300'}>{formatDate(lead.crm.nextFollowUpAt)}</span>
                            ) : (
                              <span className="text-xs text-ink-500">not scheduled</span>
                            )}
                          </td>
                          <td className="td hidden lg:table-cell text-xs tabular-nums text-ink-300">
                            {lead.crm.estimatedDealValue ? formatMoney(lead.crm.estimatedDealValue, lead.crm.currency || currency) : '—'}
                          </td>
                          <td className="td text-right">
                            <div className="inline-flex items-center gap-1">
                              <Link href={`/leads/${lead.id}`} className="btn-ghost btn-xs" title="Open lead">
                                <Icon name="eye" size={12} />
                              </Link>
                              <Button size="xs" variant="ghost" icon="check" title="Mark contacted + schedule Day 3" onClick={() => patchLead(lead, { status: 'CONTACTED', crm: { lastContactedAt: new Date().toISOString(), nextFollowUpAt: shiftDays(3) } })}>
                                <span className="sr-only">Mark contacted</span>
                              </Button>
                              <Button size="xs" variant="ghost" icon="close" title="Remove from campaign" onClick={() => removeLead(lead.id)}>
                                <span className="sr-only">Remove</span>
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Sequence" subtitle="Suggested manual touchpoints" icon="clock" />
            <CardBody>
              <ol className="space-y-2">
                {data.sequence.map((step) => (
                  <li key={`${step.day}-${step.label}`} className="panel-flat p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-[13px] font-medium text-ink-100">
                        <Icon name={step.channel === 'email' ? 'mail' : step.channel === 'whatsapp' ? 'whatsapp' : 'phone'} size={13} className="text-ink-300" />
                        Day {step.day} · {step.label}
                      </span>
                      <Badge tone="neutral">{step.channel}</Badge>
                    </div>
                    {step.note ? <p className="mt-1 text-[11px] leading-relaxed text-ink-400">{step.note}</p> : null}
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-[11px] leading-relaxed text-ink-500">
                Each lead gets these dates relative to its own last contact (or its next follow-up date). Nothing is sent automatically.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Status breakdown" icon="chart" />
            <CardBody className="space-y-2">
              {Object.keys(stats.byStatus ?? {}).length === 0 ? (
                <p className="py-4 text-center text-xs text-ink-400">No leads yet.</p>
              ) : (
                Object.entries(stats.byStatus)
                  .sort((a, b) => b[1] - a[1])
                  .map(([status, count]) => (
                    <div key={status} className="flex items-center justify-between gap-2 text-xs">
                      <StatusBadge status={status as Lead['status']} />
                      <span className="tabular-nums text-ink-200">{count}</span>
                    </div>
                  ))
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Campaign actions" icon="settings" />
            <CardBody className="space-y-2">
              <Button size="xs" variant="secondary" icon="settings" block onClick={() => setEditing(true)}>
                Edit name, service & sequence
              </Button>
              <Button size="xs" variant="danger" icon="trash" block onClick={removeCampaign}>
                Delete campaign
              </Button>
              <p className="text-[11px] leading-relaxed text-ink-500">
                Deleting a campaign never deletes its leads — they are simply unassigned.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Edit modal */}
      <Modal
        open={editing}
        onClose={() => setEditing(false)}
        title="Edit campaign"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button variant="primary" icon="check" loading={busy} onClick={saveEdits}>
              Save changes
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Name">
            <TextInput value={draftName} onChange={(e) => setDraftName(e.target.value)} />
          </Field>
          <Field label="Description">
            <TextArea rows={2} value={draftDescription} onChange={(e) => setDraftDescription(e.target.value)} />
          </Field>
          <Field label="Default service">
            <Select value={draftService} onChange={(e) => setDraftService(e.target.value)}>
              <option value="">No service</option>
              {SERVICES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <div>
            <p className="label">Sequence</p>
            <div className="space-y-2">
              {draftSequence.map((step, index) => (
                <div key={index} className="panel-flat grid grid-cols-[64px_1fr_120px] items-center gap-2 p-2">
                  <TextInput
                    type="number"
                    min={0}
                    className="input-sm"
                    value={step.day}
                    onChange={(e) => {
                      const next = [...draftSequence];
                      next[index] = { ...step, day: Number(e.target.value) };
                      setDraftSequence(next);
                    }}
                    aria-label="Day"
                  />
                  <TextInput
                    className="input-sm"
                    value={step.label}
                    onChange={(e) => {
                      const next = [...draftSequence];
                      next[index] = { ...step, label: e.target.value };
                      setDraftSequence(next);
                    }}
                    aria-label="Label"
                  />
                  <Select
                    className="input-sm"
                    value={step.channel}
                    onChange={(e) => {
                      const next = [...draftSequence];
                      next[index] = { ...step, channel: e.target.value as 'email' | 'whatsapp' | 'call' };
                      setDraftSequence(next);
                    }}
                    aria-label="Channel"
                  >
                    <option value="email">Email</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="call">Call</option>
                  </Select>
                </div>
              ))}
            </div>
            <Button size="xs" variant="ghost" icon="refresh" className="mt-2" onClick={() => setDraftSequence(DEFAULT_SEQUENCE.map((s) => ({ ...s })))}>
              Reset to Day 0 / 3 / 7
            </Button>
          </div>
        </div>
      </Modal>

      {/* Add leads modal */}
      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Add leads to this campaign"
        subtitle="Only leads already saved in your CRM are listed."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button variant="primary" icon="plus" disabled={selectedToAdd.size === 0} onClick={addLeads}>
              Add {selectedToAdd.size || ''} lead{selectedToAdd.size === 1 ? '' : 's'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <TextInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter by business, category or city…" />
          {available.length === 0 ? (
            <EmptyState icon="leads" title="No unassigned leads match" description="Save more leads from the Find Leads page first." className="py-8" />
          ) : (
            <ul className="max-h-[45vh] divide-y divide-white/[0.05] overflow-y-auto rounded-xl border border-white/[0.07]">
              {available.slice(0, 60).map((lead) => (
                <li key={lead.id} className="flex items-center gap-3 px-3 py-2">
                  <input
                    type="checkbox"
                    className="accent-brand-500"
                    checked={selectedToAdd.has(lead.id)}
                    onChange={() =>
                      setSelectedToAdd((prev) => {
                        const next = new Set(prev);
                        if (next.has(lead.id)) next.delete(lead.id);
                        else next.add(lead.id);
                        return next;
                      })
                    }
                    aria-label={`Add ${lead.place.displayName}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-ink-100">{lead.place.displayName}</span>
                    <span className="block truncate text-[11px] text-ink-400">
                      {lead.place.primaryType ?? '—'} · {lead.query?.city ?? '—'} · {STATUS_LABELS[lead.status]}
                    </span>
                  </span>
                  <ScoreRing score={lead.score?.score ?? 0} size={30} strokeWidth={3.5} />
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-ink-500">
            Showing up to 60 of {available.length} unassigned leads. Use the Leads page bulk actions to assign many at once.
          </p>
        </div>
      </Modal>
    </div>
  );
}

function shiftDays(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
