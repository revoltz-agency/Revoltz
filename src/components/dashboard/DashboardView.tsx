import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Campaign, Lead } from '@/lib/types';
import type { DashboardMetrics } from '@/lib/metrics';
import type { FollowUpBuckets } from '@/lib/outreach/followup';
import type { ServerStatus } from '@/lib/server-status';
import { Card, CardBody, CardHeader, StatusBadge, BandBadge, ScoreRing, ProgressBar, Badge } from '@/components/ui/display';
import { BarSeries, DonutChart, StackedColumns, Sparkline } from '@/components/ui/charts';
import { EmptyState } from '@/components/ui/feedback';
import { Icon, type IconName } from '@/components/icons';
import { formatDate, formatMoney, relativeTime } from '@/lib/utils';
import { STATUS_LABELS } from '@/lib/types';

interface StatCardProps {
  label: string;
  value: number | string;
  sub?: string;
  icon: IconName;
  tone?: 'brand' | 'high' | 'medium' | 'success' | 'info' | 'muted';
  spark?: number[];
  href?: string;
}

const TONE_MAP: Record<NonNullable<StatCardProps['tone']>, { icon: string; value: string }> = {
  brand: { icon: 'text-brand-200 bg-brand-500/12 border-brand-400/25', value: 'text-ink-100' },
  high: { icon: 'text-rose-200 bg-rose-500/12 border-rose-400/25', value: 'text-rose-100' },
  medium: { icon: 'text-amber-200 bg-amber-500/12 border-amber-400/25', value: 'text-amber-100' },
  success: { icon: 'text-emerald-200 bg-emerald-500/12 border-emerald-400/25', value: 'text-emerald-100' },
  info: { icon: 'text-cyan-200 bg-cyan-500/12 border-cyan-400/25', value: 'text-cyan-100' },
  muted: { icon: 'text-ink-300 bg-white/5 border-white/10', value: 'text-ink-100' },
};

