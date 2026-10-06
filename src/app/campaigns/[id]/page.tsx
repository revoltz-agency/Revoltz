import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getCampaign, getDb, leadsForCampaign } from '@/lib/db';
import { computeCampaignStats } from '@/lib/metrics';
import { CampaignWorkspace } from '@/components/campaigns/CampaignWorkspace';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const campaign = getCampaign(id);
  return { title: campaign ? campaign.name : 'Campaign' };
}

export default async function CampaignPage({ params }: Props) {
  const { id } = await params;
  const campaign = getCampaign(id);
  if (!campaign) notFound();

  const db = getDb();
  const leads = leadsForCampaign(id);

  return (
    <CampaignWorkspace
      campaign={campaign}
      campaignLeads={leads}
      stats={computeCampaignStats(leads)}
      allLeads={db.leads}
      currency={db.settings.agency.currency}
      defaultCountryCode={db.settings.agency.defaultCountryCode}
    />
  );
}
