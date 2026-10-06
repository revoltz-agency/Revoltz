'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Icon, type IconName } from '@/components/icons';

export type ToastTone = 'success' | 'error' | 'info' | 'warn' | 'danger';

interface ToastItem {
  id: string;
  title: string;
  description?: string;
  tone: ToastTone;
}

interface ToastContextValue {
  push: (toast: Omit<ToastItem, 'id'>) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_ICON: Record<ToastTone, IconName> = {
  success: 'check',
  error: 'alert',
  info: 'info',
  warn: 'alert',
  danger: 'shield',
};

const TONE_CLASS: Record<ToastTone, string> = {
  success: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-100',
  error: 'border-rose-400/25 bg-rose-500/10 text-rose-100',
  info: 'border-brand-400/25 bg-brand-500/10 text-brand-100',
  warn: 'border-amber-400/25 bg-amber-500/10 text-amber-100',
  danger: 'border-rose-400/30 bg-rose-500/12 text-rose-100',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setItems((prev) => [...prev.slice(-3), { ...toast, id }]);
    window.setTimeout(() => remove(id), toast.tone === 'error' ? 9000 : 5200);
  }, [remove]);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[80] flex flex-col items-center gap-2 p-4 sm:items-end">
        {items.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={cn(
              'pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border px-3.5 py-3 shadow-card backdrop-blur-md animate-fade-up',
              TONE_CLASS[toast.tone],
            )}
          >
            <span className="mt-0.5 shrink-0">
              <Icon name={TONE_ICON[toast.tone]} size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-snug">{toast.title}</p>
              {toast.description ? <p className="mt-0.5 text-xs leading-relaxed opacity-80">{toast.description}</p> : null}
            </div>
            <button type="button" onClick={() => remove(toast.id)} className="shrink-0 opacity-60 transition hover:opacity-100" aria-label="Dismiss">
              <Icon name="close" size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

export function Banner({
  tone = 'info',
  title,
  children,
  action,
  icon,
  className,
}: {
  tone?: ToastTone;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  icon?: IconName;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start gap-3 rounded-xl border px-3.5 py-3', TONE_CLASS[tone], className)}>
      <span className="mt-0.5 shrink-0 opacity-90">
        <Icon name={icon ?? TONE_ICON[tone]} size={16} />
      </span>
      <div className="min-w-0 flex-1 text-sm leading-relaxed">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn('text-[13px] opacity-90', title && 'mt-0.5')}>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function EmptyState({
  icon = 'search',
  title,
  description,
  action,
  className,
}: {
  icon?: IconName;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-6 py-14 text-center', className)}>
      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-ink-800 text-ink-300">
        <Icon name={icon} size={22} />
      </div>
      <div>
        <p className="text-sm font-semibold text-ink-100">{title}</p>
        {description ? <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-ink-400">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={cn('animate-spin', className)} aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.2" fill="none" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/** Copy-to-clipboard with visual confirmation (used for all outreach copy). */
export function CopyButton({
  value,
  label = 'Copy',
  className,
  onCopied,
  size = 'sm',
}: {
  value: string;
  label?: string;
  className?: string;
  onCopied?: () => void;
  size?: 'xs' | 'sm';
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(t);
  }, [copied]);

  async function copy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        // Fallback for non-secure contexts
        const ta = document.createElement('textarea');
        ta.value = value;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      onCopied?.();
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={cn('btn-secondary', size === 'xs' ? 'btn-xs' : 'btn-sm', className)}
      title="Copy to clipboard"
    >
      <Icon name={copied ? 'check' : 'copy'} size={size === 'xs' ? 12 : 14} className={copied ? 'text-emerald-300' : undefined} />
      {copied ? 'Copied' : label}
    </button>
  );
}
