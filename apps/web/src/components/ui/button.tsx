'use client';

import { Loader2 } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'success';
type Size = 'sm' | 'md' | 'lg' | 'xl' | 'icon';

const VARIANTS: Record<Variant, string> = {
  // Gold is reserved for the single primary action on a screen.
  primary:
    'bg-gold text-ink-inverse hover:bg-gold-bright active:bg-gold shadow-sm font-semibold',
  secondary:
    'bg-surface-raised text-ink hover:bg-line border border-line hover:border-line-strong',
  outline:
    'bg-transparent text-ink border border-line-strong hover:bg-surface-raised',
  ghost: 'bg-transparent text-ink-muted hover:bg-surface-raised hover:text-ink',
  danger: 'bg-critical/15 text-critical border border-critical/30 hover:bg-critical/25',
  success: 'bg-positive/15 text-positive border border-positive/30 hover:bg-positive/25',
};

// min-h (not a fixed height) plus real vertical padding: single-line buttons
// keep their familiar height, but the label always has breathing room and a
// button that wraps on a narrow screen grows gracefully instead of clipping.
const SIZES: Record<Size, string> = {
  sm: 'min-h-9 px-3.5 py-2 text-sm gap-1.5 rounded-lg leading-none',
  md: 'min-h-11 px-5 py-2.5 text-sm gap-2 rounded-xl leading-none',
  lg: 'min-h-13 px-6 py-3 text-base gap-2.5 rounded-xl leading-none',
  // Sized for the POS and kitchen display, where staff tap at speed.
  xl: 'min-h-16 px-8 py-4 text-lg gap-3 rounded-2xl font-semibold leading-none',
  icon: 'h-11 w-11 shrink-0 rounded-xl',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant = 'secondary',
    size = 'md',
    loading = false,
    leftIcon,
    rightIcon,
    fullWidth,
    disabled,
    children,
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      // A button mid-mutation must not be clickable twice.
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap font-medium',
        'transition-colors duration-150 select-none',
        'disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {loading ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        leftIcon
      )}
      {children}
      {!loading && rightIcon}
    </button>
  );
});
