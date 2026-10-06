'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Campaign, Lead, ServiceKey } from '@/lib/types';
import { SERVICES, SERVICE_LABELS } from '@/lib/types';
import type { CampaignStats } from '@/lib/metrics';
import { Button, Field, Select, TextArea, TextInput } from '@/components/ui/controls';
import { Badge, Card, CardBody, CardHeader, ProgressBar } from '@/components/ui/display';
import { EmptyState, useToast } from '@/components/ui/feedback';
import { Modal } from '@/components/ui/display';
import { Icon } from '@/components/icons';
import { apiFetch, describeError } from '@/lib/client/api';
import { formatMoney, relativeTime } from '@/lib/utils';
import { DEFAULT_SEQUENCE } from '@/lib/sequence';

export function CampaignsView({
  campaigns,
  stats,
  currency,
}: {
  campaigns: Campaign[];
  stats: Record<string, CampaignStats>;
  currency: string;
}) {
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [service, setService] = useState<string>('');
  const [sequence, setSequence] = useState(DEFAULT_SEQUENCE.map((s) => ({ ...s })));
  const [busy, setBusy] = useState(false);

  async function create() {
    if (name.trim().length < 2) {
      toast.push({ tone: 'error', title: 'Give the campaign a name.' });
      return;
    }
    setBusy(true);
    try {
      await apiFetch<{ campaign: Campaign }>('/api/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          service: (service || null) as ServiceKey | null,
          sequence,
          status: 'draft',
        }),
      });
      toast.push({ tone: 'success', title: 'Campaign created', description: 'Add leads from the Leads page or the campaign view.' });
      window.location.href = '/campaigns';
    } catch (err) {
      toast.push({ tone: 'error', title: 'Could not create the campaign', description: describeError(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Campaigns"
          subtitle="Group prospects and follow a manual Day 0 / 3 / 7 sequence"
          icon="campaign"
          action={
            <div className="flex items-center gap-2">
              <a href="/api/export/campaigns" className="btn-secondary btn-xs" download>
                <Icon name="download" size={12} /> Export CSV
              </a>
              <Button size="xs" variant="primary" icon="plus" onClick={() => setCreating(true)}>
                New campaign
              </Button>
            </div>
          }
        />
        <CardBody>
          <div className="flex items-start gap-3 rounded-xl border border-amber-400/20 bg-amber-500/[0.07] px-3.5 py-3 text-amber-100">
            <Icon name="shield" size={16} className="mt-0.5 shrink-0" />
            <p className="text-[13px] leading-relaxed">
              <span className="font-semibold">Manual send only.</span> Campaigns organise your work and remind you what is due — AgencyOS has no bulk
              sender, no scheduler and no WhatsApp automation. Every message is written by you and sent by you from your own accounts, to businesses
              that publish their contact details, honouring opt-outs immediately.
            </p>
          </div>
        </CardBody>
      </Card>

      {campaigns.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon="campaign"
              title="No campaigns yet"
              description="Create a campaign to group leads by offer, city or industry, then work the follow-up sequence lead by lead."
              action={
                <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
                  Create your first campaign
                </Button>
              }
            />
          </CardBody>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {campaigns.map((campaign) => {
            const s = stats[campaign.id] ?? ({} as CampaignStats);
            const progress = s.leads > 0 ? Math.round((s.contacted / s.leads) * 100) : 0;
            return (
              <Link key={campaign.id} href={`/campaigns/${campaign.id}`} className="panel group p-4 transition-all hover:border-white/20">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-ink-100 group-hover:text-brand-200">{campaign.name}</h3>
                    <p className="mt-0.5 truncate text-[11px] text-ink-400">
                      {campaign.service ? SERVICE_LABELS[campaign.service] : 'No service set'} · updated {relativeTime(campaign.updatedAt)}
                    </p>
                  </div>
                  <Badge tone={campaign.status === 'active' ? 'success' : campaign.status === 'paused' ? 'warn' : 'neutral'}>{campaign.status}</Badge>
                </div>

                {campaign.description ? <p className="mt-2 line-clamp-2 text-[12px] leading-relaxed text-ink-300">{campaign.description}</p> : null}

                <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                  {[
                    { label: 'Leads', value: s.leads ?? 0, tone: 'text-ink-100' },
                    { label: 'Contacted', value: s.contacted ?? 0, tone: 'text-brand-200' },
                    { label: 'Replies', value: s.replies ?? 0, tone: 'text-cyan-200' },
                    { label: 'Won', value: s.won ?? 0, tone: 'text-emerald-200' },
                  ].map((cell) => (
                    <div key={cell.label}>
                      <p className={`text-lg font-semibold tabular-nums ${cell.tone}`}>{cell.value}</p>
                      <p className="text-[10px] uppercase tracking-wider text-ink-500">{cell.label}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-3">
                  <ProgressBar value={progress} label="Outreach coverage" tone="brand" />
                </div>

                <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/[0.06] pt-3 text-[11px] text-ink-400">
                  <span>
                    Pipeline <span className="text-ink-100">{formatMoney(s.pipelineValue ?? 0, currency)}</span>
                  </span>
                  <span>
                    Won <span className="text-emerald-200">{formatMoney(s.wonValue ?? 0, currency)}</span>
                  </span>
                  {s.followUpsDue > 0 ? <Badge tone="warn">{s.followUpsDue} due</Badge> : null}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="New campaign"
        subtitle="Sequences are suggestions for your own manual outreach."
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button variant="primary" icon="plus" loading={busy} onClick={create}>
              Create campaign
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Campaign name" required>
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Pune dental clinics — website + chatbot" />
          </Field>
          <Field label="Description">
            <TextArea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is the offer and who is it for?" />
          </Field>
          <Field label="Default service">
            <Select value={service} onChange={(e) => setService(e.target.value)}>
              <option value="">No service</option>
              {SERVICES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>

          <div>
            <p className="label">Follow-up sequence</p>
            <div className="space-y-2">
              {sequence.map((step, index) => (
                <div key={index} className="panel-flat grid grid-cols-[64px_1fr_120px] items-center gap-2 p-2">
                  <TextInput
                    type="number"
                    min={0}
                    max={365}
                    className="input-sm"
                    value={step.day}
                    onChange={(e) => {
                      const next = [...sequence];
                      next[index] = { ...step, day: Number(e.target.value) };
                      setSequence(next);
                    }}
                    aria-label={`Day for step ${index + 1}`}
                  />
                  <TextInput
                    className="input-sm"
                    value={step.label}
                    onChange={(e) => {
                      const next = [...sequence];
                      next[index] = { ...step, label: e.target.value };
                      setSequence(next);
                    }}
                    aria-label={`Label for step ${index + 1}`}
                  />
                  <Select
                    className="input-sm"
                    value={step.channel}
                    onChange={(e) => {
                      const next = [...sequence];
                      next[index] = { ...step, channel: e.target.value as 'email' | 'whatsapp' | 'call' };
                      setSequence(next);
                    }}
                    aria-label={`Channel for step ${index + 1}`}
                  >
                    <option value="email">Email</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="call">Call</option>
                  </Select>
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <Button
                size="xs"
                variant="ghost"
                icon="plus"
                onClick={() => setSequence([...sequence, { day: (sequence[sequence.length - 1]?.day ?? 0) + 7, label: 'Follow-up', channel: 'email', note: '' }])}
              >
                Add step
              </Button>
              <Button size="xs" variant="ghost" icon="refresh" onClick={() => setSequence(DEFAULT_SEQUENCE.map((s) => ({ ...s })))}>
                Reset to Day 0 / 3 / 7
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export function CampaignLeadsPreview({ leads }: { leads: Lead[] }) {
  if (leads.length === 0) return null;
  return (
    <ul className="divide-y divide-white/[0.05]">
      {leads.slice(0, 5).map((lead) => (
        <li key={lead.id} className="flex items-center justify-between gap-2 px-4 py-2">
          <Link href={`/leads/${lead.id}`} className="truncate text-[13px] text-ink-200 hover:text-brand-200">
            {lead.place.displayName}
          </Link>
          <span className="shrink-0 text-[11px] text-ink-500">{lead.score?.score ?? '—'}</span>
        </li>
      ))}
    </ul>
  );
}
