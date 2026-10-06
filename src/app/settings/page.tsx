import { getDb, isStale, listSuppression } from '@/lib/db';
import { getServerStatus } from '@/lib/server-status';
import { SettingsView } from '@/components/settings/SettingsView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Settings' };

export default function SettingsPage() {
  const db = getDb();
  const status = getServerStatus();

  return (
    <SettingsView
      settings={db.settings}
      status={status}
      suppression={listSuppression()}
      counts={{
        leads: db.leads.length,
        campaigns: db.campaigns.length,
        stale: db.leads.filter((l) => isStale(l, db.settings.dataPolicy.googleDataMaxAgeDays)).length,
        demo: db.leads.filter((l) => l.isDemo).length,
        live: db.leads.filter((l) => !l.isDemo).length,
      }}
    />
  );
}
