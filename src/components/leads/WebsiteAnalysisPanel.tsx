'use client';

import { useState } from 'react';
import type { AnalysisResult, Lead, WebsiteAnalysis } from '@/lib/types';
import { Badge, Card, CardBody, CardHeader, ScoreRing } from '@/components/ui/display';
import { Button } from '@/components/ui/controls';
import { Banner, CopyButton, useToast } from '@/components/ui/feedback';
import { Icon, type IconName } from '@/components/icons';
import { apiFetch, describeError } from '@/lib/client/api';
import { cn, formatDateTime, prettyHostname, relativeTime } from '@/lib/utils';

const RESULT_META: Record<AnalysisResult, { label: string; icon: IconName; className: string }> = {
  pass: { label: 'OK', icon: 'check', className: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200' },
  warn: { label: 'Partial', icon: 'alert', className: 'border-amber-400/25 bg-amber-500/10 text-amber-200' },
  fail: { label: 'Issue', icon: 'close', className: 'border-rose-400/25 bg-rose-500/10 text-rose-200' },
  unknown: { label: 'Unknown', icon: 'info', className: 'border-white/10 bg-white/5 text-ink-400' },
};

function FindingTile({ label, result, detail }: { label: string; result: AnalysisResult; detail?: string }) {
  const meta = RESULT_META[result];
  return (
    <div className="panel-flat p-3" title={detail}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] leading-tight text-ink-300">{label}</span>
        <span className={cn('badge shrink-0', meta.className)}>
          <Icon name={meta.icon} size={10} />
          {meta.label}
        </span>
      </div>
      {detail ? <p className="mt-1.5 text-[11px] leading-relaxed text-ink-500">{detail}</p> : null}
    </div>
  );
}

