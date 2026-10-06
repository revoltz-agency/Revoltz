'use client';

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { Icon, type IconName } from '@/components/icons';
import { Spinner } from './feedback';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'xs' | 'sm' | 'md';

const VARIANT_CLASS: Record<Variant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
};

const SIZE_CLASS: Record<Size, string> = {
  xs: 'btn-xs',
  sm: 'btn-sm',
  md: '',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  block?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'sm',
  icon,
  iconRight,
  loading,
  block,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cn(VARIANT_CLASS[variant], SIZE_CLASS[size], block && 'w-full', className)}
    >
      {loading ? <Spinner size={size === 'xs' ? 12 : 14} /> : icon ? <Icon name={icon} size={size === 'xs' ? 12 : 14} /> : null}
      {children}
      {iconRight && !loading ? <Icon name={iconRight} size={size === 'xs' ? 12 : 14} /> : null}
    </button>
  );
}

export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
  htmlFor,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <label className="label" htmlFor={htmlFor}>
        {label}
        {required ? <span className="ml-1 text-rose-300">*</span> : null}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-[11px] text-rose-300">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-[11px] leading-relaxed text-ink-400">{hint}</p>
      ) : null}
    </div>
  );
}

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cn('input', className)} />;
}

export function TextArea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={cn('input resize-y leading-relaxed', className)} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={cn('input', className)}>
      {children}
    </select>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-3', disabled && 'cursor-not-allowed opacity-60')}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={cn(
          'relative mt-0.5 h-5 w-9 shrink-0 rounded-full border transition-colors',
          checked ? 'border-brand-400/50 bg-brand-500/70' : 'border-white/10 bg-ink-800',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-all',
            checked ? 'left-[18px]' : 'left-0.5',
          )}
        />
      </button>
      <span className="min-w-0">
        <span className="block text-sm text-ink-100">{label}</span>
        {description ? <span className="mt-0.5 block text-[11px] leading-relaxed text-ink-400">{description}</span> : null}
      </span>
    </label>
  );
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  className,
  size = 'sm',
}: {
  value: T;
  options: { value: T; label: string; icon?: IconName }[];
  onChange: (next: T) => void;
  className?: string;
  size?: 'xs' | 'sm';
}) {
  return (
    <div className={cn('inline-flex rounded-lg border border-white/10 bg-ink-900/70 p-0.5', className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-2.5 font-medium transition',
            size === 'xs' ? 'py-1 text-[11px]' : 'py-1.5 text-xs',
            value === option.value ? 'bg-brand-500/20 text-brand-100 shadow-[inset_0_0_0_1px_rgba(95,133,251,0.35)]' : 'text-ink-400 hover:text-ink-200',
          )}
        >
          {option.icon ? <Icon name={option.icon} size={12} /> : null}
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  className,
  indeterminate,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  className?: string;
  indeterminate?: boolean;
}) {
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-2 text-xs text-ink-300', className)}>
      <span
        className={cn(
          'flex h-4 w-4 items-center justify-center rounded border transition',
          checked || indeterminate ? 'border-brand-400/60 bg-brand-500/30 text-brand-100' : 'border-white/15 bg-ink-900',
        )}
      >
        {indeterminate && !checked ? (
          <span className="h-0.5 w-2 rounded bg-brand-100" />
        ) : checked ? (
          <Icon name="check" size={11} strokeWidth={3} />
        ) : null}
      </span>
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label ?? 'Select'}
      />
      {label ? <span>{label}</span> : null}
    </label>
  );
}
