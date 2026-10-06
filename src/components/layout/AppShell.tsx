'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Icon, type IconName } from '@/components/icons';
import type { ServerStatus } from '@/lib/server-status';

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  exact?: boolean;
}

const NAV: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: 'dashboard', exact: true },
  { href: '/find', label: 'Find Leads', icon: 'search' },
  { href: '/leads', label: 'Leads', icon: 'leads' },
  { href: '/campaigns', label: 'Campaigns', icon: 'campaign' },
  { href: '/settings', label: 'Settings', icon: 'settings' },
];

const TITLES: Record<string, { title: string; subtitle: string }> = {
  '/': { title: 'Dashboard', subtitle: 'Pipeline health, priorities and follow-ups at a glance' },
  '/find': { title: 'Find Leads', subtitle: 'Search local businesses via the official Google Places API (New)' },
  '/leads': { title: 'Leads', subtitle: 'Qualify, research and move prospects through your pipeline' },
  '/campaigns': { title: 'Campaigns', subtitle: 'Group prospects and run a manual, consent-respecting outreach sequence' },
  '/settings': { title: 'Settings', subtitle: 'Agency profile, pitch defaults, data policy and suppression list' },
  '/privacy': { title: 'Privacy Policy', subtitle: 'What AgencyOS stores, what Google data is kept, and your controls' },
  '/terms': { title: 'Terms of Use', subtitle: 'Acceptable use, outreach compliance and disclaimers' },
};

function StatusPill({ status }: { status: ServerStatus }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          'badge',
          status.demoMode ? 'border-amber-400/30 bg-amber-500/10 text-amber-100' : 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100',
        )}
        title={
          status.demoMode
            ? 'Demo Mode: no Google Places key is configured on this server, so searches use the fictional demo dataset.'
            : 'Live Mode: searches call the Google Places API (New) with the server-side key.'
        }
      >
        <span className={cn('h-1.5 w-1.5 rounded-full', status.demoMode ? 'bg-amber-300' : 'bg-emerald-300')} />
        {status.demoMode ? 'Demo Mode' : 'Live · Places API'}
      </span>
      <span
        className={cn('badge hidden sm:inline-flex', status.aiConfigured ? 'border-brand-400/25 bg-brand-500/10 text-brand-100' : 'border-white/10 bg-white/5 text-ink-400')}
        title={
          status.aiConfigured
            ? `AI copy generation enabled (${status.aiProvider}, ${status.aiModel}).`
            : 'No AI key configured — outreach copy is generated from verified data with built-in templates.'
        }
      >
        <Icon name="sparkles" size={11} />
        {status.aiConfigured ? `AI · ${status.aiProvider}` : 'AI · templates'}
      </span>
    </div>
  );
}

