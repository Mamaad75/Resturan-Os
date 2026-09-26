'use client';

import { RealtimeEvent, type NotificationDto } from '@restaurant-os/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, EmptyState, useToast } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { useAlertSound } from '@/hooks/use-alert-sound';
import { useRealtime } from '@/hooks/use-realtime';
import { cn } from '@/lib/cn';
import { formatRelativeFa, toPersianDigits } from '@/lib/format';
import { notificationService } from '@/services';

export function NotificationBell() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const playAlert = useAlertSound(true);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const notificationsQuery = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationService.list({ pageSize: 15 }),
    refetchInterval: 60_000,
  });

  const markRead = useMutation({
    mutationFn: () => notificationService.markRead({ all: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markOneRead = useMutation({
    mutationFn: (id: string) => notificationService.markRead({ ids: [id] }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const onNotification = useCallback((payload: unknown) => {
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });

    const notification = payload as Partial<NotificationDto>;
    // WaiterCallBar owns the waiter-call alert path (sound + escalation toast),
    // so do not double-ring for the same call. Every other operational event
    // rings immediately while the staff panel is open.
    if (notification.type !== 'WAITER_CALLED') {
      playAlert();
      if (notification.title) {
        toast.toast({
          tone: notification.type === 'ORDER_CANCELLED' ? 'error' : 'info',
          title: notification.title,
          description: notification.body,
          durationMs: 8_000,
        });
      }
    }
  }, [queryClient, playAlert, toast]);

  useRealtime({
    token: accessToken,
    handlers: { [RealtimeEvent.NOTIFICATION_CREATED]: onNotification },
  });

  // Dismiss on outside click.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const unread = notificationsQuery.data?.meta.unread ?? 0;
  const items = notificationsQuery.data?.items ?? [];

  return (
    <div className="relative" ref={panelRef}>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen((v) => !v)}
        aria-label={`اعلان‌ها${unread ? ` (${unread} خوانده‌نشده)` : ''}`}
        aria-expanded={open}
      >
        <Bell className="size-5" />
        {unread > 0 ? (
          <span className="absolute end-1.5 top-1.5 flex min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[0.6rem] font-bold text-ink-inverse">
            {toPersianDigits(unread > 99 ? '۹۹+' : unread)}
          </span>
        ) : null}
      </Button>

      {open ? (
        <div className="absolute end-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line bg-surface shadow-lifted animate-scale-in">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">اعلان‌ها</h2>
            {unread > 0 ? (
              <button
                onClick={() => markRead.mutate()}
                disabled={markRead.isPending}
                className="flex items-center gap-1.5 text-xs text-brand hover:text-brand-bright disabled:opacity-50"
              >
                <CheckCheck className="size-3.5" />
                خواندن همه
              </button>
            ) : null}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <EmptyState
                icon={<Bell className="size-5" />}
                title="اعلانی وجود ندارد"
                description="اعلان‌های سفارش‌ها و پرداخت‌ها اینجا نمایش داده می‌شوند."
                className="py-10"
              />
            ) : (
              <ul className="divide-y divide-line">
                {items.map((notification) => (
                  <li key={notification.id}>
                    <Link
                      href={notification.url || '/admin'}
                      onClick={() => {
                        setOpen(false);
                        if (!notification.readAt) markOneRead.mutate(notification.id);
                      }}
                      className={cn(
                        'flex gap-3 px-4 py-3 transition-colors hover:bg-surface-hover',
                        !notification.readAt && 'bg-brand/[0.04]',
                      )}
                    >
                      <span
                        className={cn(
                          'mt-1.5 size-1.5 shrink-0 rounded-full',
                          notification.readAt ? 'bg-line-strong' : 'bg-brand',
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-ink">{notification.title}</p>
                        <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-ink-muted">
                          {notification.body}
                        </p>
                        <time className="mt-1 block text-[0.7rem] text-ink-subtle">
                          {formatRelativeFa(notification.createdAt)}
                        </time>
                      </div>
                      <ChevronLeft className="mt-2 size-4 shrink-0 text-ink-subtle" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
