'use client';

import {
  OrderStatus,
  ORDER_STATUS_CUSTOMER_MESSAGE_FA,
  RealtimeEvent,
  type OrderTrackingDto,
} from '@restaurant-os/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  CircleAlert,
  Clock,
  Phone,
  Radio,
  ReceiptText,
  UtensilsCrossed,
} from 'lucide-react';
import { useCallback } from 'react';
import { Badge, Card, EmptyState, Skeleton } from '@/components/ui';
import { useRealtime } from '@/hooks/use-realtime';
import { cn } from '@/lib/cn';
import { formatMoney, formatTimeFa, toPersianDigits } from '@/lib/format';
import { publicService } from '@/services';
import { FeedbackCard } from './feedback-card';

/**
 * Customer order tracking.
 *
 * The page is driven by a websocket bound to this order alone. Polling stays
 * on as a fallback so the timeline still advances on a flaky mobile connection
 * or behind a proxy that blocks upgrades.
 */
export function TrackingView({ token }: { token: string }) {
  const queryClient = useQueryClient();

  const trackingQuery = useQuery({
    queryKey: ['tracking', token],
    queryFn: () => publicService.track(token),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      // Stop polling once the order can no longer change.
      if (status === OrderStatus.COMPLETED || status === OrderStatus.CANCELLED) {
        return false;
      }
      return 15_000;
    },
  });

  const notificationsQuery = useQuery({
    queryKey: ['tracking-notifications', token],
    queryFn: () => publicService.trackNotifications(token),
    refetchInterval: 30_000,
  });

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['tracking', token] });
    void queryClient.invalidateQueries({ queryKey: ['tracking-notifications', token] });
  }, [queryClient, token]);

  const connection = useRealtime({
    trackingToken: token,
    handlers: {
      [RealtimeEvent.ORDER_STATUS_CHANGED]: invalidate,
      [RealtimeEvent.ORDER_UPDATED]: invalidate,
      [RealtimeEvent.PAYMENT_UPDATED]: invalidate,
      [RealtimeEvent.NOTIFICATION_CREATED]: invalidate,
    },
  });

  if (trackingQuery.isPending) {
    return (
      <main className="mx-auto min-h-dvh max-w-2xl px-4 py-8">
        <Skeleton className="h-8 w-40" />
        <div className="mt-6 space-y-4">
          <Skeleton className="h-56 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      </main>
    );
  }

  if (trackingQuery.isError || !trackingQuery.data) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-4">
        <EmptyState
          icon={<CircleAlert className="size-6" />}
          title="سفارش یافت نشد"
          description="لینک پیگیری معتبر نیست یا منقضی شده است. لطفاً از رستوران کمک بگیرید."
        />
      </main>
    );
  }

  const order = trackingQuery.data;
  const isCancelled = order.status === OrderStatus.CANCELLED;

  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-4 py-6 pb-16">
      <header className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm text-ink-muted">{order.restaurantName}</p>
            <h1 className="mt-0.5 text-2xl font-bold text-ink">
              سفارش #{toPersianDigits(order.orderNumber)}
            </h1>
          </div>
          <ConnectionPill state={connection} />
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {order.tableNumber != null ? (
            <Badge tone="gold" dot>
              میز {toPersianDigits(order.tableNumber)}
            </Badge>
          ) : (
            <Badge tone="gold" dot>
              بیرون‌بر
            </Badge>
          )}
          <Badge tone={order.paymentStatus === 'PAID' ? 'positive' : 'caution'}>
            {order.paymentStatus === 'PAID' ? 'پرداخت شده' : 'پرداخت نشده'}
          </Badge>
        </div>
      </header>

      {/* Current status banner */}
      <div
        className={cn(
          'mb-6 rounded-2xl border p-5',
          isCancelled
            ? 'border-critical/30 bg-critical/[0.08]'
            : 'border-gold/30 bg-gold/[0.07]',
        )}
      >
        <p
          className={cn(
            'text-base font-semibold',
            isCancelled ? 'text-critical' : 'text-gold-bright',
          )}
        >
          {ORDER_STATUS_CUSTOMER_MESSAGE_FA[order.status]}
        </p>
        {!isCancelled && order.estimatedReadyAt ? (
          <p className="mt-1.5 flex items-center gap-1.5 text-sm text-ink-muted">
            <Clock className="size-3.5" />
            زمان تقریبی آماده شدن: {formatTimeFa(order.estimatedReadyAt)}
          </p>
        ) : null}
      </div>

      {!isCancelled ? <Timeline steps={order.steps} /> : null}

      <OrderItemsCard order={order} />

      {!isCancelled ? <FeedbackCard token={token} status={order.status} /> : null}

      {order.branchPhone ? (
        <a
          href={`tel:${order.branchPhone}`}
          className="mt-4 flex items-center justify-center gap-2 rounded-2xl border border-line bg-surface p-4 text-sm text-ink-muted transition-colors hover:text-ink"
        >
          <Phone className="size-4" />
          تماس با رستوران
          <span className="ltr-nums">{toPersianDigits(order.branchPhone)}</span>
        </a>
      ) : null}

      {notificationsQuery.data && notificationsQuery.data.length > 0 ? (
        <Card className="mt-4">
          <div className="border-b border-line px-5 py-3.5">
            <h2 className="text-sm font-semibold text-ink">اطلاع‌رسانی‌ها</h2>
          </div>
          <ul className="divide-y divide-line">
            {notificationsQuery.data.slice(0, 8).map((notification) => (
              <li key={notification.id} className="flex gap-3 px-5 py-3">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-gold" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink">{notification.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
                    {notification.body}
                  </p>
                </div>
                <time className="shrink-0 text-xs text-ink-subtle">
                  {formatTimeFa(notification.createdAt)}
                </time>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </main>
  );
}

function Timeline({ steps }: { steps: OrderTrackingDto['steps'] }) {
  return (
    <ol className="mb-6 space-y-0" aria-label="مراحل سفارش">
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        return (
          <li key={step.status} className="flex gap-4">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                  step.isComplete && 'border-positive bg-positive text-ink-inverse',
                  step.isCurrent && 'animate-pulse-ring border-gold bg-gold text-ink-inverse',
                  !step.isComplete && !step.isCurrent && 'border-line bg-surface',
                )}
              >
                {step.isComplete ? (
                  <Check className="size-4" strokeWidth={3} />
                ) : (
                  <span
                    className={cn(
                      'size-2 rounded-full',
                      step.isCurrent ? 'bg-ink-inverse' : 'bg-ink-subtle',
                    )}
                  />
                )}
              </span>
              {!isLast ? (
                <span
                  className={cn(
                    'w-0.5 flex-1 transition-colors',
                    step.isComplete ? 'bg-positive' : 'bg-line',
                  )}
                  style={{ minHeight: '1.75rem' }}
                />
              ) : null}
            </div>

            <div className={cn('pb-6', isLast && 'pb-0')}>
              <p
                className={cn(
                  'text-sm font-medium',
                  step.isCurrent
                    ? 'text-gold'
                    : step.isComplete
                      ? 'text-ink'
                      : 'text-ink-subtle',
                )}
              >
                {step.label}
              </p>
              {step.reachedAt ? (
                <time className="text-xs text-ink-subtle">
                  {formatTimeFa(step.reachedAt)}
                </time>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function OrderItemsCard({ order }: { order: OrderTrackingDto }) {
  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-line px-5 py-3.5">
        <ReceiptText className="size-4 text-ink-muted" />
        <h2 className="text-sm font-semibold text-ink">اقلام سفارش</h2>
      </div>

      <ul className="divide-y divide-line">
        {order.items.map((item, index) => (
          <li key={index} className="flex items-start gap-3 px-5 py-3">
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-surface-raised text-xs font-semibold tabular-nums text-ink-muted">
              {toPersianDigits(item.quantity)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-ink">{item.productNameFa}</p>
              {item.modifiers.length > 0 ? (
                <p className="mt-0.5 text-xs text-ink-muted">
                  {item.modifiers.join('، ')}
                </p>
              ) : null}
            </div>
            <span className="shrink-0 text-sm text-ink-muted">
              {formatMoney(item.lineTotal, order.currency, { withUnit: false })}
            </span>
          </li>
        ))}
      </ul>

      <dl className="space-y-2 border-t border-line px-5 py-4 text-sm">
        <Row label="جمع اقلام" value={formatMoney(order.subtotal, order.currency)} />
        {order.discountTotal > 0 ? (
          <Row
            label="تخفیف"
            value={`- ${formatMoney(order.discountTotal, order.currency)}`}
            tone="positive"
          />
        ) : null}
        {order.serviceChargeTotal > 0 ? (
          <Row
            label="حق سرویس"
            value={formatMoney(order.serviceChargeTotal, order.currency)}
          />
        ) : null}
        {order.taxTotal > 0 ? (
          <Row label="مالیات بر ارزش افزوده" value={formatMoney(order.taxTotal, order.currency)} />
        ) : null}
        <div className="flex items-center justify-between border-t border-line pt-3">
          <dt className="font-semibold text-ink">مبلغ قابل پرداخت</dt>
          <dd className="text-lg font-bold text-gold">
            {formatMoney(order.total, order.currency)}
          </dd>
        </div>
      </dl>
    </Card>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'positive';
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-ink-muted">{label}</dt>
      <dd className={tone === 'positive' ? 'text-positive' : 'text-ink'}>{value}</dd>
    </div>
  );
}

/** Live / reconnecting indicator, so a stalled feed is never silent. */
function ConnectionPill({ state }: { state: 'connecting' | 'live' | 'offline' }) {
  const config = {
    live: { tone: 'positive' as const, label: 'به‌روزرسانی زنده' },
    connecting: { tone: 'caution' as const, label: 'در حال اتصال' },
    offline: { tone: 'neutral' as const, label: 'به‌روزرسانی دوره‌ای' },
  }[state];

  return (
    <Badge tone={config.tone} className="shrink-0">
      <Radio className="size-3" />
      {config.label}
    </Badge>
  );
}