export function AppShell({ children, status }: { children: ReactNode; status: ServerStatus }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const meta =
    TITLES[pathname] ??
    (pathname.startsWith('/leads/')
      ? { title: 'Lead', subtitle: 'Research, score, pitch and CRM record' }
      : pathname.startsWith('/campaigns/')
        ? { title: 'Campaign', subtitle: 'Sequence, leads and results' }
        : { title: 'AgencyOS', subtitle: '' });

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-4 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-gradient text-white shadow-glow">
          <Icon name="logo" size={18} strokeWidth={2} />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold tracking-tight text-ink-100">AgencyOS</span>
          <span className="block truncate text-[11px] text-ink-400">Lead engine for AI agencies</span>
        </span>
      </div>

      <nav className="mt-1 flex-1 space-y-0.5 px-2.5">
        {NAV.map((item) => {
          const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-all',
                active
                  ? 'bg-brand-500/12 text-ink-100 shadow-[inset_0_0_0_1px_rgba(95,133,251,0.25)]'
                  : 'text-ink-400 hover:bg-white/[0.04] hover:text-ink-200',
              )}
            >
              <Icon name={item.icon} size={16} className={active ? 'text-brand-200' : 'text-ink-400 group-hover:text-ink-200'} />
              <span className="truncate">{item.label}</span>
              {item.href === '/leads' && status.counts.leads > 0 ? (
                <span className="ml-auto rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] tabular-nums text-ink-300">
                  {status.counts.leads}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-2 px-3 pb-3">
        <div className="panel-flat space-y-2 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] uppercase tracking-wider text-ink-400">Server</span>
            <span className={cn('badge', status.demoMode ? 'border-amber-400/25 bg-amber-500/10 text-amber-100' : 'border-emerald-400/25 bg-emerald-500/10 text-emerald-100')}>
              {status.demoMode ? 'Demo' : 'Live'}
            </span>
          </div>
          <ul className="space-y-1 text-[11px] text-ink-400">
            <li className="flex items-center justify-between gap-2">
              <span>Places API</span>
              <span className={status.googleConfigured ? 'text-emerald-300' : 'text-amber-300'}>
                {status.googleConfigured ? 'configured' : 'missing key'}
              </span>
            </li>
            <li className="flex items-center justify-between gap-2">
              <span>AI provider</span>
              <span className={status.aiConfigured ? 'text-emerald-300' : 'text-ink-300'}>{status.aiConfigured ? status.aiProvider : 'templates'}</span>
            </li>
            <li className="flex items-center justify-between gap-2">
              <span>Storage</span>
              <span className={status.storagePersistent ? 'text-ink-200' : 'text-amber-300'}>
                {status.storagePersistent ? 'json file' : 'in-memory'}
              </span>
            </li>
          </ul>
        </div>

        <div className="flex items-center justify-between gap-2 px-1 text-[11px] text-ink-500">
          <span className="flex items-center gap-2">
            <Link href="/privacy" className="hover:text-ink-300">
              Privacy
            </Link>
            <span aria-hidden="true">·</span>
            <Link href="/terms" className="hover:text-ink-300">
              Terms
            </Link>
          </span>
          <span className="tabular-nums">v{status.version}</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 border-r border-white/[0.06] bg-ink-950/85 backdrop-blur-md lg:block">
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <div className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm" onClick={() => setMobileOpen(false)} aria-hidden="true" />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-white/[0.08] bg-ink-900 shadow-2xl">{sidebar}</aside>
        </div>
      ) : null}

      <div className="lg:pl-60">
        <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-ink-950/80 backdrop-blur-md">
          <div className="mx-auto flex max-w-[1500px] items-center gap-3 px-4 py-3 md:px-6">
            <button type="button" className="btn-ghost btn-sm lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
              <Icon name="menu" size={16} />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[15px] font-semibold tracking-tight text-ink-100">{meta.title}</h1>
              {meta.subtitle ? <p className="truncate text-[11px] text-ink-400">{meta.subtitle}</p> : null}
            </div>
            <StatusPill status={status} />
            <Link href="/find" className="btn-primary btn-sm hidden sm:inline-flex">
              <Icon name="plus" size={14} />
              Find leads
            </Link>
          </div>
        </header>

        {status.banner ? (
          <div className="mx-auto max-w-[1500px] px-4 pt-4 md:px-6">
            <div className="flex items-start gap-3 rounded-xl border border-amber-400/25 bg-amber-500/[0.08] px-3.5 py-3 text-amber-100">
              <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1 text-[13px] leading-relaxed">
                <span className="font-semibold">{status.banner}</span>{' '}
                <span className="opacity-90">
                  Searches return the fictional demo dataset. Add{' '}
                  <code className="rounded bg-black/30 px-1 py-0.5 font-mono text-[11px]">GOOGLE_PLACES_API_KEY</code> to{' '}
                  <code className="rounded bg-black/30 px-1 py-0.5 font-mono text-[11px]">.env.local</code> and restart to go live.
                </span>
              </div>
              <Link href="/settings" className="btn-secondary btn-xs hidden shrink-0 sm:inline-flex">
                Setup guide
              </Link>
            </div>
          </div>
        ) : null}

        <main className="mx-auto max-w-[1500px] px-4 py-5 md:px-6 md:py-6">{children}</main>

        <footer className="mx-auto max-w-[1500px] px-4 pb-8 pt-2 md:px-6">
          <div className="divider mb-4" />
          <div className="flex flex-col gap-2 text-[11px] text-ink-500 sm:flex-row sm:items-center sm:justify-between">
            <p>
              AgencyOS · lead generation & outreach assistant. Manual send only — no bulk messaging, no scraping of Google Maps pages.
            </p>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Link href="/privacy" className="hover:text-ink-300">
                Privacy
              </Link>
              <Link href="/terms" className="hover:text-ink-300">
                Terms
              </Link>
              <span className="flex items-center gap-1">
                <Icon name="google" size={11} className="text-ink-400" />
                Powered by Google Places API (New)
              </span>
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
