'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Minimal accessible dropdown (click outside + Escape to close). */
export function Dropdown({
  label,
  children,
  align = 'right',
  buttonClassName,
  panelClassName,
  icon,
}: {
  label: ReactNode;
  children: (close: () => void) => ReactNode;
  align?: 'left' | 'right';
  buttonClassName?: string;
  panelClassName?: string;
  icon?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn('btn-secondary btn-xs', buttonClassName)}
      >
        {icon}
        {label}
      </button>
      {open ? (
        <div
          role="menu"
          className={cn(
            'panel absolute z-50 mt-1 min-w-[200px] overflow-hidden p-1 shadow-2xl animate-fade-up',
            align === 'right' ? 'right-0' : 'left-0',
            panelClassName,
          )}
        >
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}

export function MenuItem({
  children,
  onClick,
  icon,
  tone = 'default',
  disabled,
  href,
}: {
  children: ReactNode;
  onClick?: () => void;
  icon?: ReactNode;
  tone?: 'default' | 'danger';
  disabled?: boolean;
  href?: string;
}) {
  const classes = cn(
    'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors',
    tone === 'danger' ? 'text-rose-200 hover:bg-rose-500/12' : 'text-ink-200 hover:bg-white/[0.06]',
    disabled && 'cursor-not-allowed opacity-40 hover:bg-transparent',
  );
  if (href) {
    return (
      <a href={href} className={classes} role="menuitem">
        {icon}
        {children}
      </a>
    );
  }
  return (
    <button type="button" role="menuitem" className={classes} onClick={onClick} disabled={disabled}>
      {icon}
      {children}
    </button>
  );
}

export function MenuSeparator() {
  return <div className="my-1 h-px bg-white/[0.07]" />;
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-500">{children}</p>;
}
