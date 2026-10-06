'use client';

import { useId } from 'react';
import { cn } from '@/lib/utils';

/** Horizontal bar series — used for pipeline/funnel counts. */
export function BarSeries({
  data,
  className,
  valueFormatter = (n: number) => String(n),
  colorFor,
}: {
  data: { label: string; value: number; tone?: string }[];
  className?: string;
  valueFormatter?: (n: number) => string;
  colorFor?: (item: { label: string; value: number }, index: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const palette = ['#3d63f0', '#5f85fb', '#22d3ee', '#34d399', '#a78bfa', '#fbbf24', '#fb7185', '#60a5fa'];

  return (
    <div className={cn('space-y-2.5', className)}>
      {data.map((item, index) => {
        const pct = (item.value / max) * 100;
        const color = item.tone ?? colorFor?.(item, index) ?? palette[index % palette.length]!;
        return (
          <div key={item.label} className="grid grid-cols-[110px_1fr_auto] items-center gap-3 sm:grid-cols-[140px_1fr_auto]">
            <span className="truncate text-[11px] text-ink-300" title={item.label}>
              {item.label}
            </span>
            <span className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
              <span
                className="block h-full rounded-full transition-all duration-700"
                style={{ width: `${Math.max(pct, item.value > 0 ? 3 : 0)}%`, backgroundColor: color }}
              />
            </span>
            <span className="w-8 text-right text-xs font-medium tabular-nums text-ink-200">{valueFormatter(item.value)}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Donut chart with legend — used for priority distribution. */
export function DonutChart({
  data,
  size = 168,
  thickness = 18,
  centerLabel,
  centerValue,
  className,
}: {
  data: { label: string; value: number; color: string }[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string | number;
  className?: string;
}) {
  const gradientId = useId();
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offsetAccumulator = 0;

  return (
    <div className={cn('flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6', className)}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
          <defs>
            <linearGradient id={gradientId}>
              <stop offset="0%" stopColor="rgba(255,255,255,0.06)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0.03)" />
            </linearGradient>
          </defs>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={`url(#${gradientId})`} strokeWidth={thickness} />
          {total > 0 &&
            data.map((segment) => {
              const fraction = segment.value / total;
              const dash = fraction * circumference;
              const el = (
                <circle
                  key={segment.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={segment.color}
                  strokeWidth={thickness}
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={-offsetAccumulator}
                  strokeLinecap="butt"
                  style={{ transition: 'stroke-dasharray 600ms ease' }}
                />
              );
              offsetAccumulator += dash;
              return el;
            })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tabular-nums text-ink-100">{centerValue ?? total}</span>
          {centerLabel ? <span className="text-[11px] text-ink-400">{centerLabel}</span> : null}
        </div>
      </div>
      <ul className="w-full space-y-1.5">
        {data.map((segment) => (
          <li key={segment.label} className="flex items-center justify-between gap-3 text-xs">
            <span className="flex items-center gap-2 text-ink-300">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: segment.color }} />
              {segment.label}
            </span>
            <span className="tabular-nums text-ink-200">
              {segment.value}
              <span className="ml-1 text-ink-500">{total > 0 ? `${Math.round((segment.value / total) * 100)}%` : '0%'}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Stacked column chart — outreach activity over the last N days. */
export function StackedColumns({
  data,
  series,
  height = 150,
  className,
}: {
  data: { date: string; values: Record<string, number> }[];
  series: { key: string; label: string; color: string }[];
  height?: number;
  className?: string;
}) {
  const max = Math.max(1, ...data.map((d) => series.reduce((sum, s) => sum + (d.values[s.key] ?? 0), 0)));
  const width = Math.max(320, data.length * 26);
  const barWidth = Math.max(6, Math.min(18, width / data.length - 8));
  const padTop = 8;

  return (
    <div className={cn('w-full', className)}>
      <div className="w-full overflow-x-auto no-scrollbar">
        <svg viewBox={`0 0 ${width} ${height + 22}`} width={width} height={height + 22} className="min-w-full" role="img" aria-label="Activity by day">
          {[0, 0.5, 1].map((tick) => (
            <line
              key={tick}
              x1={0}
              x2={width}
              y1={padTop + (height - padTop) * tick}
              y2={padTop + (height - padTop) * tick}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth={1}
            />
          ))}
          {data.map((d, i) => {
            const x = (i + 0.5) * (width / data.length) - barWidth / 2;
            let yCursor = height;
            const total = series.reduce((sum, s) => sum + (d.values[s.key] ?? 0), 0);
            return (
              <g key={d.date}>
                {series.map((s) => {
                  const value = d.values[s.key] ?? 0;
                  const h = value > 0 ? Math.max(2, (value / max) * (height - padTop)) : 0;
                  yCursor -= h;
                  return (
                    <rect key={s.key} x={x} y={yCursor} width={barWidth} height={h} rx={2} fill={s.color}>
                      <title>{`${d.date} · ${s.label}: ${value}`}</title>
                    </rect>
                  );
                })}
                <text
                  x={x + barWidth / 2}
                  y={height + 15}
                  textAnchor="middle"
                  className="fill-ink-400"
                  style={{ fontSize: 9 }}
                >
                  {d.date.slice(8)}
                </text>
                {total === 0 ? null : (
                  <text x={x + barWidth / 2} y={yCursor - 4} textAnchor="middle" className="fill-ink-300" style={{ fontSize: 9 }}>
                    {total}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5 text-[11px] text-ink-400">
            <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: s.color }} />
            {s.label}
          </span>
        ))}
        <span className="ml-auto text-[11px] text-ink-500">Peak day: {max}</span>
      </div>
    </div>
  );
}

/** Tiny inline sparkline for stat cards. */
export function Sparkline({ values, color = '#5f85fb', width = 96, height = 28 }: { values: number[]; color?: string; width?: number; height?: number }) {
  const gradientId = useId();
  if (values.length === 0) return null;
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const points = values.map((v, i) => `${(i * step).toFixed(1)},${(height - (v / max) * (height - 4) - 2).toFixed(1)}`).join(' ');
  const areaPoints = `0,${height} ${points} ${width},${height}`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="overflow-visible">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#${gradientId})`} />
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
