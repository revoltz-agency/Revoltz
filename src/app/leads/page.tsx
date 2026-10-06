import { getDb, isStale, isSuppressed } from '@/lib/db';
import { LeadsExplorer } from '@/components/leads/LeadsExplorer';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Leads' };

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const db = getDb();
  const sp = await searchParams;

  const initialQuery: Record<string, string> = {};
  for (const [key, value] of Object.entries(sp)) {
    if (typeof value === 'string') initialQuery[key] = value;
    else if (Array.isArray(value)) initialQuery[key] = value.join(',');
  }

  return (
    <LeadsExplorer
      initialLeads={db.leads}
      campaigns={db.campaigns}
      staleIds={db.leads.filter((l) => isStale(l, db.settings.dataPolicy.googleDataMaxAgeDays)).map((l) => l.id)}
      suppressedIds={db.leads.filter((l) => isSuppressed(l)).map((l) => l.id)}
      defaultCountryCode={db.settings.agency.defaultCountryCode || '91'}
      initialQuery={initialQuery}
    />
  );
}
