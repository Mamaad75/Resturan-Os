'use client';

import { TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatPercent } from '@/lib/format';

export function StatCard({
  label,
  value,
  sublabel,
  icon: Icon,
  deltaPct,
  accent = false,
}: {
  label: string;
  value: string;
  sublabel?: string;
  icon: LucideIcon;
  /** Percentage change vs the comparison period; null when undefined. */
  deltaPct?: number | null;
  accent?: boolean;
}) {
  const hasDelta = deltaPct !== undefined && deltaPct !== null;
  const positive = hasDelta && deltaPct > 0;
  const negative = hasDelta && deltaPct < 0;

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-ink-muted">{label}</p>
        <span
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-xl',
            accent ? 'bg-gold/12 text-gold' : 'bg-surface-raised text-ink-subtle',
          )}
        >
          <Icon className="size-4.5" />
        </span>
      </div>

      <p
        className={cn(
          'mt-3 text-2xl font-bold tabular-nums',
          accent ? 'text-gold' : 'text-ink',
        )}
      >
        {value}
      </p>

      <div className="mt-1.5 flex items-center gap-2 text-xs">
        {hasDelta ? (
          <span
            className={cn(
              'flex items-center gap-1 font-medium',
              positive && 'text-positive',
              negative && 'text-critical',
              !positive && !negative && 'text-ink-subtle',
            )}
          >
            {positive ? (
              <TrendingUp className="size-3.5" />
            ) : negative ? (
              <TrendingDown className="size-3.5" />
            ) : null}
            {formatPercent(deltaPct)}
          </span>
        ) : null}
        {sublabel ? <span className="text-ink-subtle">{sublabel}</span> : null}
      </div>
    </Card>
  );
}
