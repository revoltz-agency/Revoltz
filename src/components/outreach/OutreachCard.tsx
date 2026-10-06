'use client';

import { useState } from 'react';
import type { Lead, OutreachDraft, PitchTone } from '@/lib/types';
import { Button, SegmentedControl, TextArea } from '@/components/ui/controls';
import { Badge, Card, CardBody, CardHeader } from '@/components/ui/display';
import { Banner, CopyButton, useToast } from '@/components/ui/feedback';
import { Icon } from '@/components/icons';
import { apiFetch, describeError } from '@/lib/client/api';
import { cn, digitsOnly, normalisePhone, prettyHostname } from '@/lib/utils';

const TONE_OPTIONS: { value: PitchTone; label: string }[] = [
  { value: 'professional', label: 'Professional' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'direct', label: 'Direct' },
];

export function OutreachCard({
  lead,
  draft,
  onDraftChange,
  onLeadChange,
  suppressed,
  defaultCountryCode,
  compact = false,
}: {
  lead: Lead;
  draft: OutreachDraft | null;
  onDraftChange?: (draft: OutreachDraft | null) => void;
  onLeadChange?: (lead: Lead) => void;
  suppressed?: boolean;
  defaultCountryCode?: string;
  compact?: boolean;
}) {
  const toast = useToast();
  const [tone, setTone] = useState<PitchTone>(draft?.tone ?? 'professional');
  const [busy, setBusy] = useState(false);
  const [whatsappText, setWhatsappText] = useState(draft?.whatsappDraft ?? '');
  const [emailBody, setEmailBody] = useState(draft?.emailBody ?? '');

  const phone = normalisePhone(lead.place.internationalPhoneNumber ?? lead.place.nationalPhoneNumber, defaultCountryCode ?? '91');
  const hasPhone = Boolean(phone) && phone.length >= 8;
  const hasEmail = Boolean(lead.email);

  function whatsappHref(text: string) {
    if (!hasPhone) return null;
    return `https://wa.me/${digitsOnly(phone)}?text=${encodeURIComponent(text)}`;
  }

  function mailtoHref(subject: string, body: string) {
    if (!hasEmail) return null;
    return `mailto:${lead.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  async function generate() {
    setBusy(true);
    try {
      const res = await apiFetch<{ outreach: OutreachDraft; notice: string | null; lead: Lead }>('/api/leads/' + lead.id + '/pitch', {
        method: 'POST',
        body: JSON.stringify({ tone }),
      });
      setWhatsappText(res.outreach.whatsappDraft);
      setEmailBody(res.outreach.emailBody);
      onDraftChange?.(res.outreach);
      onLeadChange?.(res.lead);
      toast.push({
        tone: 'success',
        title: res.outreach.generatedBy === 'ai' ? 'AI draft ready' : 'Template draft ready',
        description: res.notice ?? undefined,
      });
    } catch (err) {
      toast.push({ tone: 'error', title: 'Could not generate the pitch', description: describeError(err) });
    } finally {
      setBusy(false);
    }
  }

  async function markSent(channel: 'email' | 'whatsapp') {
    try {
      const res = await apiFetch<{ lead: Lead }>(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'CONTACTED',
          note: `Manual ${channel} send from the outreach panel`,
          crm: { lastContactedAt: new Date().toISOString(), nextFollowUpAt: shiftDate(new Date(), 3) },
        }),
      });
      onLeadChange?.(res.lead);
      toast.push({ tone: 'success', title: 'Marked as contacted', description: 'Day-3 follow-up scheduled. Nothing was sent by AgencyOS.' });
    } catch (err) {
      toast.push({ tone: 'error', title: 'Could not update the lead', description: describeError(err) });
    }
  }

  const currentDraft: OutreachDraft | null = draft
    ? { ...draft, emailBody, whatsappDraft: whatsappText }
    : null;

  return (
    <Card>
      <CardHeader
        title="Personalized outreach"
        subtitle={
          currentDraft
            ? `Generated ${new Date(currentDraft.generatedAt).toLocaleString('en-GB')} · only from verified lead data`
            : 'Generate an email + WhatsApp draft from the data actually retrieved for this lead'
        }
        icon="sparkles"
        action={
          currentDraft ? (
            <Badge tone={currentDraft.generatedBy === 'ai' ? 'brand' : 'neutral'} icon="sparkles">
              {currentDraft.generatedBy === 'ai' ? `AI · ${currentDraft.model ?? 'model'}` : 'Template'}
            </Badge>
          ) : null
        }
      />
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SegmentedControl value={tone} options={TONE_OPTIONS} onChange={(next) => setTone(next)} />
          <div className="flex items-center gap-2">
            <Button variant="primary" icon="sparkles" onClick={generate} loading={busy}>
              {currentDraft ? 'Regenerate pitch' : 'Generate pitch'}
            </Button>
          </div>
        </div>

        {suppressed ? (
          <Banner tone="danger" title="Do not contact">
            This lead is on your suppression list or marked DO NOT CONTACT. Outreach actions are disabled — remove it in Settings if this was a mistake.
          </Banner>
        ) : null}

        {!currentDraft ? (
          <Banner tone="info" title="No draft yet">
            The generator only uses verified fields: business name, category, city, rating, review count, website status and (if you ran it) the website
            audit. Nothing is invented, and nothing is sent — you send manually from your own mail client or WhatsApp.
          </Banner>
        ) : (
          <>
            {/* Email */}
            <div className="panel-flat p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Email</p>
                <div className="flex items-center gap-2">
                  <CopyButton value={`${currentDraft.emailSubject}\n\n${emailBody}`} label="Copy all" size="xs" />
                </div>
              </div>

              <div className="mt-2 space-y-2">
                <div>
                  <label className="label mb-1">Subject</label>
                  <div className="flex gap-2">
                    <TextArea rows={1} value={currentDraft.emailSubject} readOnly className="input-sm flex-1 font-medium" />
                    <CopyButton value={currentDraft.emailSubject} label="" size="xs" />
                  </div>
                </div>
                <div>
                  <label className="label mb-1">Body</label>
                  <TextArea
                    rows={compact ? 8 : 11}
                    value={emailBody}
                    onChange={(e) => setEmailBody(e.target.value)}
                    className="font-mono text-[12px]"
                  />
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <a
                  href={mailtoHref(currentDraft.emailSubject, emailBody) ?? undefined}
                  onClick={(e) => {
                    if (!hasEmail) e.preventDefault();
                  }}
                  className={cn('btn-primary btn-sm', (!hasEmail || suppressed) && 'pointer-events-none opacity-40')}
                  title={hasEmail ? `Opens your mail client addressed to ${lead.email}` : 'No email address on record for this lead'}
                >
                  <Icon name="mail" size={14} /> Open in mail client
                </a>
                <Button size="sm" icon="check" disabled={suppressed} onClick={() => markSent('email')}>
                  I sent it — mark contacted
                </Button>
                {!hasEmail ? (
                  <span className="text-[11px] text-amber-200/90">
                    No email on record. Add one in the CRM panel (or run the website analysis to find a public mailto address).
                  </span>
                ) : null}
              </div>
            </div>

            {/* WhatsApp */}
            <div className="panel-flat p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">WhatsApp draft</p>
                <span className="text-[11px] text-ink-500">{whatsappText.length}/480 chars</span>
              </div>
              <TextArea
                rows={compact ? 5 : 7}
                value={whatsappText}
                onChange={(e) => setWhatsappText(e.target.value.slice(0, 480))}
                className="mt-2 font-mono text-[12px]"
              />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <a
                  href={whatsappHref(whatsappText) ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => {
                    if (!hasPhone || suppressed) e.preventDefault();
                  }}
                  className={cn('btn-primary btn-sm', (!hasPhone || suppressed) && 'pointer-events-none opacity-40')}
                  title={hasPhone ? `Opens wa.me for +${phone} — you press send yourself` : 'No phone number retrieved for this lead'}
                >
                  <Icon name="whatsapp" size={14} /> Open WhatsApp
                </a>
                <CopyButton value={whatsappText} label="Copy draft" size="sm" />
                <Button size="sm" icon="check" disabled={!hasPhone || suppressed} onClick={() => markSent('whatsapp')}>
                  I sent it — mark contacted
                </Button>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-ink-500">
                One click opens WhatsApp with this draft pre-filled for {hasPhone ? `+${phone}` : 'the listed number'} — you review it and press send
                yourself. AgencyOS has no bulk messaging, no unofficial WhatsApp automation and never sends on your behalf.
              </p>
            </div>

            {/* Transparency */}
            {currentDraft.factsUsed.length > 0 ? (
              <div>
                <p className="label">Verified facts used in this copy</p>
                <ul className="grid gap-1.5 sm:grid-cols-2">
                  {currentDraft.factsUsed.map((fact) => (
                    <li key={fact} className="flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-300">
                      <Icon name="check" size={11} className="mt-0.5 shrink-0 text-emerald-300" />
                      {fact}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {lead.place.websiteUri ? (
              <p className="text-[11px] text-ink-500">
                Website referenced in the copy:{' '}
                <a href={lead.place.websiteUri} target="_blank" rel="noopener noreferrer nofollow" className="link">
                  {prettyHostname(lead.place.websiteUri)}
                </a>
              </p>
            ) : null}
          </>
        )}
      </CardBody>
    </Card>
  );
}

function shiftDate(date: Date, days: number): string {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
