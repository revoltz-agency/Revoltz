'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { ServerStatus } from '@/lib/server-status';
import type { ServiceKey, Settings, SuppressionEntry } from '@/lib/types';
import { SERVICES } from '@/lib/types';
import { Button, Field, Select, TextArea, TextInput, Toggle } from '@/components/ui/controls';
import { Badge, Card, CardBody, CardHeader } from '@/components/ui/display';
import { Banner, useToast } from '@/components/ui/feedback';
import { Icon, type IconName } from '@/components/icons';
import { apiFetch, describeError } from '@/lib/client/api';
import { cn, formatDate } from '@/lib/utils';

type Tab = 'integrations' | 'agency' | 'pitch' | 'data' | 'suppression';

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'integrations', label: 'Integrations', icon: 'zap' },
  { id: 'agency', label: 'Agency profile', icon: 'building' },
  { id: 'pitch', label: 'Pitch defaults', icon: 'sparkles' },
  { id: 'data', label: 'Data & privacy', icon: 'shield' },
  { id: 'suppression', label: 'Do not contact', icon: 'close' },
];

export function SettingsView({
  settings,
  status,
  suppression,
  counts,
}: {
  settings: Settings;
  status: ServerStatus;
  suppression: SuppressionEntry[];
  counts: { leads: number; campaigns: number; stale: number; demo: number; live: number };
}) {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('integrations');
  const [form, setForm] = useState<Settings>(settings);
  const [saving, setSaving] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [newEntry, setNewEntry] = useState({ kind: 'phone' as SuppressionEntry['kind'], value: '', reason: '' });

  const dirty = JSON.stringify(form) !== JSON.stringify(settings);

  async function save() {
    setSaving(true);
    try {
      const res = await apiFetch<{ settings: Settings }>('/api/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          agency: form.agency,
          pitch: form.pitch,
          dataPolicy: form.dataPolicy,
          demoMode: form.demoMode,
        }),
      });
      setForm(res.settings);
      toast.push({ tone: 'success', title: 'Settings saved' });
      window.setTimeout(() => window.location.reload(), 500);
    } catch (err) {
      toast.push({ tone: 'error', title: 'Could not save settings', description: describeError(err) });
    } finally {
      setSaving(false);
    }
  }

  async function runAction(name: string, run: () => Promise<string>) {
    setBusyAction(name);
    try {
      const message = await run();
      toast.push({ tone: 'success', title: message });
      window.setTimeout(() => window.location.reload(), 700);
    } catch (err) {
      toast.push({ tone: 'error', title: 'Action failed', description: describeError(err) });
    } finally {
      setBusyAction(null);
    }
  }

  async function addSuppression() {
    if (newEntry.value.trim().length < 2) {
      toast.push({ tone: 'error', title: 'Enter a value to suppress.' });
      return;
    }
    try {
      await apiFetch('/api/suppression', {
        method: 'POST',
        body: JSON.stringify({ kind: newEntry.kind, value: newEntry.value.trim(), reason: newEntry.reason.trim() }),
      });
      setNewEntry({ kind: newEntry.kind, value: '', reason: '' });
      toast.push({ tone: 'success', title: 'Added to the do-not-contact list' });
      window.setTimeout(() => window.location.reload(), 500);
    } catch (err) {
      toast.push({ tone: 'error', title: 'Could not add the entry', description: describeError(err) });
    }
  }

  async function removeSuppression(id: string) {
    try {
      await apiFetch(`/api/suppression/${id}`, { method: 'DELETE' });
      toast.push({ tone: 'info', title: 'Entry removed' });
      window.setTimeout(() => window.location.reload(), 400);
    } catch (err) {
      toast.push({ tone: 'error', title: 'Could not remove the entry', description: describeError(err) });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)} className={cn('chip', tab === t.id && 'chip-active')}>
            <Icon name={t.icon} size={12} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'integrations' ? (
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Google Places API (New)"
              subtitle="Keys live on the server in environment variables — they are never sent to the browser"
              icon="google"
              action={<Badge tone={status.googleConfigured ? 'success' : 'warn'}>{status.googleConfigured ? 'Configured' : 'Not configured'}</Badge>}
            />
            <CardBody className="space-y-4">
              {!status.googleConfigured ? (
                <Banner tone="warn" title="Google Places API not configured — Demo Mode active.">
                  Searches return the fictional demo dataset. Follow the steps below, then restart the dev server.
                </Banner>
              ) : (
                <Banner tone="success" title="Live mode">
                  Text Search (New) and Place Details (New) are enabled with a server-side key. Region {status.regionCode} · language{' '}
                  {status.languageCode} · snapshots flagged stale after {status.googleDataMaxAgeDays} days.
                </Banner>
              )}

              <ol className="space-y-2 text-[13px] text-ink-300">
                {[
                  'Open the Google Cloud Console and create (or select) a project.',
                  'Enable "Places API (New)" for that project (APIs & Services → Library).',
                  'Create an API key (Credentials → Create credentials → API key).',
                  'Restrict the key to the Places API (New) and, if possible, to your server IPs.',
                  'Copy it into .env.local as GOOGLE_PLACES_API_KEY, then restart the server.',
                ].map((step, i) => (
                  <li key={step} className="flex gap-2.5">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/10 bg-ink-800 text-[11px] text-ink-300">
                      {i + 1}
                    </span>
                    <span className="leading-relaxed">{step}</span>
                  </li>
                ))}
              </ol>

              <div className="flex flex-wrap gap-2">
                <a
                  href="https://console.cloud.google.com/apis/library/places-backend.googleapis.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary btn-xs"
                >
                  <Icon name="external" size={12} /> Enable Places API (New)
                </a>
                <a href="https://developers.google.com/maps/documentation/places/web-service/text-search" target="_blank" rel="noopener noreferrer" className="btn-secondary btn-xs">
                  <Icon name="external" size={12} /> Text Search (New) docs
                </a>
                <a href="https://developers.google.com/maps/documentation/places/web-service/policies" target="_blank" rel="noopener noreferrer" className="btn-secondary btn-xs">
                  <Icon name="external" size={12} /> Places caching policies
                </a>
              </div>

              <div className="panel-flat p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Field mask used by AgencyOS</p>
                <code className="mt-1.5 block break-all font-mono text-[11px] leading-relaxed text-ink-300">
                  {status.googleFieldMasks.search.split(',').join(', ')}
                </code>
                <p className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-ink-400">Field mask for refresh (Place Details)</p>
                <code className="mt-1.5 block break-all font-mono text-[11px] leading-relaxed text-ink-300">
                  {status.googleFieldMasks.details.split(',').join(', ')}
                </code>
                <p className="mt-2 text-[11px] leading-relaxed text-ink-500">
                  No wildcard (<code className="font-mono">*</code>) masks are used, so you only pay for the fields the app displays.
                </p>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="AI provider"
              subtitle="Used for pitch copy, score reasoning and the website opportunity summary"
              icon="sparkles"
              action={<Badge tone={status.aiConfigured ? 'success' : 'neutral'}>{status.aiConfigured ? status.aiProvider : 'Templates only'}</Badge>}
            />
            <CardBody className="space-y-3">
              {status.aiConfigured ? (
                <Banner tone="success" title={`Connected · ${status.aiProvider} · ${status.aiModel ?? 'model'}`}>
                  Prompts are restricted to verified lead facts; outputs are validated and labelled as AI-generated.
                </Banner>
              ) : (
                <Banner tone="info" title="No AI key configured">
                  AgencyOS still generates outreach — from deterministic templates built out of the same verified facts. Nothing pretends to be
                  AI-written. Set <code className="font-mono">OPENAI_API_KEY</code> (or <code className="font-mono">GEMINI_API_KEY</code>) to enable model
                  drafting.
                </Banner>
              )}
              <ul className="grid gap-1.5 text-[12px] text-ink-300 sm:grid-cols-2">
                <li>
                  <code className="font-mono text-ink-400">OPENAI_API_KEY</code> + <code className="font-mono text-ink-400">OPENAI_MODEL</code> — any
                  OpenAI-compatible endpoint via <code className="font-mono text-ink-400">OPENAI_BASE_URL</code>.
                </li>
                <li>
                  <code className="font-mono text-ink-400">GEMINI_API_KEY</code> + <code className="font-mono text-ink-400">GEMINI_MODEL</code> — Google
                  Gemini.
                </li>
              </ul>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Server & storage" subtitle="Where your workflow data lives" icon="settings" />
            <CardBody>
              <ul className="grid gap-2 text-[13px] text-ink-300 sm:grid-cols-2">
                <li className="panel-flat flex items-center justify-between gap-2 p-3">
                  <span>Storage driver</span>
                  <Badge tone={status.storagePersistent ? 'success' : 'warn'}>{status.storageDriver}</Badge>
                </li>
                <li className="panel-flat flex items-center justify-between gap-2 p-3">
                  <span>Website analysis</span>
                  <Badge tone={status.websiteAnalysisEnabled ? 'success' : 'neutral'}>{status.websiteAnalysisEnabled ? 'enabled' : 'disabled'}</Badge>
                </li>
                <li className="panel-flat flex items-center justify-between gap-2 p-3">
                  <span>Leads stored</span>
                  <span className="tabular-nums text-ink-100">{counts.leads}</span>
                </li>
                <li className="panel-flat flex items-center justify-between gap-2 p-3">
                  <span>Campaigns</span>
                  <span className="tabular-nums text-ink-100">{counts.campaigns}</span>
                </li>
              </ul>
              {!status.storagePersistent ? (
                <Banner tone="warn" title="Running in memory" className="mt-3">
                  The data file is not writable here, so changes are lost on restart. Mount a writable volume or switch the storage driver to a database
                  for production.
                </Banner>
              ) : (
                <p className="mt-3 text-[11px] leading-relaxed text-ink-500">
                  V1 persists to a single JSON file (<code className="font-mono">data/agencyos.json</code>, git-ignored). Every read/write goes through{' '}
                  <code className="font-mono">src/lib/db/store.ts</code>, so swapping in Postgres/Prisma is a single-module change.
                </p>
              )}
            </CardBody>
          </Card>
        </div>
      ) : null}

      {tab === 'agency' ? (
        <Card>
          <CardHeader title="Agency profile" subtitle="Used inside generated outreach and the WhatsApp/mail links" icon="building" />
          <CardBody className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Agency name">
                <TextInput value={form.agency.name} onChange={(e) => setForm({ ...form, agency: { ...form.agency, name: e.target.value } })} />
              </Field>
              <Field label="Sender name">
                <TextInput value={form.agency.senderName} onChange={(e) => setForm({ ...form, agency: { ...form.agency, senderName: e.target.value } })} />
              </Field>
              <Field label="Sender email" hint="Shown in drafts; never used to send anything automatically">
                <TextInput value={form.agency.senderEmail} onChange={(e) => setForm({ ...form, agency: { ...form.agency, senderEmail: e.target.value } })} />
              </Field>
              <Field label="Your WhatsApp number" hint="Digits with country code, e.g. 919812345678">
                <TextInput value={form.agency.whatsappNumber} onChange={(e) => setForm({ ...form, agency: { ...form.agency, whatsappNumber: e.target.value } })} />
              </Field>
              <Field label="Website">
                <TextInput value={form.agency.website} onChange={(e) => setForm({ ...form, agency: { ...form.agency, website: e.target.value } })} placeholder="https://youragency.com" />
              </Field>
              <Field label="Default city">
                <TextInput value={form.agency.city} onChange={(e) => setForm({ ...form, agency: { ...form.agency, city: e.target.value } })} />
              </Field>
              <Field label="Default country code" hint="Applied when Google returns only a national number">
                <TextInput value={form.agency.defaultCountryCode} onChange={(e) => setForm({ ...form, agency: { ...form.agency, defaultCountryCode: e.target.value } })} />
              </Field>
              <Field label="Currency">
                <Select value={form.agency.currency} onChange={(e) => setForm({ ...form, agency: { ...form.agency, currency: e.target.value } })}>
                  {['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'AUD'].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <SaveBar dirty={dirty} saving={saving} onSave={save} onReset={() => setForm(settings)} />
          </CardBody>
        </Card>
      ) : null}

      {tab === 'pitch' ? (
        <Card>
          <CardHeader title="Pitch defaults" subtitle="Tone and the lines woven into every generated message" icon="sparkles" />
          <CardBody className="space-y-4">
            <Field label="Default tone">
              <Select
                value={form.pitch.tone}
                onChange={(e) => setForm({ ...form, pitch: { ...form.pitch, tone: e.target.value as Settings['pitch']['tone'] } })}
                className="sm:max-w-xs"
              >
                <option value="professional">Professional</option>
                <option value="friendly">Friendly</option>
                <option value="direct">Direct</option>
              </Select>
            </Field>

            <Field label="Services you offer" hint="Used to pick the single most relevant offer in the draft">
              <div className="flex flex-wrap gap-2">
                {SERVICES.map((service) => {
                  const active = form.pitch.services.includes(service.key);
                  return (
                    <button
                      key={service.key}
                      type="button"
                      className={cn('chip', active && 'chip-active')}
                      onClick={() =>
                        setForm({
                          ...form,
                          pitch: {
                            ...form.pitch,
                            services: active
                              ? form.pitch.services.filter((s) => s !== service.key)
                              : ([...form.pitch.services, service.key] as ServiceKey[]),
                          },
                        })
                      }
                    >
                      {service.label}
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field label="Agency positioning line">
              <TextArea rows={2} value={form.pitch.introLine} onChange={(e) => setForm({ ...form, pitch: { ...form.pitch, introLine: e.target.value } })} />
            </Field>
            <Field label="Offer line" hint="{business} is replaced with the lead's name">
              <TextArea rows={2} value={form.pitch.offerLine} onChange={(e) => setForm({ ...form, pitch: { ...form.pitch, offerLine: e.target.value } })} />
            </Field>
            <Field label="Closing question">
              <TextArea rows={2} value={form.pitch.ctaLine} onChange={(e) => setForm({ ...form, pitch: { ...form.pitch, ctaLine: e.target.value } })} />
            </Field>

            <Banner tone="info" icon="shield">
              Generation rules are fixed and cannot be turned off: copy is built only from retrieved facts (name, category, city, rating, review count,
              website presence, audit findings), WhatsApp drafts always end with an opt-out line, and nothing is ever sent automatically.
            </Banner>

            <SaveBar dirty={dirty} saving={saving} onSave={save} onReset={() => setForm(settings)} />
          </CardBody>
        </Card>
      ) : null}

      {tab === 'data' ? (
        <div className="space-y-4">
          <Card>
            <CardHeader title="Google data policy" subtitle="How long place snapshots are kept before they must be refreshed" icon="google" />
            <CardBody className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Snapshot freshness window (days)" hint="Older snapshots are flagged 'stale' in the UI">
                  <TextInput
                    type="number"
                    min={1}
                    max={365}
                    value={form.dataPolicy.googleDataMaxAgeDays}
                    onChange={(e) => setForm({ ...form, dataPolicy: { ...form.dataPolicy, googleDataMaxAgeDays: Number(e.target.value) } })}
                  />
                </Field>
                <Field label="Purge threshold (days)" hint="Used by the purge action below">
                  <TextInput
                    type="number"
                    min={1}
                    max={365}
                    value={form.dataPolicy.purgeAfterDays}
                    onChange={(e) => setForm({ ...form, dataPolicy: { ...form.dataPolicy, purgeAfterDays: Number(e.target.value) } })}
                  />
                </Field>
              </div>
              <Toggle
                checked={form.dataPolicy.keepOnlyPlaceIdWhenPurging}
                onChange={(next) => setForm({ ...form, dataPolicy: { ...form.dataPolicy, keepOnlyPlaceIdWhenPurging: next } })}
                label="Keep only place_id when purging"
                description="Google's Places policies allow indefinite storage of place_id; other cached fields should be refreshed."
              />
              <SaveBar dirty={dirty} saving={saving} onSave={save} onReset={() => setForm(settings)} />

              <div className="divider" />

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  icon="refresh"
                  loading={busyAction === 'purge'}
                  onClick={() =>
                    runAction('purge', async () => {
                      const res = await apiFetch<{ purged: number; notice: string }>('/api/maintenance', {
                        method: 'POST',
                        body: JSON.stringify({ action: 'purge-stale' }),
                      });
                      return res.notice;
                    })
                  }
                >
                  Purge {counts.stale} stale snapshot(s)
                </Button>
                <span className="text-[11px] text-ink-500">Keeps place_id, notes, status and drafts; clears cached Google fields.</span>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Demo Mode" subtitle="Test the full UI without any API keys" icon="sparkles" />
            <CardBody className="space-y-4">
              <Toggle
                checked={form.demoMode}
                onChange={(next) => setForm({ ...form, demoMode: next })}
                label="Force Demo Mode"
                description={
                  status.googleConfigured
                    ? 'A Google key is configured, but searches will use the fictional dataset while this is on.'
                    : 'No Google key is configured, so Demo Mode is active regardless of this switch.'
                }
                disabled={!status.googleConfigured}
              />
              <SaveBar dirty={dirty} saving={saving} onSave={save} onReset={() => setForm(settings)} />
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  icon="refresh"
                  loading={busyAction === 'reseed'}
                  onClick={() =>
                    runAction('reseed', async () => {
                      const res = await apiFetch<{ notice: string }>('/api/demo', { method: 'POST', body: JSON.stringify({ action: 'reseed' }) });
                      return res.notice;
                    })
                  }
                >
                  Restore demo dataset
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon="trash"
                  loading={busyAction === 'clear-demo'}
                  onClick={() =>
                    runAction('clear-demo', async () => {
                      const res = await apiFetch<{ removed: number; notice: string }>('/api/demo', {
                        method: 'POST',
                        body: JSON.stringify({ action: 'clear' }),
                      });
                      return res.notice;
                    })
                  }
                >
                  Remove demo leads ({counts.demo})
                </Button>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Export & erase" subtitle="Your prospecting workflow data is yours" icon="download" />
            <CardBody className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <a href="/api/export/leads" className="btn-secondary btn-sm" download>
                  <Icon name="download" size={14} /> Export all leads (CSV)
                </a>
                <a href="/api/export/campaigns" className="btn-secondary btn-sm" download>
                  <Icon name="download" size={14} /> Export campaigns (CSV)
                </a>
              </div>
              <div className="divider" />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="danger"
                  icon="trash"
                  loading={busyAction === 'clear-all'}
                  onClick={() => {
                    if (!window.confirm('Delete ALL leads? Campaigns and settings are kept. This cannot be undone.')) return;
                    void runAction('clear-all', async () => {
                      const res = await apiFetch<{ removed: number; notice: string }>('/api/demo', {
                        method: 'POST',
                        body: JSON.stringify({ action: 'clear-all-leads' }),
                      });
                      return res.notice;
                    });
                  }}
                >
                  Delete all leads ({counts.leads})
                </Button>
                <span className="text-[11px] text-ink-500">
                  Live: {counts.live} · Demo: {counts.demo}
                </span>
              </div>
              <p className="text-[11px] leading-relaxed text-ink-500">
                AgencyOS stores no passwords and no sensitive personal data. See the{' '}
                <Link href="/privacy" className="link">
                  Privacy Policy
                </Link>{' '}
                for what is kept and why.
              </p>
            </CardBody>
          </Card>
        </div>
      ) : null}

      {tab === 'suppression' ? (
        <Card>
          <CardHeader
            title="Do not contact"
            subtitle="Suppression list — outreach actions are disabled for matching leads"
            icon="shield"
            action={<Badge tone="danger">{suppression.length} entries</Badge>}
          />
          <CardBody className="space-y-4">
            <Banner tone="warn" icon="shield">
              Honouring opt-outs is your legal and ethical obligation (GDPR / DPDP / CAN-SPAM / TCPA and WhatsApp&apos;s business policies). Anything on
              this list is blocked in the UI: no WhatsApp link, no mailto, no follow-up prompts.
            </Banner>

            <div className="grid gap-3 sm:grid-cols-[140px_1fr_1fr_auto] sm:items-end">
              <Field label="Type">
                <Select value={newEntry.kind} onChange={(e) => setNewEntry({ ...newEntry, kind: e.target.value as SuppressionEntry['kind'] })}>
                  <option value="phone">Phone</option>
                  <option value="email">Email</option>
                  <option value="domain">Domain</option>
                  <option value="business">Business name</option>
                </Select>
              </Field>
              <Field label="Value">
                <TextInput value={newEntry.value} onChange={(e) => setNewEntry({ ...newEntry, value: e.target.value })} placeholder="+91 98123 45678" />
              </Field>
              <Field label="Reason">
                <TextInput value={newEntry.reason} onChange={(e) => setNewEntry({ ...newEntry, reason: e.target.value })} placeholder="Asked not to be contacted" />
              </Field>
              <Button variant="primary" icon="plus" onClick={addSuppression}>
                Add
              </Button>
            </div>

            {suppression.length === 0 ? (
              <p className="py-4 text-center text-xs text-ink-400">Nothing suppressed yet. Marking a lead DO NOT CONTACT adds it here automatically.</p>
            ) : (
              <div className="table-wrap">
                <table className="w-full border-collapse">
                  <thead className="border-b border-white/[0.07] bg-ink-900/60">
                    <tr>
                      <th className="th">Type</th>
                      <th className="th">Value</th>
                      <th className="th hidden md:table-cell">Reason</th>
                      <th className="th hidden lg:table-cell">Added</th>
                      <th className="th text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suppression.map((entry) => (
                      <tr key={entry.id} className="row-hover border-b border-white/[0.05] last:border-0">
                        <td className="td">
                          <Badge tone="neutral">{entry.kind}</Badge>
                        </td>
                        <td className="td font-mono text-xs text-ink-100">{entry.value}</td>
                        <td className="td hidden md:table-cell text-xs text-ink-400">{entry.reason || '—'}</td>
                        <td className="td hidden lg:table-cell text-xs text-ink-400">{formatDate(entry.createdAt)}</td>
                        <td className="td text-right">
                          <Button size="xs" variant="ghost" icon="trash" onClick={() => removeSuppression(entry.id)}>
                            <span className="sr-only">Remove</span>
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}

function SaveBar({ dirty, saving, onSave, onReset }: { dirty: boolean; saving: boolean; onSave: () => void; onReset: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-3">
      <Button variant="primary" icon="check" loading={saving} disabled={!dirty} onClick={onSave}>
        {dirty ? 'Save changes' : 'Saved'}
      </Button>
      {dirty ? (
        <Button variant="ghost" icon="refresh" onClick={onReset}>
          Discard
        </Button>
      ) : null}
    </div>
  );
}
