'use client';

import {
  OrderStatus,
  RealtimeEvent,
} from '@restaurant-os/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Search } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useState } from 'react';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  OrderStatusBadge,
  OrderTypeBadge,
  PaymentStatusBadge,
  SegmentedControl,
  SkeletonList,
} from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { useRealtime } from '@/hooks/use-realtime';
import { formatMoney, formatRelativeFa, toPersianDigits } from '@/lib/format';
import { orderService } from '@/services';

const FILTERS = [
  { id: 'active', label: 'جاری' },
  { id: 'all', label: 'همه' },
  { id: OrderStatus.SENT_TO_KITCHEN, label: 'آشپزخانه' },
  { id: OrderStatus.READY, label: 'آماده' },
  { id: OrderStatus.COMPLETED, label: 'تکمیل‌شده' },
  { id: OrderStatus.CANCELLED, label: 'لغو‌شده' },
];

export default function OrdersPage() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState('active');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const ordersQuery = useQuery({
    queryKey: ['orders', filter, search, page],
    queryFn: () =>
      orderService.list({
        page,
        pageSize: 20,
        search: search.trim() || undefined,
        ...(filter === 'active'
          ? { activeOnly: true }
          : filter === 'all'
            ? {}
            : { status: filter }),
      }),
    refetchInterval: 45_000,
  });

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['orders'] });
  }, [queryClient]);

  useRealtime({
    token: accessToken,
    handlers: {
      [RealtimeEvent.ORDER_CREATED]: refresh,
      [RealtimeEvent.ORDER_STATUS_CHANGED]: refresh,
      [RealtimeEvent.PAYMENT_UPDATED]: refresh,
    },
  });

  const orders = ordersQuery.data?.items ?? [];
  const meta = ordersQuery.data?.meta;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SegmentedControl
          items={FILTERS}
          activeId={filter}
          onChange={(id) => {
            setFilter(id);
            setPage(1);
          }}
        />
        <Input
          placeholder="شماره سفارش، نام یا موبایل"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          leftAddon={<Search className="size-4" />}
          containerClassName="sm:w-72"
        />
      </div>

      <Card>
        {ordersQuery.isPending ? (
          <div className="p-5">
            <SkeletonList rows={6} />
          </div>
        ) : ordersQuery.isError ? (
          <ErrorState onRetry={() => ordersQuery.refetch()} />
        ) : orders.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="size-6" />}
            title={search ? 'سفارشی پیدا نشد' : 'سفارشی وجود ندارد'}
            description={
              search
                ? `نتیجه‌ای برای «${search}» یافت نشد.`
                : 'سفارش‌های جدید به‌محض ثبت اینجا نمایش داده می‌شوند.'
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {orders.map((order) => (
              <li key={order.id}>
                <Link
                  href={`/admin/orders/${order.id}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 transition-colors hover:bg-surface-raised sm:px-5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold tabular-nums text-ink">
                        #{toPersianDigits(order.orderNumber)}
                      </span>
                      <OrderTypeBadge type={order.type} />
                    </div>
                    <p className="mt-1 truncate text-sm text-ink-muted">
                      {order.table
                        ? `میز ${toPersianDigits(order.table.number)}`
                        : (order.customerName ?? 'مهمان')}
                      <span className="mx-1.5 text-ink-subtle">•</span>
                      {toPersianDigits(order.itemCount)} قلم
                      <span className="mx-1.5 text-ink-subtle">•</span>
                      {formatRelativeFa(order.createdAt)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <OrderStatusBadge status={order.status} />
                    <PaymentStatusBadge status={order.paymentStatus} />
                  </div>

                  <span className="w-28 shrink-0 text-end font-semibold tabular-nums text-ink">
                    {formatMoney(order.total, 'IRT', { withUnit: false })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {meta && meta.totalPages > 1 ? (
        <div className="flex items-center justify-between">
          <Button
            variant="secondary"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            قبلی
          </Button>
          <span className="text-sm text-ink-muted">
            صفحه {toPersianDigits(meta.page)} از {toPersianDigits(meta.totalPages)}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={page >= meta.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            بعدی
          </Button>
        </div>
      ) : null}
    </div>
  );
}
