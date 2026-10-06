'use client';

import { useState } from 'react';
import type { LeadStatus } from '@/lib/types';
import { LEAD_STATUSES, STATUS_LABELS } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/icons';

const DOT: Record<LeadStatus, string> = {
  NEW: 'bg-ink-400',
  RESEARCHED: 'bg-sky-400',
  CONTACTED: 'bg-brand-400',
  REPLIED: 'bg-cyan-400',
  INTERESTED: 'bg-teal-400',
  CALL_BOOKED: 'bg-violet-400',
  PROPOSAL: 'bg-amber-400',
  WON: 'bg-emerald-400',
  LOST: 'bg-ink-500',
  DO_NOT_CONTACT: 'bg-rose-400',
};

export function StatusSelect({
  value,
  onChange,
  size = 'sm',
  className,
  disabled,
}: {
  value: LeadStatus;
  onChange: (next: LeadStatus) => void | Promise<void>;
  size?: 'xs' | 'sm';
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function pick(next: LeadStatus) {
    setOpen(false);
    if (next === value) return;
    setBusy(true);
    try {
      await onChange(next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-ink-900/70 font-medium text-ink-200 transition hover:border-white/20 disabled:opacity-50',
          size === 'xs' ? 'px-1.5 py-1 text-[11px]' : 'px-2 py-1.5 text-xs',
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={cn('h-1.5 w-1.5 rounded-full', DOT[value])} />
        {STATUS_LABELS[value]}
        <Icon name="chevronDown" size={11} className="opacity-60" />
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <ul
            role="listbox"
            className="panel absolute right-0 z-50 mt-1 max-h-72 w-48 overflow-y-auto p-1 shadow-2xl animate-fade-up"
          >
            {LEAD_STATUSES.map((status) => (
              <li key={status}>
                <button
                  type="button"
                  role="option"
                  aria-selected={status === value}
                  onClick={() => pick(status)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                    status === value ? 'bg-brand-500/15 text-brand-100' : 'text-ink-200 hover:bg-white/[0.06]',
                    status === 'DO_NOT_CONTACT' && 'text-rose-200 hover:bg-rose-500/12',
                  )}
                >
                  <span className={cn('h-1.5 w-1.5 rounded-full', DOT[status])} />
                  {STATUS_LABELS[status]}
                  {status === value ? <Icon name="check" size={11} className="ml-auto" /> : null}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
