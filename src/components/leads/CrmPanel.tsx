'use client';

import { useState } from 'react';
import type { Campaign, Lead, ServiceKey } from '@/lib/types';
import { SERVICES, SERVICE_LABELS } from '@/lib/types';
import { Button, Field, Select, TextArea, TextInput } from '@/components/ui/controls';
import { Card, CardBody, CardHeader } from '@/components/ui/display';
import { useToast } from '@/components/ui/feedback';
import { Icon } from '@/components/icons';
import { apiFetch, describeError } from '@/lib/client/api';
import { StatusSelect } from './StatusSelect';
import { isValidEmail } from '@/lib/utils';

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'AUD'];

interface FormState {
  email: string;
  owner: string;
  service: string;
  dealValue: string;
  currency: string;
  lastContactedAt: string;
  nextFollowUpAt: string;
  notes: string;
  campaignId: string;
  tags: string;
}

function toForm(lead: Lead): FormState {
  return {
    email: lead.email ?? '',
    owner: lead.crm.owner ?? '',
    service: lead.crm.assignedService ?? '',
    dealValue: lead.crm.estimatedDealValue !== null ? String(lead.crm.estimatedDealValue) : '',
    currency: lead.crm.currency || 'INR',
    lastContactedAt: lead.crm.lastContactedAt ? lead.crm.lastContactedAt.slice(0, 16) : '',
    nextFollowUpAt: lead.crm.nextFollowUpAt ? lead.crm.nextFollowUpAt.slice(0, 10) : '',
    notes: lead.crm.notes,
    campaignId: lead.campaignId ?? '',
    tags: lead.tags.join(', '),
  };
}

interface CrmPanelProps {
  lead: Lead;
  campaigns: Campaign[];
  onLeadChange: (lead: Lead) => void;
  defaultDealValue?: number;
}

/**
 * The form is keyed by `lead.updatedAt`, so server-side changes remount it with
 * fresh values instead of needing a sync effect.
 */
export function CrmPanel(props: CrmPanelProps) {
  return <CrmForm key={`${props.lead.id}:${props.lead.updatedAt}`} {...props} />;
}

function CrmForm({ lead, campaigns, onLeadChange, defaultDealValue }: CrmPanelProps) {
  const toast = useToast();
  const [form, setForm] = useState<FormState>(() => toForm(lead));
  const [saving, setSaving] = useState(false);

  const dirty = JSON.stringify(form) !== JSON.stringify(toForm(lead));

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    if (form.email && !isValidEmail(form.email)) {
      toast.push({ tone: 'error', title: 'That email address does not look valid.' });
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch<{ lead: Lead }>(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          email: form.email.trim() || null,
          campaignId: form.campaignId || null,
          tags: form.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
          crm: {
            owner: form.owner.trim() || null,
            assignedService: (form.service || null) as ServiceKey | null,
            estimatedDealValue: form.dealValue === '' ? null : Number(form.dealValue),
            currency: form.currency,
            lastContactedAt: form.lastContactedAt ? new Date(form.lastContactedAt).toISOString() : null,
            nextFollowUpAt: form.nextFollowUpAt || null,
            notes: form.notes,
          },
        }),
      });
      onLeadChange(res.lead);
      toast.push({ tone: 'success', title: 'CRM details saved' });
    } catch (err) {
      toast.push({ tone: 'error', title: 'Could not save', description: describeError(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="CRM"
        subtitle="Status, notes, ownership and deal tracking"
        icon="note"
        action={<StatusSelect value={lead.status} onChange={async (status) => {
          const res = await apiFetch<{ lead: Lead }>(`/api/leads/${lead.id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
          onLeadChange(res.lead);
          toast.push({ tone: 'success', title: `Status → ${status.replace(/_/g, ' ')}` });
        }} />}
      />
      <CardBody className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Email" hint={lead.emailSource ? `Source: ${lead.emailSource.replace('_', ' ')}` : 'Not set — needed for the mailto action'}>
            <TextInput type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="owner@business.com" />
          </Field>
          <Field label="Owner (your team)">
            <TextInput value={form.owner} onChange={(e) => set('owner', e.target.value)} placeholder="Who is running this lead?" />
          </Field>
          <Field label="Assigned service">
            <Select
              value={form.service}
              onChange={(e) => {
                const value = e.target.value as ServiceKey | '';
                set('service', value);
                if (value && !form.dealValue) {
                  const service = SERVICES.find((s) => s.key === value);
                  if (service) set('dealValue', String(defaultDealValue ?? service.defaultDealValue));
                }
              }}
            >
              <option value="">Not assigned</option>
              {SERVICES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Estimated deal value">
            <div className="flex gap-2">
              <TextInput
                type="number"
                min={0}
                step={1000}
                value={form.dealValue}
                onChange={(e) => set('dealValue', e.target.value)}
                placeholder="45000"
                className="flex-1"
              />
              <Select value={form.currency} onChange={(e) => set('currency', e.target.value)} className="w-24">
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>
          </Field>
          <Field label="Last contacted">
            <TextInput
              type="datetime-local"
              value={form.lastContactedAt}
              onChange={(e) => set('lastContactedAt', e.target.value)}
              className="[color-scheme:dark]"
            />
          </Field>
          <Field label="Next follow-up">
            <TextInput type="date" value={form.nextFollowUpAt} onChange={(e) => set('nextFollowUpAt', e.target.value)} className="[color-scheme:dark]" />
          </Field>
          <Field label="Campaign" className="sm:col-span-2">
            <Select value={form.campaignId} onChange={(e) => set('campaignId', e.target.value)}>
              <option value="">No campaign</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tags" hint="Comma separated" className="sm:col-span-2">
            <TextInput value={form.tags} onChange={(e) => set('tags', e.target.value)} placeholder="hot, referral, aggregator-dependent" />
          </Field>
        </div>

        <Field label="Notes">
          <TextArea
            rows={5}
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Call summary, requirements, objections, pricing discussed…"
          />
        </Field>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" icon="check" loading={saving} disabled={!dirty} onClick={save}>
            {dirty ? 'Save changes' : 'Saved'}
          </Button>
          {dirty ? (
            <Button variant="ghost" icon="refresh" onClick={() => setForm(toForm(lead))}>
              Discard
            </Button>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] text-ink-500">
              <Icon name="check" size={11} className="text-emerald-300" /> Up to date
            </span>
          )}
          {lead.crm.assignedService ? (
            <span className="ml-auto text-[11px] text-ink-400">Service: {SERVICE_LABELS[lead.crm.assignedService]}</span>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}
