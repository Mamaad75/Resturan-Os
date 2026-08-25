'use client';

import {
  OrderStatus,
  ORDER_TRANSITION_ACTION_FA,
  RealtimeEvent,
  type OrderSummaryDto,
} from '@restaurant-os/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, ChefHat, Clock, Radio, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, EmptyState, Skeleton, useToast } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { useRealtime } from '@/hooks/use-realtime';
import { ApiError } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { elapsedMinutes, formatElapsedFa, toPersianDigits } from '@/lib/format';
import { orderService } from '@/services';

/** Three columns mirroring how a kitchen actually works a ticket rail. */
const COLUMNS = [
  {
    id: 'new',
    title: 'جدید',
    statuses: [OrderStatus.SENT_TO_KITCHEN],
    accent: 'border-info/40 bg-info/[0.06]',
    headerAccent: 'text-info',
  },
  {
    id: 'preparing',
    title: 'در حال آماده‌سازی',
    statuses: [OrderStatus.PREPARING],
    accent: 'border-gold/40 bg-gold/[0.06]',
    headerAccent: 'text-gold',
  },
  {
    id: 'ready',
    title: 'آماده',
    statuses: [OrderStatus.READY, OrderStatus.READY_FOR_PICKUP],
    accent: 'border-positive/40 bg-positive/[0.06]',
    headerAccent: 'text-positive',
  },
] as const;