export function WebsiteAnalysisPanel({ lead, onLeadChange }: { lead: Lead; onLeadChange: (lead: Lead) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const analysis: WebsiteAnalysis | null = lead.analysis;
  const hasWebsite = Boolean(lead.place.websiteUri);

  async function run() {
    setBusy(true);
    try {
      const res = await apiFetch<{ lead: Lead | null; notice: string; ok: boolean }>(`/api/leads/${lead.id}/analysis`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (res.lead) onLeadChange(res.lead);
      toast.push({
        tone: res.ok ? 'success' : 'warn',
        title: res.ok ? 'Website analysis complete' : 'Website analysis skipped',
        description: res.notice,
      });
    } catch (err) {
      toast.push({ tone: 'error', title: 'Analysis failed', description: describeError(err) });
    } finally {
      setBusy(false);
    }
  }

  async function useDiscoveredEmail() {
    if (!analysis?.findings.discoveredEmail) return;
    try {
      const res = await apiFetch<{ lead: Lead }>(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ email: analysis.findings.discoveredEmail, emailSource: 'website_analysis' }),
      });
      onLeadChange(res.lead);
      toast.push({ tone: 'success', title: 'Email saved to the lead', description: analysis.findings.discoveredEmail });
    } catch (err) {
      toast.push({ tone: 'error', title: 'Could not save the email', description: describeError(err) });
    }
  }

  return (
    <Card>
      <CardHeader
        title="Website analysis"
        subtitle={
          analysis
            ? `${analysis.mode === 'demo' ? 'Simulated demo audit' : 'Heuristic HTML inspection'} · ${relativeTime(analysis.analyzedAt)}`
            : hasWebsite
              ? `Inspect ${prettyHostname(lead.place.websiteUri)} for conversion gaps`
              : 'No website listed for this business'
        }
        icon="globe"
        action={
          hasWebsite ? (
            <Button size="xs" variant={analysis ? 'secondary' : 'primary'} icon="globe" loading={busy} onClick={run}>
              {analysis ? 'Re-analyze website' : 'Analyze Website'}
            </Button>
          ) : null
        }
      />
      <CardBody className="space-y-4">
        {!hasWebsite ? (
          <Banner tone="info" icon="info">
            Google Places returned no website for this business, so there is nothing to audit — that gap is already scored as{" "}
            <span className="font-medium">No website (+30)</span> and <span className="font-medium">Missing enquiry flow (+10)</span>.
          </Banner>
        ) : null}

        {hasWebsite && !analysis ? (
          <Banner tone="info" title="Run the audit">
            AgencyOS fetches the homepage once (robots.txt respected, private IP ranges blocked, {`10s`} timeout, max ~750 KB) and reports only what it
            can actually verify. It is not a Lighthouse audit and it never invents findings.
          </Banner>
        ) : null}

        {analysis ? (
          <>
            <div className="flex flex-wrap items-start gap-4">
              <div className="flex items-center gap-3">
                <ScoreRing score={analysis.siteScore} size={70} strokeWidth={6} showValue={false} />
                <div>
                  <p className="text-2xl font-semibold tabular-nums text-ink-100">{analysis.siteScore}</p>
                  <Badge
                    tone={analysis.siteQuality === 'strong' ? 'success' : analysis.siteQuality === 'moderate' ? 'warn' : analysis.siteQuality === 'weak' ? 'danger' : 'neutral'}
                  >
                    {analysis.siteQuality === 'unknown' ? 'Not inspectable' : `${analysis.siteQuality} site`}
                  </Badge>
                </div>
              </div>
              <dl className="grid flex-1 grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] sm:grid-cols-3">
                <div>
                  <dt className="text-ink-500">Fetched</dt>
                  <dd className="text-ink-200">{analysis.fetched ? 'yes' : 'no'}</dd>
                </div>
                {analysis.http ? (
                  <>
                    <div>
                      <dt className="text-ink-500">HTTP</dt>
                      <dd className="text-ink-200">
                        {analysis.http.status} · {Math.round(analysis.http.bytes / 1024)} KB · {analysis.http.durationMs} ms
                      </dd>
                    </div>
                    <div>
                      <dt className="text-ink-500">Final URL</dt>
                      <dd className="truncate text-ink-200" title={analysis.http.finalUrl}>
                        {prettyHostname(analysis.http.finalUrl)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-ink-500">Last-Modified</dt>
                      <dd className="text-ink-200">{analysis.http.lastModified ? formatDateTime(analysis.http.lastModified) : 'not sent'}</dd>
                    </div>
                  </>
                ) : null}
                <div>
                  <dt className="text-ink-500">robots.txt</dt>
                  <dd className={analysis.robotsAllowed ? 'text-emerald-200' : 'text-amber-200'}>{analysis.robotsAllowed ? 'allowed' : 'not allowed'}</dd>
                </div>
                <div>
                  <dt className="text-ink-500">Analysed</dt>
                  <dd className="text-ink-200">{formatDateTime(analysis.analyzedAt)}</dd>
                </div>
              </dl>
            </div>

            {!analysis.fetched ? <Banner tone="warn" title="Not fetched">{analysis.skippedReason}</Banner> : null}

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <FindingTile label="Mobile friendliness" result={analysis.findings.mobileFriendly} detail="Based on the viewport meta tag and CSS media queries in the HTML." />
              <FindingTile label="Outdated design markers" result={analysis.findings.outdatedDesign} detail="Legacy libraries, builder fingerprints and old copyright/last-modified dates." />
              <FindingTile label="Missing CTA" result={analysis.findings.missingCta} detail="Action-oriented button/link text such as Book, Enquire, Get a quote." />
              <FindingTile label="Missing WhatsApp flow" result={analysis.findings.missingWhatsappFlow} detail="wa.me / api.whatsapp.com links found in the page." />
              <FindingTile label="Missing enquiry flow" result={analysis.findings.missingContactFlow} detail="Forms, tel: links, mailto: links or booking integrations." />
              <FindingTile label="Missing business info" result={analysis.findings.missingBusinessInfo} detail="Address, opening hours and phone visible on the page or in JSON-LD." />
            </div>

            {analysis.signals.length > 0 ? (
              <div>
                <p className="label">All detected signals</p>
                <ul className="divide-y divide-white/[0.05] overflow-hidden rounded-xl border border-white/[0.07]">
                  {analysis.signals.map((signal) => {
                    const meta = RESULT_META[signal.result];
                    return (
                      <li key={signal.key} className="flex items-start gap-3 px-3 py-2.5">
                        <span className={cn('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border', meta.className)}>
                          <Icon name={meta.icon} size={11} strokeWidth={2.4} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-medium text-ink-100">{signal.label}</span>
                          <span className="mt-0.5 block text-[11px] leading-relaxed text-ink-400">{signal.detail}</span>
                        </span>
                        <span className={cn('badge shrink-0', meta.className)}>{meta.label}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            {analysis.findings.conversionIssues.length > 0 ? (
              <div>
                <p className="label">Conversion issues detected</p>
                <ul className="grid gap-1.5 sm:grid-cols-2">
                  {analysis.findings.conversionIssues.map((issue) => (
                    <li key={issue} className="flex items-start gap-1.5 text-[12px] leading-relaxed text-ink-300">
                      <Icon name="alert" size={12} className="mt-0.5 shrink-0 text-rose-300" />
                      {issue}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="panel-flat p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Potential opportunity</p>
                <div className="flex items-center gap-2">
                  <Badge tone={analysis.generatedBy === 'ai' ? 'brand' : 'neutral'} icon="sparkles">
                    {analysis.generatedBy === 'ai' ? 'AI' : 'Template'}
                  </Badge>
                  <CopyButton value={analysis.potentialOpportunity} label="" size="xs" />
                </div>
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-100">{analysis.potentialOpportunity}</p>
            </div>

            {analysis.socialLinks.length > 0 ? (
              <div>
                <p className="label">Social profiles linked from the site</p>
                <div className="flex flex-wrap gap-2">
                  {analysis.socialLinks.map((link) => (
                    <a
                      key={`${link.platform}-${link.url}`}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="badge-neutral hover:text-ink-100"
                    >
                      <Icon name="external" size={10} />
                      {link.platform}
                    </a>
                  ))}
                </div>
              </div>
            ) : null}

            {analysis.findings.discoveredEmail ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/[0.07] px-3 py-2">
                <span className="text-[12px] text-emerald-100">
                  Public email found on the site: <span className="font-medium">{analysis.findings.discoveredEmail}</span>
                </span>
                <span className="flex items-center gap-2">
                  <CopyButton value={analysis.findings.discoveredEmail} label="Copy" size="xs" />
                  {lead.email !== analysis.findings.discoveredEmail ? (
                    <Button size="xs" variant="secondary" icon="plus" onClick={useDiscoveredEmail}>
                      Use as lead email
                    </Button>
                  ) : (
                    <Badge tone="success">Saved</Badge>
                  )}
                </span>
              </div>
            ) : null}

            <p className="text-[11px] leading-relaxed text-ink-500">{analysis.disclaimer}</p>
          </>
        ) : null}
      </CardBody>
    </Card>
  );
}
