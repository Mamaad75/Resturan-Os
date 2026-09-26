'use client';

import {
  ORDER_STATUS_LABELS_FA,
  ORDER_TRANSITION_ACTION_FA,
  OrderStatus,
  OrderType,
  Permission,
  getAllowedTransitions,
} from '@restaurant-os/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bike, Clock, MapPin, Phone, User } from 'lucide-react';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Select,
  Skeleton,
  useToast,
} from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { ThemeToggle } from '@/features/theme/theme-toggle';
import { ApiError } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { formatMoney, toPersianDigits } from '@/lib/format';
import { deliveryService, orderService, type DeliveryBoardOrder } from '@/services';

/**
 * The dispatch board.
 *
 * A courier opens this on their phone and sees only their own runs; the
 * counter sees the whole branch, including orders nobody has taken yet. Both
 * act through the same order state machine, so the buttons here can never
 * offer a move the API would reject.
 */
export default function DeliveryBoardPage() {
  const { user, can } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  const boardQuery = useQuery({
    queryKey: ['delivery-board'],
    queryFn: () => deliveryService.board(),
    // A kitchen-adjacent screen that is stale is worse than useless.
    refetchInterval: 15_000,
  });

  const couriersQuery = useQuery({
    queryKey: ['delivery-couriers'],
    queryFn: () => deliveryService.couriers(),
  });

  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: ['delivery-board'] });

  const onError = (error: unknown) =>
    toast.error('انجام نشد', error instanceof ApiError ? error.message : undefined);

  const advance = useMutation({
    mutationFn: ({ id, status }: { id: string; status: OrderStatus }) =>
      orderService.updateStatus(id, status),
    onSuccess: (_data, variables) => {
      toast.success(ORDER_STATUS_LABELS_FA[variables.status]);
      refresh();
    },
    onError,
  });

  const assign = useMutation({
    mutationFn: ({ id, courierId }: { id: string; courierId: string | null }) =>
      deliveryService.assignCourier(id, courierId),
    onSuccess: refresh,
    onError,
  });

  const canAssign = can(Permission.DELIVERY_DISPATCH) && couriersQuery.data;
  const isCourier = user?.role === 'COURIER';

  return (
    <div className="mx-auto max-w-3xl px-4 py-5">
      <header className="mb-4 flex items-center gap-3">
        <Bike className="size-5 text-brand" />
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold text-ink">ارسال با پیک</h1>
          <p className="text-xs text-ink-subtle">
            {isCourier ? 'سفارش‌های شما' : 'سفارش‌های در جریان این شعبه'}
          </p>
        </div>
        <ThemeToggle />
      </header>

      {boardQuery.isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
        </div>
      ) : boardQuery.isError ? (
        <ErrorState onRetry={() => boardQuery.refetch()} />
      ) : boardQuery.data.length === 0 ? (
        <EmptyState
          icon={<Bike className="size-6" />}
          title="سفارشی در جریان نیست"
          description={
            isCourier
              ? 'سفارشی به شما اختصاص داده نشده است.'
              : 'هیچ سفارش ارسالی در حال حاضر باز نیست.'
          }
        />
      ) : (
        <div className="space-y-3">
          {boardQuery.data.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              couriers={canAssign ? couriersQuery.data : undefined}
              onAssign={(courierId) => assign.mutate({ id: order.id, courierId })}
              onAdvance={(status) => advance.mutate({ id: order.id, status })}
              busy={advance.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function OrderCard({
  order,
  couriers,
  onAssign,
  onAdvance,
  busy,
}: {
  order: DeliveryBoardOrder;
  couriers?: Array<{ id: string; fullName: string }>;
  onAssign: (courierId: string | null) => void;
  onAdvance: (status: OrderStatus) => void;
  busy: boolean;
}) {
  // The same table the API enforces, so a button never offers an illegal move.
  const next = getAllowedTransitions(
    OrderType.DELIVERY,
    order.status as OrderStatus,
  ).filter((status) => status !== OrderStatus.CANCELLED);

  const waitingMinutes = Math.max(
    0,
    Math.round((Date.now() - new Date(order.createdAt).getTime()) / 60_000),
  );

  return (
    <article className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-bold text-ink">
            سفارش {toPersianDigits(order.orderNumber)}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-subtle">
            <Clock className="size-3" />
            {toPersianDigits(waitingMinutes)} دقیقه از ثبت
            {order.deliveryZone ? ` · ${order.deliveryZone.title}` : ''}
          </p>
        </div>
        <div className="text-end">
          <p className="font-bold tabular-nums text-brand">
            {formatMoney(order.total, 'IRT')}
          </p>
          <Badge tone={order.paymentStatus === 'PAID' ? 'positive' : 'caution'}>
            {order.paymentStatus === 'PAID' ? 'پرداخت شده' : 'پرداخت نشده'}
          </Badge>
        </div>
      </div>

      <div className="mt-3 space-y-1.5 text-sm">
        {order.deliveryAddress ? (
          <p className="flex gap-2 text-ink-muted">
            <MapPin className="mt-0.5 size-4 shrink-0 text-ink-subtle" />
            <span className="min-w-0 break-words">
              {order.deliveryAddress}
              {order.deliveryNotes ? (
                <span className="block text-xs text-ink-subtle">
                  {order.deliveryNotes}
                </span>
              ) : null}
            </span>
          </p>
        ) : null}
        <p className="flex items-center gap-2 text-ink-muted">
          <User className="size-4 shrink-0 text-ink-subtle" />
          {order.customerName ?? '—'}
        </p>
        {order.customerPhone ? (
          <a
            href={`tel:${order.customerPhone}`}
            dir="ltr"
            className="flex items-center gap-2 text-brand hover:text-brand-bright"
          >
            <Phone className="size-4 shrink-0" />
            {order.customerPhone}
          </a>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <Badge tone="info">{ORDER_STATUS_LABELS_FA[order.status as OrderStatus]}</Badge>

        {couriers ? (
          <Select
            aria-label="پیک"
            value={order.courier?.id ?? ''}
            onChange={(e) => onAssign(e.target.value || null)}
            containerClassName="w-40"
            options={[
              { value: '', label: 'بدون پیک' },
              ...couriers.map((courier) => ({
                value: courier.id,
                label: courier.fullName,
              })),
            ]}
          />
        ) : order.courier ? (
          <span className="text-xs text-ink-subtle">پیک: {order.courier.fullName}</span>
        ) : null}

        <div className={cn('flex flex-wrap gap-2', couriers && 'ms-auto')}>
          {next.map((status) => (
            <Button
              key={status}
              variant="primary"
              size="sm"
              loading={busy}
              onClick={() => onAdvance(status)}
            >
              {ORDER_TRANSITION_ACTION_FA[status]}
            </Button>
          ))}
        </div>
      </div>
    </article>
  );
}
