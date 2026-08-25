import { Loader2 } from 'lucide-react';
import { type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Spinner({ className }: { className?: string }) {
  return (
    <Loader2
      className={cn('size-5 animate-spin text-ink-muted', className)}
      aria-label="در حال بارگذاری"
    />
  );
}

/** Skeleton block. Every list and card uses these instead of a "Loading..." string. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton h-4 w-full', className)} aria-hidden />;
}

export function SkeletonList({
  rows = 4,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn('space-y-3', className)} aria-busy>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-3">
          <Skeleton className="size-11 shrink-0 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <Skeleton className="h-3.5 w-20 shrink-0" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonCards({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="glass space-y-3 rounded-2xl p-5">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
      ))}
    </div>
  );
}

/** Polished empty state - no screen is ever left blank. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center px-6 py-14 text-center',
        className,
      )}
    >
      {icon ? (
        <div className="mb-4 flex size-14 items-center justify-center rounded-2xl border border-line bg-surface-raised text-ink-subtle">
          {icon}
        </div>
      ) : null}
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {description ? (
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-ink-muted">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = 'خطا در دریافت اطلاعات',
  description,
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <EmptyState
      title={title}
      description={description ?? 'لطفاً دوباره تلاش کنید.'}
      action={
        onRetry ? (
          <button
            onClick={onRetry}
            className="rounded-xl border border-line-strong px-4 py-2 text-sm text-ink hover:bg-surface-raised"
          >
            تلاش دوباره
          </button>
        ) : null
      }
    />
  );
}
