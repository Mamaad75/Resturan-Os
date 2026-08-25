'use client';

import { type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface TabItem {
  id: string;
  label: ReactNode;
  count?: number;
}

/** Underlined tab bar; scrolls horizontally rather than wrapping on mobile. */
export function Tabs({
  items,
  activeId,
  onChange,
  className,
}: {
  items: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        'no-scrollbar flex gap-1 overflow-x-auto border-b border-line',
        className,
      )}
    >
      {items.map((item) => {
        const isActive = item.id === activeId;
        return (
          <button
            key={item.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(item.id)}
            className={cn(
              'relative whitespace-nowrap px-4 py-3 text-sm font-medium transition-colors',
              isActive ? 'text-gold' : 'text-ink-muted hover:text-ink',
            )}
          >
            {item.label}
            {item.count !== undefined ? (
              <span
                className={cn(
                  'ms-2 rounded-full px-1.5 py-0.5 text-xs',
                  isActive ? 'bg-gold/15 text-gold' : 'bg-surface-raised text-ink-subtle',
                )}
              >
                {item.count}
              </span>
            ) : null}
            {isActive ? (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gold" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** Pill-style segmented control used for date-range presets. */
export function SegmentedControl({
  items,
  activeId,
  onChange,
  className,
}: {
  items: Array<{ id: string; label: string }>;
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'no-scrollbar inline-flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface-sunken p-1',
        className,
      )}
    >
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => onChange(item.id)}
          aria-pressed={item.id === activeId}
          className={cn(
            'whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors',
            item.id === activeId
              ? 'bg-gold text-ink-inverse'
              : 'text-ink-muted hover:bg-surface-raised hover:text-ink',
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
