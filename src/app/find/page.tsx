import { getDb } from '@/lib/db';
import { getServerStatus } from '@/lib/server-status';
import { FindLeadsPanel } from '@/components/find/FindLeadsPanel';
import { DEMO_INDUSTRY_SUGGESTIONS } from '@/lib/db/demo-data';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Find Leads' };

export default function FindLeadsPage() {
  const db = getDb();
  const status = getServerStatus();

  return (
    <FindLeadsPanel
      status={status}
      defaultCity={db.settings.agency.city || 'Pune'}
      campaigns={db.campaigns.map((c) => ({ id: c.id, name: c.name, status: c.status }))}
      recentSearches={db.searches.slice(0, 6)}
      savedLeadCount={db.leads.length}
      industrySuggestions={DEMO_INDUSTRY_SUGGESTIONS}
    />
  );
}
