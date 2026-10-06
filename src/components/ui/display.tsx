'use client';

import { useEffect, type ReactNode } from 'react';
import { cn, prettyHostname } from '@/lib/utils';
import { STATUS_LABELS, type LeadStatus, type ScoreBand } from '@/lib/types';
import { BAND_META } from '@/lib/scoring/opportunity';
import { Icon, type IconName } from '@/components/icons';

export function Card({
  children,
  className,
  as: Tag = 'section',
}: {
  children: ReactNode;
  className?: string;
  as?: 'section' | 'div' | 'article';
}) {
  return <Tag className={cn('panel', className)}>{children}</Tag>;
}

export function CardHeader({
  title,
  subtitle,
  icon,
  action,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: IconName;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3 border-b border-white/[0.06] px-4 py-3', className)}>
      <div className="flex min-w-0 items-start gap-2.5">
        {icon ? (
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-ink-800 text-brand-200">
            <Icon name={icon} size={14} />
          </span>
        ) : null}
        <div className="min-w-0">
          <h2 className="card-title truncate">{title}</h2>
          {subtitle ? <p className="card-subtitle mt-0.5 leading-relaxed">{subtitle}</p> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('p-4', className)}>{children}</div>;
}

const STATUS_TONES: Record<LeadStatus, string> = {
  NEW: 'border-white/10 bg-white/5 text-ink-300',
  RESEARCHED: 'border-sky-400/25 bg-sky-500/10 text-sky-200',
  CONTACTED: 'border-brand-400/25 bg-brand-500/10 text-brand-100',
  REPLIED: 'border-cyan-400/25 bg-cyan-500/10 text-cyan-100',
  INTERESTED: 'border-teal-400/25 bg-teal-500/10 text-teal-100',
  CALL_BOOKED: 'border-violet-400/25 bg-violet-500/10 text-violet-100',
  PROPOSAL: 'border-amber-400/25 bg-amber-500/10 text-amber-100',
  WON: 'border-emerald-400/30 bg-emerald-500/15 text-emerald-100',
  LOST: 'border-white/10 bg-ink-800 text-ink-400',
  DO_NOT_CONTACT: 'border-rose-400/30 bg-rose-500/10 text-rose-200',
};

export function Badge({
  children,
  className,
  tone = 'neutral',
  icon,
  title,
}: {
  children: ReactNode;
  className?: string;
  tone?: 'neutral' | 'brand' | 'success' | 'warn' | 'danger' | 'info';
  icon?: IconName;
  title?: string;
}) {
  const tones: Record<string, string> = {
    neutral: 'border-white/10 bg-white/5 text-ink-300',
    brand: 'border-brand-400/25 bg-brand-500/10 text-brand-100',
    success: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-100',
    warn: 'border-amber-400/25 bg-amber-500/10 text-amber-100',
    danger: 'border-rose-400/25 bg-rose-500/10 text-rose-200',
    info: 'border-cyan-400/25 bg-cyan-500/10 text-cyan-100',
  };
  return (
    <span className={cn('badge', tones[tone], className)} title={title}>
      {icon ? <Icon name={icon} size={11} /> : null}
      {children}
    </span>
  );
}

export function StatusBadge({ status, className }: { status: LeadStatus; className?: string }) {
  return (
    <span className={cn('badge', STATUS_TONES[status], className)} title={STATUS_LABELS[status]}>
      {STATUS_LABELS[status]}
    </span>
  );
}

export const BAND_TONES: Record<ScoreBand, string> = {
  HIGH: 'border-rose-400/30 bg-rose-500/10 text-rose-200',
  MEDIUM: 'border-amber-400/30 bg-amber-500/10 text-amber-100',
  LOW: 'border-white/10 bg-white/5 text-ink-400',
};

export function BandBadge({ band, score, className }: { band: ScoreBand; score?: number; className?: string }) {
  const meta = BAND_META[band];
  return (
    <span className={cn('badge', BAND_TONES[band], className)} title={`${meta.label} (${meta.range})`}>
      <span aria-hidden="true">{meta.emoji}</span>
      {meta.label}
      {typeof score === 'number' ? <span className="ml-1 tabular-nums opacity-80">{score}</span> : null}
    </span>
  );
}

export function ScoreRing({
  score,
  size = 46,
  strokeWidth = 4,
  showValue = true,
}: {
  score: number;
  size?: number;
  strokeWidth?: number;
  showValue?: boolean;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const offset = circumference - (clamped / 100) * circumference;
  const color = clamped >= 80 ? '#fb7185' : clamped >= 50 ? '#fbbf24' : '#7c8aa8';

  return (
    <span className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="rgba(255,255,255,0.08)" strokeWidth={strokeWidth} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 600ms ease' }}
        />
      </svg>
      {showValue ? (
        <span className="absolute text-[11px] font-semibold tabular-nums text-ink-100">{clamped}</span>
      ) : null}
    </span>
  );
}

export function ProgressBar({
  value,
  max = 100,
  tone = 'brand',
  className,
  label,
}: {
  value: number;
  max?: number;
  tone?: 'brand' | 'success' | 'warn' | 'danger' | 'muted';
  className?: string;
  label?: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const tones: Record<string, string> = {
    brand: 'bg-brand-gradient',
    success: 'bg-emerald-400',
    warn: 'bg-amber-400',
    danger: 'bg-rose-400',
    muted: 'bg-ink-500',
  };
  return (
    <div className={cn('w-full', className)}>
      {label ? (
        <div className="mb-1 flex items-center justify-between text-[11px] text-ink-400">
          <span>{label}</span>
          <span className="tabular-nums">{Math.round(pct)}%</span>
        </div>
      ) : null}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <div className={cn('h-full rounded-full transition-all duration-500', tones[tone])} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function KeyValue({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="text-[11px] uppercase tracking-wider text-ink-400">{label}</dt>
      <dd className="mt-0.5 truncate text-sm text-ink-100">{children}</dd>
    </div>
  );
}

export function RatingValue({ rating, count }: { rating: number | null; count: number | null }) {
  if (rating === null && count === null) return <span className="text-ink-500">—</span>;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-ink-200">
      {rating !== null ? (
        <>
          <Icon name="star" size={12} className="text-amber-300" strokeWidth={1.4} />
          <span className="tabular-nums">{rating.toFixed(1)}</span>
        </>
      ) : null}
      {count !== null ? <span className="tabular-nums text-ink-400">({count.toLocaleString('en-IN')})</span> : null}
    </span>
  );
}

export function WebsiteLink({ url, className }: { url: string | null; className?: string }) {
  if (!url) return <span className="text-xs text-ink-500">No website</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className={cn('inline-flex max-w-[180px] items-center gap-1 text-xs text-brand-300 hover:text-brand-200 hover:underline', className)}
      title={url}
    >
      <Icon name="globe" size={12} />
      <span className="truncate">{prettyHostname(url)}</span>
    </a>
  );
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className={cn('panel relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-b-none sm:rounded-2xl animate-fade-up', widths[size])}>
        <div className="flex items-start justify-between gap-3 border-b border-white/[0.07] px-4 py-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-ink-100">{title}</h3>
            {subtitle ? <p className="mt-0.5 text-xs leading-relaxed text-ink-400">{subtitle}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="btn-ghost btn-xs" aria-label="Close dialog">
            <Icon name="close" size={14} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer ? <div className="flex items-center justify-end gap-2 border-t border-white/[0.07] bg-ink-900/60 px-4 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}

export function SectionTitle({ children, className, hint }: { children: ReactNode; className?: string; hint?: string }) {
  return (
    <div className={cn('mb-3 flex items-baseline justify-between gap-3', className)}>
      <h2 className="text-sm font-semibold tracking-tight text-ink-100">{children}</h2>
      {hint ? <span className="text-[11px] text-ink-400">{hint}</span> : null}
    </div>
  );
}

export function GoogleAttribution({ className }: { className?: string }) {
  return (
    <p className={cn('flex items-center gap-1.5 text-[11px] text-ink-400', className)}>
      <Icon name="google" size={12} className="text-ink-300" />
      <span>
        Place data provided by <span className="font-medium text-ink-300">Google Places API (New)</span>. Displayed with required attribution.
      </span>
    </p>
  );
}
