'use client';

import {
  ORDER_TYPE_LABELS_FA,
  PAYMENT_METHOD_LABELS_FA,
  RealtimeEvent,
} from '@restaurant-os/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChefHat,
  ClipboardList,
  Receipt,
  Table2,
  TrendingUp,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback } from 'react';
import {
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  OrderStatusBadge,
  SkeletonCards,
  Skeleton,
} from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { BreakdownDonut, HourlyBarChart, SalesAreaChart } from '@/features/admin/charts';
import { StatCard } from '@/features/admin/stat-card';
import { useRealtime } from '@/hooks/use-realtime';
import {
  formatMoney,
  formatMoneyCompact,
  formatRelativeFa,
  toPersianDigits,
} from '@/lib/format';
import { reportService } from '@/services';

export default function DashboardPage() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  const dashboardQuery = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => reportService.dashboard(),
    // Realtime drives most updates; this is the safety net.
    refetchInterval: 60_000,
  });

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  }, [queryClient]);

  useRealtime({
    token: accessToken,
    handlers: {
      [RealtimeEvent.ORDER_CREATED]: refresh,
      [RealtimeEvent.ORDER_STATUS_CHANGED]: refresh,
      [RealtimeEvent.PAYMENT_UPDATED]: refresh,
      [RealtimeEvent.TABLE_UPDATED]: refresh,
    },
  });

  if (dashboardQuery.isPending) {
    return (
      <div className="space-y-5">
        <SkeletonCards />
        <div className="grid gap-5 lg:grid-cols-3">
          <Skeleton className="h-80 rounded-2xl lg:col-span-2" />
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (dashboardQuery.isError || !dashboardQuery.data) {
    return <ErrorState onRetry={() => dashboardQuery.refetch()} />;
  }

  const data = dashboardQuery.data;

  return (
    <div className="space-y-5">
      {/* Desktop: 4 columns. Tablet: 2. Mobile: single-column stack. */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="فروش امروز"
          value={formatMoneyCompact(data.today.grossSales)}
          icon={TrendingUp}
          deltaPct={data.yesterdayComparison.grossSalesDeltaPct}
          sublabel="نسبت به دیروز"
          accent
        />
        <StatCard
          label="سفارش‌های امروز"
          value={toPersianDigits(data.today.orderCount)}
          icon={ClipboardList}
          deltaPct={data.yesterdayComparison.orderCountDeltaPct}
          sublabel="نسبت به دیروز"
        />
        <StatCard
          label="میانگین سفارش"
          value={formatMoneyCompact(data.today.averageOrderValue)}
          icon={Receipt}
          sublabel="ارزش هر سفارش"
        />
        <StatCard
          label="میزهای فعال"
          value={`${toPersianDigits(data.activeTables.occupied)} / ${toPersianDigits(
            data.activeTables.total,
          )}`}
          icon={Table2}
          sublabel={`${toPersianDigits(data.kitchenQueueCount)} سفارش در آشپزخانه`}
        />
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="فروش ۱۴ روز اخیر"
            description="مجموع فروش پرداخت‌شده به تفکیک روز"
          />
          <CardBody className="pt-2">
            <SalesAreaChart data={data.dailySeries} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="سفارش‌های جاری" description="در حال انجام روی سالن" />
          <CardBody className="p-0">
            {data.liveOrders.length === 0 ? (
              <EmptyState
                icon={<UtensilsCrossed className="size-5" />}
                title="سفارش بازی نیست"
                description="همه سفارش‌ها تکمیل شده‌اند."
              />
            ) : (
              <ul className="divide-y divide-line">
                {data.liveOrders.map((order) => (
                  <li key={order.id}>
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-raised"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-ink">
                          #{toPersianDigits(order.orderNumber)}
                          <span className="ms-2 text-xs font-normal text-ink-subtle">
                            {order.table
                              ? `میز ${toPersianDigits(order.table.number)}`
                              : (order.customerName ?? 'بیرون‌بر')}
                          </span>
                        </p>
                        <p className="mt-1 text-xs text-ink-subtle">
                          {toPersianDigits(order.itemCount)} قلم •{' '}
                          {formatRelativeFa(order.createdAt)}
                        </p>
                      </div>
                      <div className="shrink-0 text-end">
                        <OrderStatusBadge status={order.status} />
                        <p className="mt-1 text-xs text-ink-muted">
                          {formatMoney(order.total, 'IRT', { withUnit: false })}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="فروش ساعتی امروز" description="اوج شلوغی در طول روز" />
          <CardBody className="pt-2">
            <HourlyBarChart data={data.hourlySeries} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="پرفروش‌ترین محصولات" description="بر اساس تعداد فروش امروز" />
          <CardBody className="p-0">
            {data.topProducts.length === 0 ? (
              <EmptyState
                icon={<ChefHat className="size-5" />}
                title="هنوز فروشی ثبت نشده"
                description="پس از اولین سفارش امروز، پرفروش‌ها اینجا نمایش داده می‌شوند."
              />
            ) : (
              <ol className="divide-y divide-line">
                {data.topProducts.map((product, index) => (
                  <li
                    key={product.productId || product.nameFa}
                    className="flex items-center gap-3 px-5 py-3"
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-surface-raised text-xs font-semibold text-ink-muted">
                      {toPersianDigits(index + 1)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-ink">{product.nameFa}</p>
                      <p className="text-xs text-ink-subtle">{product.categoryNameFa}</p>
                    </div>
                    <div className="shrink-0 text-end">
                      <p className="text-sm font-medium text-ink">
                        {toPersianDigits(product.quantity)} عدد
                      </p>
                      <p className="text-xs text-ink-subtle">
                        {formatMoney(product.total, 'IRT', { withUnit: false })}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardBody>
        </Card>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader title="روش پرداخت" description="سهم هر روش از فروش امروز" />
          <CardBody>
            <BreakdownDonut
              data={data.paymentBreakdown.map((entry) => ({
                label: PAYMENT_METHOD_LABELS_FA[entry.method],
                value: entry.total,
              }))}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="نوع سفارش" description="سرو در محل در برابر بیرون‌بر" />
          <CardBody>
            <BreakdownDonut
              data={data.orderTypeBreakdown.map((entry) => ({
                label: ORDER_TYPE_LABELS_FA[entry.type],
                value: entry.total,
              }))}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="محصولات ناموجود"
            description="اقلامی که در منو غیرفعال شده‌اند"
          />
          <CardBody className="p-0">
            {data.unavailableProducts.length === 0 ? (
              <EmptyState
                icon={<Wallet className="size-5" />}
                title="همه محصولات موجودند"
                description="هیچ محصولی در حال حاضر ناموجود علامت نخورده است."
              />
            ) : (
              <ul className="divide-y divide-line">
                {data.unavailableProducts.map((product) => (
                  <li
                    key={product.id}
                    className="flex items-center justify-between px-5 py-3 text-sm"
                  >
                    <span className="text-ink">{product.nameFa}</span>
                    <span className="text-xs text-caution">ناموجود</span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </section>
    </div>
  );
}