export default function KitchenDisplayPage() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  // Re-render once a minute so the elapsed timers stay honest.
  const [, setTick] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const queueQuery = useQuery({
    queryKey: ['kitchen-queue'],
    queryFn: () => orderService.kitchenQueue(),
    refetchInterval: 30_000,
  });

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['kitchen-queue'] });
  }, [queryClient]);

  const connection = useRealtime({
    token: accessToken,
    handlers: {
      [RealtimeEvent.ORDER_CREATED]: refresh,
      [RealtimeEvent.ORDER_STATUS_CHANGED]: refresh,
      [RealtimeEvent.ORDER_UPDATED]: refresh,
    },
  });

  const advance = useMutation({
    mutationFn: ({ id, status }: { id: string; status: OrderStatus }) =>
      orderService.updateStatus(id, status),
    onSuccess: () => refresh(),
    onError: (error) => {
      toast.error(
        'تغییر وضعیت انجام نشد',
        error instanceof ApiError ? error.message : undefined,
      );
      refresh();
    },
  });

  const orders = queueQuery.data ?? [];

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center gap-4 border-b border-line bg-surface px-5 py-4">
        <Link
          href="/admin"
          className="flex items-center gap-2 text-ink-muted transition-colors hover:text-ink"
        >
          <ArrowRight className="size-5" />
          <span className="hidden sm:inline">بازگشت</span>
        </Link>

        <div className="flex items-center gap-2.5">
          <ChefHat className="size-6 text-gold" />
          <h1 className="text-xl font-bold text-ink sm:text-2xl">آشپزخانه</h1>
        </div>

        <div className="ms-auto flex items-center gap-3">
          <Badge
            tone={connection === 'live' ? 'positive' : 'caution'}
            className="hidden sm:inline-flex"
          >
            <Radio className="size-3" />
            {connection === 'live' ? 'زنده' : 'در حال اتصال'}
          </Badge>
          <span className="text-2xl font-bold tabular-nums text-gold">
            {toPersianDigits(orders.length)}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={refresh}
            aria-label="بارگذاری مجدد"
          >
            <RefreshCw className={cn('size-5', queueQuery.isFetching && 'animate-spin')} />
          </Button>
        </div>
      </header>

      <main className="flex-1 overflow-x-auto p-4">
        {queueQuery.isPending ? (
          <div className="grid gap-4 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-72 rounded-2xl" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <EmptyState
            icon={<ChefHat className="size-7" />}
            title="سفارشی در صف نیست"
            description="سفارش‌های جدید به‌صورت خودکار و بدون نیاز به بارگذاری مجدد اینجا ظاهر می‌شوند."
            className="py-24"
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            {COLUMNS.map((column) => {
              const columnOrders = orders.filter((order) =>
                (column.statuses as readonly OrderStatus[]).includes(order.status),
              );
              return (
                <section
                  key={column.id}
                  className={cn('rounded-2xl border p-3', column.accent)}
                  aria-label={column.title}
                >
                  <h2
                    className={cn(
                      'mb-3 flex items-center justify-between px-1 text-lg font-bold',
                      column.headerAccent,
                    )}
                  >
                    {column.title}
                    <span className="tabular-nums">
                      {toPersianDigits(columnOrders.length)}
                    </span>
                  </h2>

                  <div className="space-y-3">
                    {columnOrders.length === 0 ? (
                      <p className="py-8 text-center text-sm text-ink-subtle">
                        خالی
                      </p>
                    ) : (
                      columnOrders.map((order) => (
                        <TicketCard
                          key={order.id}
                          order={order}
                          onAdvance={(status) => advance.mutate({ id: order.id, status })}
                          pending={
                            advance.isPending && advance.variables?.id === order.id
                          }
                        />
                      ))
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

function TicketCard({
  order,
  onAdvance,
  pending,
}: {
  order: OrderSummaryDto;
  onAdvance: (status: OrderStatus) => void;
  pending: boolean;
}) {
  const minutes = elapsedMinutes(order.createdAt);
  // Colour by age so a forgotten ticket is impossible to miss across a room.
  const urgency =
    minutes >= 25 ? 'critical' : minutes >= 15 ? 'caution' : 'neutral';

  // The next forward step, taken straight from the server's own state machine.
  const nextStatus = order.allowedTransitions.find(
    (status) => status !== OrderStatus.CANCELLED,
  );

  return (
    <article
      className={cn(
        'rounded-2xl border-2 bg-surface p-4 shadow-panel transition-colors',
        urgency === 'critical' && 'border-critical/60',
        urgency === 'caution' && 'border-caution/50',
        urgency === 'neutral' && 'border-line',
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-2xl font-bold tabular-nums text-ink">
            #{toPersianDigits(order.orderNumber)}
          </p>
          <p className="mt-0.5 text-sm text-ink-muted">
            {order.table
              ? `میز ${toPersianDigits(order.table.number)}`
              : `بیرون‌بر • ${order.customerName ?? 'مهمان'}`}
          </p>
        </div>

        <span
          className={cn(
            'flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-bold tabular-nums',
            urgency === 'critical' && 'bg-critical/15 text-critical',
            urgency === 'caution' && 'bg-caution/15 text-caution',
            urgency === 'neutral' && 'bg-surface-raised text-ink-muted',
          )}
        >
          <Clock className="size-3.5" />
          {formatElapsedFa(order.createdAt)}
        </span>
      </header>

      <ul className="my-4 space-y-2.5">
        {order.items.map((item) => (
          <li key={item.id} className="flex gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gold/15 text-base font-bold tabular-nums text-gold">
              {toPersianDigits(item.quantity)}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-base font-medium leading-snug text-ink">
                {item.productNameFa}
              </p>
              {item.modifiers.length > 0 ? (
                <p className="mt-0.5 text-sm text-ink-muted">
                  {item.modifiers.join('، ')}
                </p>
              ) : null}
              {item.notes ? (
                <p className="mt-1 rounded-md bg-caution/12 px-2 py-1 text-sm font-medium text-caution">
                  {item.notes}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {order.notes ? (
        <p className="mb-3 rounded-lg bg-caution/12 px-3 py-2 text-sm text-caution">
          یادداشت سفارش: {order.notes}
        </p>
      ) : null}

      {nextStatus ? (
        <Button
          variant="primary"
          size="xl"
          fullWidth
          loading={pending}
          onClick={() => onAdvance(nextStatus)}
        >
          {ORDER_TRANSITION_ACTION_FA[nextStatus]}
        </Button>
      ) : null}
    </article>
  );
}