function StatCard({ label, value, sub, icon, tone = 'brand', spark, href }: StatCardProps) {
  const styles = TONE_MAP[tone];
  const inner = (
    <div className="panel group relative overflow-hidden p-4 transition-colors hover:border-white/15">
      <div className="flex items-start justify-between gap-3">
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl border ${styles.icon}`}>
          <Icon name={icon} size={16} />
        </span>
        {spark && spark.some((v) => v > 0) ? <Sparkline values={spark} color={tone === 'high' ? '#fb7185' : tone === 'success' ? '#34d399' : '#5f85fb'} /> : null}
      </div>
      <p className={`mt-3 text-[11px] font-medium uppercase tracking-wider text-ink-400`}>{label}</p>
      <p className={`stat-value mt-0.5 ${styles.value}`}>{value}</p>
      {sub ? <p className="mt-1 text-[11px] leading-relaxed text-ink-400">{sub}</p> : null}
      {href ? (
        <span className="mt-3 inline-flex items-center gap-1 text-[11px] text-brand-300 opacity-0 transition-opacity group-hover:opacity-100">
          View <Icon name="chevronRight" size={11} />
        </span>
      ) : null}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function LeadMiniRow({ lead }: { lead: Lead }) {
  return (
    <Link
      href={`/leads/${lead.id}`}
      className="row-hover flex items-center gap-3 border-b border-white/[0.05] px-4 py-2.5 last:border-0"
    >
      <ScoreRing score={lead.score?.score ?? 0} size={34} strokeWidth={3.5} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-ink-100">{lead.place.displayName}</span>
        <span className="block truncate text-[11px] text-ink-400">
          {lead.place.primaryType ?? 'Local business'}
          {lead.place.userRatingCount !== null ? ` · ${lead.place.userRatingCount} reviews` : ''}
          {lead.place.websiteUri ? '' : ' · no website'}
        </span>
      </span>
      <StatusBadge status={lead.status} />
    </Link>
  );
}

function Panel({
  title,
  subtitle,
  icon,
  action,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  icon?: IconName;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader title={title} subtitle={subtitle} icon={icon} action={action} />
      <CardBody>{children}</CardBody>
    </Card>
  );
}

export function DashboardView({
  metrics,
  followUps,
  topLeads,
  campaigns,
  recentSearches,
  status,
  currency,
}: {
  metrics: DashboardMetrics;
  followUps: FollowUpBuckets;
  topLeads: Lead[];
  campaigns: { campaign: Campaign; leads: number; won: number; contacted: number }[];
  recentSearches: { industry: string; city: string; mode: string; executedAt: string }[];
  status: ServerStatus;
  currency: string;
}) {
  const activity = metrics.activity;
  const contactedSeries = activity.map((d) => d.contacted);
  const repliesSeries = activity.map((d) => d.replies);
  const wonSeries = activity.map((d) => d.won);

  const funnelData = metrics.funnel.map((f) => ({ label: STATUS_LABELS[f.stage], value: f.count }));
  const priorityData = [
    { label: '🔥 High priority (80–100)', value: metrics.highPriority, color: '#fb7185' },
    { label: '🟡 Medium (50–79)', value: metrics.mediumPriority, color: '#fbbf24' },
    { label: '⚪ Low (below 50)', value: metrics.lowPriority, color: '#7c8aa8' },
  ];

  const dueNow = [...followUps.overdue, ...followUps.today].slice(0, 6);

  return (
    <div className="space-y-5">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Total Leads"
          value={metrics.total}
          sub={`${metrics.dataHealth.live} live · ${metrics.dataHealth.demo} demo`}
          icon="leads"
          tone="brand"
          href="/leads"
        />
        <StatCard
          label="High Priority"
          value={metrics.highPriority}
          sub={`Avg score ${metrics.avgScore}/100 across ${metrics.total} leads`}
          icon="zap"
          tone="high"
          spark={activity.map((a) => a.contacted + a.replies)}
          href="/leads?band=HIGH"
        />
        <StatCard
          label="Contacted"
          value={metrics.contacted}
          sub={`${metrics.new} new · ${metrics.researched} researched`}
          icon="mail"
          tone="info"
          spark={contactedSeries}
          href="/leads?status=CONTACTED"
        />
        <StatCard
          label="Replies"
          value={metrics.replies}
          sub={metrics.contacted > 0 ? `${metrics.replyRate}% reply rate` : 'No outreach yet'}
          icon="note"
          tone="medium"
          spark={repliesSeries}
          href="/leads?status=REPLIED"
        />
        <StatCard
          label="Meetings"
          value={metrics.meetings}
          sub={`${formatMoney(metrics.pipelineValue, currency)} open pipeline`}
          icon="clock"
          tone="muted"
          href="/leads?status=CALL_BOOKED"
        />
        <StatCard
          label="Won"
          value={metrics.won}
          sub={`${formatMoney(metrics.wonValue, currency)} closed · ${metrics.winRate}% win rate`}
          icon="trophy"
          tone="success"
          spark={wonSeries}
          href="/leads?status=WON"
        />
      </div>

      {/* Funnel + priority */}
      <div className="grid gap-4 lg:grid-cols-5">
        <Panel
          className="lg:col-span-3"
          title="Pipeline"
          subtitle="Cumulative leads that reached each stage"
          icon="chart"
          action={
            <Link href="/leads" className="btn-ghost btn-xs">
              All leads <Icon name="chevronRight" size={12} />
            </Link>
          }
        >
          {metrics.total === 0 ? (
            <EmptyState
              icon="leads"
              title="No leads yet"
              description="Run your first search to populate the pipeline."
              action={
                <Link href="/find" className="btn-primary btn-sm">
                  <Icon name="search" size={14} /> Find leads
                </Link>
              }
            />
          ) : (
            <BarSeries data={funnelData} />
          )}
        </Panel>

        <Panel className="lg:col-span-2" title="Lead priority" subtitle="Opportunity Score bands" icon="target">
          {metrics.total === 0 ? (
            <p className="py-8 text-center text-xs text-ink-400">Nothing to show yet.</p>
          ) : (
            <DonutChart data={priorityData} centerLabel="leads scored" centerValue={metrics.total} size={150} />
          )}
        </Panel>
      </div>

      {/* Activity + service mix */}
      <div className="grid gap-4 lg:grid-cols-5">
        <Panel
          className="lg:col-span-3"
          title="Outreach activity"
          subtitle="Status changes recorded in the last 14 days"
          icon="clock"
        >
          {activity.every((a) => a.contacted === 0 && a.replies === 0 && a.won === 0) ? (
            <p className="py-6 text-center text-xs text-ink-400">
              No activity recorded yet. Mark a lead as <span className="text-ink-200">Contacted</span> to start the trail.
            </p>
          ) : (
            <StackedColumns
              data={activity.map((a) => ({ date: a.date, values: { contacted: a.contacted, replies: a.replies, won: a.won } }))}
              series={[
                { key: 'contacted', label: 'Contacted', color: '#3d63f0' },
                { key: 'replies', label: 'Replied', color: '#22d3ee' },
                { key: 'won', label: 'Won', color: '#34d399' },
              ]}
            />
          )}
        </Panel>

        <Panel className="lg:col-span-2" title="Service mix" subtitle="Assigned services and pipeline value" icon="building">
          {metrics.byService.every((s) => s.count === 0) ? (
            <p className="py-6 text-center text-xs text-ink-400">No services assigned yet — set one on a lead to forecast value.</p>
          ) : (
            <div className="space-y-3">
              {metrics.byService
                .filter((s) => s.count > 0 || s.value > 0)
                .map((s) => {
                  const maxCount = Math.max(1, ...metrics.byService.map((x) => x.count));
                  return (
                    <div key={s.service}>
                      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                        <span className="text-ink-200">{s.label}</span>
                        <span className="tabular-nums text-ink-400">
                          {s.count} lead{s.count === 1 ? '' : 's'} · {formatMoney(s.value, currency)}
                        </span>
                      </div>
                      <ProgressBar value={s.count} max={maxCount} tone="brand" />
                    </div>
                  );
                })}
              <div className="divider my-3" />
              <div className="flex items-center justify-between text-xs">
                <span className="text-ink-400">Open pipeline</span>
                <span className="font-medium tabular-nums text-ink-100">{formatMoney(metrics.pipelineValue, currency)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-ink-400">Won value</span>
                <span className="font-medium tabular-nums text-emerald-200">{formatMoney(metrics.wonValue, currency)}</span>
              </div>
            </div>
          )}
        </Panel>
      </div>

      {/* Follow-ups + top opportunities */}
      <div className="grid gap-4 lg:grid-cols-5">
        <Panel
          className="lg:col-span-2"
          title="Follow-ups due"
          subtitle="Suggestions only — nothing is sent automatically"
          icon="clock"
          action={
            <span className="flex items-center gap-1.5">
              {followUps.overdue.length > 0 ? <Badge tone="danger">{followUps.overdue.length} overdue</Badge> : null}
              {followUps.today.length > 0 ? <Badge tone="warn">{followUps.today.length} today</Badge> : null}
            </span>
          }
        >
          {dueNow.length === 0 ? (
            <EmptyState icon="check" title="Nothing due" description="Set a next follow-up date on a lead to see it here." className="py-8" />
          ) : (
            <ul className="-mx-4 divide-y divide-white/[0.05]">
              {dueNow.map((lead) => (
                <li key={lead.id}>
                  <Link href={`/leads/${lead.id}`} className="row-hover flex items-center gap-3 px-4 py-2.5">
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
                        lead.crm.nextFollowUpAt && lead.crm.nextFollowUpAt.slice(0, 10) < new Date().toISOString().slice(0, 10)
                          ? 'border-rose-400/25 bg-rose-500/10 text-rose-200'
                          : 'border-amber-400/25 bg-amber-500/10 text-amber-200'
                      }`}
                    >
                      <Icon name="clock" size={14} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-ink-100">{lead.place.displayName}</span>
                      <span className="block truncate text-[11px] text-ink-400">
                        {lead.crm.nextFollowUpAt ? `Due ${formatDate(lead.crm.nextFollowUpAt)}` : 'No date set'} ·{' '}
                        {STATUS_LABELS[lead.status]}
                      </span>
                    </span>
                    <Icon name="chevronRight" size={14} className="shrink-0 text-ink-500" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[11px] leading-relaxed text-ink-500">
            Day 0 initial outreach → Day 3 follow-up → Day 7 final follow-up. Each send is a manual click by you.
          </p>
        </Panel>

        <Panel
          className="lg:col-span-3"
          title="Top opportunities"
          subtitle="Highest Opportunity Scores based on retrieved data"
          icon="zap"
          action={
            <Link href="/leads?sortBy=score" className="btn-ghost btn-xs">
              Open leads <Icon name="chevronRight" size={12} />
            </Link>
          }
        >
          {topLeads.length === 0 ? (
            <EmptyState icon="search" title="No scored leads" description="Search for businesses to build your opportunity list." className="py-8" />
          ) : (
            <div className="-mx-4">
              {topLeads.map((lead) => (
                <LeadMiniRow key={lead.id} lead={lead} />
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* Campaigns + data health */}
      <div className="grid gap-4 lg:grid-cols-5">
        <Panel
          className="lg:col-span-3"
          title="Campaigns"
          subtitle="Manual-send outreach sequences"
          icon="campaign"
          action={
            <Link href="/campaigns" className="btn-ghost btn-xs">
              Manage <Icon name="chevronRight" size={12} />
            </Link>
          }
        >
          {campaigns.length === 0 ? (
            <EmptyState
              icon="campaign"
              title="No campaigns yet"
              description="Group leads into a campaign to run a Day 0 / 3 / 7 sequence."
              action={
                <Link href="/campaigns" className="btn-secondary btn-sm">
                  Create campaign
                </Link>
              }
              className="py-8"
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {campaigns.slice(0, 4).map(({ campaign, leads, won, contacted }) => (
                <Link key={campaign.id} href={`/campaigns/${campaign.id}`} className="panel-flat p-3 transition-colors hover:border-white/20">
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium text-ink-100">{campaign.name}</span>
                      <span className="mt-0.5 block text-[11px] text-ink-400">{campaign.status} · updated {relativeTime(campaign.updatedAt)}</span>
                    </span>
                    <Badge tone={campaign.status === 'active' ? 'success' : 'neutral'}>{campaign.status}</Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-sm font-semibold tabular-nums text-ink-100">{leads}</p>
                      <p className="text-[10px] uppercase tracking-wider text-ink-500">Leads</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold tabular-nums text-ink-100">{contacted}</p>
                      <p className="text-[10px] uppercase tracking-wider text-ink-500">Contacted</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold tabular-nums text-emerald-200">{won}</p>
                      <p className="text-[10px] uppercase tracking-wider text-ink-500">Won</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Panel>

        <Panel className="lg:col-span-2" title="Data health & compliance" subtitle="Where your lead data comes from" icon="shield">
          <ul className="space-y-2.5 text-xs">
            <li className="flex items-center justify-between gap-2">
              <span className="text-ink-300">Mode</span>
              <Badge tone={status.demoMode ? 'warn' : 'success'}>{status.demoMode ? 'Demo Mode' : 'Live Places API'}</Badge>
            </li>
            <li className="flex items-center justify-between gap-2">
              <span className="text-ink-300">Live / demo leads</span>
              <span className="tabular-nums text-ink-100">
                {metrics.dataHealth.live} / {metrics.dataHealth.demo}
              </span>
            </li>
            <li className="flex items-center justify-between gap-2">
              <span className="text-ink-300">Stale Google snapshots</span>
              <span className={`tabular-nums ${metrics.dataHealth.stale > 0 ? 'text-amber-200' : 'text-ink-100'}`}>
                {metrics.dataHealth.stale}
              </span>
            </li>
            <li className="flex items-center justify-between gap-2">
              <span className="text-ink-300">Websites analysed</span>
              <span className="tabular-nums text-ink-100">
                {metrics.websiteCoverage.analyzed} / {metrics.websiteCoverage.withWebsite}
              </span>
            </li>
            <li className="flex items-center justify-between gap-2">
              <span className="text-ink-300">No website listed</span>
              <span className="tabular-nums text-ink-100">{metrics.websiteCoverage.withoutWebsite}</span>
            </li>
            <li className="flex items-center justify-between gap-2">
              <span className="text-ink-300">Do-not-contact entries</span>
              <span className="tabular-nums text-ink-100">{status.counts.suppression}</span>
            </li>
          </ul>
          <div className="divider my-3" />
          <p className="text-[11px] leading-relaxed text-ink-400">
            Only <code className="font-mono text-ink-300">place_id</code> is treated as durable; other Google place fields are refreshed or purged
            after {status.googleDataMaxAgeDays} days.{' '}
            <Link href="/settings" className="link">
              Data policy
            </Link>
          </p>
        </Panel>
      </div>

      {/* Recent searches */}
      {recentSearches.length > 0 ? (
        <Panel title="Recent searches" subtitle="Last Place API / demo queries" icon="search">
          <div className="flex flex-wrap gap-2">
            {recentSearches.map((s, i) => (
              <span key={`${s.industry}-${s.city}-${i}`} className="badge-neutral">
                <Icon name={s.mode === 'demo' ? 'sparkles' : 'google'} size={11} />
                {s.industry} · {s.city}
                <span className="ml-1 text-ink-500">{s.mode}</span>
              </span>
            ))}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
