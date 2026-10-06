import { getDb } from '@/lib/db';
import { computeCampaignStats } from '@/lib/metrics';
import { CampaignsView } from '@/components/campaigns/CampaignsView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Campaigns' };

export default function CampaignsPage() {
  const db = getDb();
  const stats = Object.fromEntries(
    db.campaigns.map((campaign) => [campaign.id, computeCampaignStats(db.leads.filter((l) => l.campaignId === campaign.id))]),
  );

  return <CampaignsView campaigns={db.campaigns} stats={stats} currency={db.settings.agency.currency} />;
}
