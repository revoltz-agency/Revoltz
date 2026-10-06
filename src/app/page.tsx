import { getDb, isStale, listLeads } from '@/lib/db';
import { computeMetrics, computeCampaignStats } from '@/lib/metrics';
import { followUpBuckets } from '@/lib/outreach/followup';
import { getServerStatus } from '@/lib/server-status';
import { DashboardView } from '@/components/dashboard/DashboardView';

export const dynamic = 'force-dynamic';

export default function DashboardPage() {
  const db = getDb();
  const status = getServerStatus();

  const staleIds = new Set(db.leads.filter((l) => isStale(l, db.settings.dataPolicy.googleDataMaxAgeDays)).map((l) => l.id));
  const metrics = computeMetrics(db.leads, { staleIds });
  const buckets = followUpBuckets(db.leads);
  const { leads: topLeads } = listLeads({
    sortBy: 'score',
    sortDir: 'desc',
    limit: 6,
    statuses: ['NEW', 'RESEARCHED', 'CONTACTED', 'REPLIED', 'INTERESTED', 'CALL_BOOKED', 'PROPOSAL'],
  });

  const campaigns = db.campaigns.slice(0, 6).map((campaign) => {
    const stats = computeCampaignStats(db.leads.filter((l) => l.campaignId === campaign.id));
    return { campaign, leads: stats.leads, won: stats.won, contacted: stats.contacted };
  });

  return (
    <DashboardView
      metrics={metrics}
      followUps={buckets}
      topLeads={topLeads}
      campaigns={campaigns}
      recentSearches={db.searches.slice(0, 8)}
      status={status}
      currency={db.settings.agency.currency}
    />
  );
}
