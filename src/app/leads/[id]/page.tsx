import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getCampaign, getDb, getLead, isStale, isSuppressed } from '@/lib/db';
import { LeadWorkspace } from '@/components/leads/LeadWorkspace';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const lead = getLead(id);
  return { title: lead ? lead.place.displayName : 'Lead' };
}

export default async function LeadPage({ params }: Props) {
  const { id } = await params;
  const lead = getLead(id);
  if (!lead) notFound();

  const db = getDb();
  const campaign = lead.campaignId ? getCampaign(lead.campaignId) : null;

  return (
    <LeadWorkspace
      initialLead={lead}
      campaign={campaign}
      campaigns={db.campaigns}
      suppressed={isSuppressed(lead)}
      stale={isStale(lead, db.settings.dataPolicy.googleDataMaxAgeDays)}
      defaultCountryCode={db.settings.agency.defaultCountryCode || '91'}
      maxAgeDays={db.settings.dataPolicy.googleDataMaxAgeDays}
    />
  );
}
