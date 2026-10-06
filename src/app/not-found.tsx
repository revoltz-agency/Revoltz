import Link from 'next/link';
import { Icon } from '@/components/icons';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-ink-800 text-brand-200">
        <Icon name="search" size={24} />
      </div>
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink-100">Page not found</h1>
        <p className="mt-1 max-w-sm text-sm leading-relaxed text-ink-400">
          That lead, campaign or page does not exist (it may have been deleted). Head back to the dashboard or your lead list.
        </p>
      </div>
      <div className="flex gap-2">
        <Link href="/" className="btn-primary btn-sm">
          <Icon name="dashboard" size={14} /> Dashboard
        </Link>
        <Link href="/leads" className="btn-secondary btn-sm">
          <Icon name="leads" size={14} /> Leads
        </Link>
      </div>
    </div>
  );
}
