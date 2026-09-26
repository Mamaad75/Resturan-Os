'use client';

import { useQuery } from '@tanstack/react-query';
import { CalendarDays } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/cn';
import { publicEventService } from '@/services';

function faDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('fa-IR', { month: 'long', day: 'numeric' }).format(
      new Date(iso),
    );
  } catch {
    return '';
  }
}

/**
 * Upcoming events for this restaurant, shown on the public landing page. The
 * API already returns only active events; we additionally drop ones that have
 * clearly ended so the rail stays forward-looking. Renders nothing when there
 * is nothing to show, so it never leaves an empty heading behind.
 */
export function EventsRail({
  slug,
  headingClassName,
}: {
  slug: string;
  headingClassName?: string;
}) {
  const query = useQuery({
    queryKey: ['public-events', slug],
    queryFn: () => publicEventService.list(slug),
    staleTime: 60_000,
  });

  const now = Date.now();
  const events = (query.data?.events ?? []).filter((e) =>
    e.endsAt ? new Date(e.endsAt).getTime() >= now : true,
  );
  if (events.length === 0) return null;

  return (
    <section className="pt-[var(--menu-section-gap)]" aria-labelledby="events-heading">
      <h2
        id="events-heading"
        className={cn('flex items-center gap-2', headingClassName)}
      >
        <CalendarDays className="size-4 text-brand" />
        رویدادها
      </h2>
      <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-2">
        {events.map((event) => (
          <Link
            key={event.id}
            href={`/r/${slug}/e/${event.slug}`}
            className="group w-56 shrink-0 overflow-hidden rounded-[var(--menu-radius)] border border-line bg-surface transition-colors hover:border-brand/40"
          >
            <div className="relative aspect-[16/9] bg-surface-sunken">
              {event.coverUrl ? (
                <Image
                  src={event.coverUrl}
                  alt={event.title}
                  fill
                  sizes="224px"
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-brand/40">
                  <CalendarDays className="size-8" />
                </div>
              )}
            </div>
            <div className="p-3">
              <p className="truncate text-sm font-medium text-ink">{event.title}</p>
              <p className="mt-1 flex items-center gap-1 text-xs text-ink-subtle">
                <CalendarDays className="size-3" />
                {faDate(event.startsAt)}
                {event.rsvpEnabled ? (
                  <span className="ms-auto rounded-md bg-brand/10 px-1.5 py-0.5 text-[0.65rem] text-brand">
                    ثبت‌نام
                  </span>
                ) : null}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
