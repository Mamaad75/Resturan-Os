import { type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type BadgeTone =
  | 'neutral'
  | 'gold'
  | 'positive'
  | 'caution'
  | 'critical'
  | 'info';

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-raised text-ink-muted border-line',
  gold: 'bg-gold/12 text-gold-bright border-gold/30',
  positive: 'bg-positive/12 text-positive border-positive/30',
  caution: 'bg-caution/12 text-caution border-caution/30',
  critical: 'bg-critical/12 text-critical border-critical/30',
  info: 'bg-info/12 text-info border-info/30',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
  dot = false,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1',
        'text-xs font-medium whitespace-nowrap',
        TONES[tone],
        className,
      )}
    >
      {dot ? (
        <span className="size-1.5 rounded-full bg-current" aria-hidden />
      ) : null}
      {children}
    </span>
  );
}
