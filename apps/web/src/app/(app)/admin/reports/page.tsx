'use client';

import {
  ORDER_TYPE_LABELS_FA,
  PAYMENT_METHOD_LABELS_FA,
} from '@restaurant-os/types';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Clock, Receipt, TrendingUp, Wallet } from 'lucide-react';
import { useState } from 'react';
import {
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  SegmentedControl,
  Skeleton,
  SkeletonCards,
} from '@/components/ui';
import {
  BreakdownDonut,
  HourlyBarChart,
  SalesAreaChart,
} from '@/features/admin/charts';
import { StatCard } from '@/features/admin/stat-card';
import { formatMoney, formatMoneyCompact, toPersianDigits } from '@/lib/format';
import { reportService } from '@/services';

const PRESETS = [
  { id: 'today', label: 'امروز' },
  { id: 'yesterday', label: 'دیروز' },
  { id: 'week', label: '۷ روز' },
  { id: 'month', label: '۳۰ روز' },
];

export default function ReportsPage() {
  const [preset, setPreset] = useState('week');
  // Hour buckets only make sense inside a single day.
  const granularity = preset === 'today' || preset === 'yesterday' ? 'hour' : 'day';

  const reportQuery = useQuery({
    queryKey: ['sales-report', preset, granularity],
    queryFn: () => reportService.sales({ preset, granularity }),
  });

  if (reportQuery.isPending) {
    return (
      <div className="space-y-5">
        <SkeletonCards />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    );
  }

  if (reportQuery.isError || !reportQuery.data) {
    return <ErrorState onRetry={() => reportQuery.refetch()} />;
  }

  const report = reportQuery.data;
  const { totals } = report;

  return (
    <div className="space-y-5">
      <SegmentedControl items={PRESETS} activeId={preset} onChange={setPreset} />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="فروش ناخالص"
          value={formatMoneyCompact(totals.grossSales)}
          icon={TrendingUp}
          sublabel="مجموع سفارش‌های پرداخت‌شده"
          accent
        />
        <StatCard
          label="فروش خالص"
          value={formatMoneyCompact(totals.netSales)}
          icon={Wallet}
          sublabel="پس از کسر مالیات و حق سرویس"
        />
        <StatCard
          label="تعداد سفارش"
          value={toPersianDigits(totals.orderCount)}
          icon={Receipt}
          sublabel={`تخفیف: ${formatMoneyCompact(totals.discountTotal)}`}
        />
        <StatCard
          label="میانگین سفارش"
          value={formatMoneyCompact(totals.averageOrderValue)}
          icon={BarChart3}
          sublabel="ارزش هر سفارش"
        />
      </section>

      <Card>
        <CardHeader
          title="روند فروش"
          description={
            granularity === 'hour' ? 'به تفکیک ساعت' : 'به تفکیک روز (به وقت تهران)'
          }
        />
        <CardBody className="pt-2">
          <SalesAreaChart data={report.series} height={300} />
        </CardBody>
      </Card>

      <section className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="ساعت‌های اوج"
            description="مجموع فروش در هر ساعت از شبانه‌روز"
          />
          <CardBody className="pt-2">
            <HourlyBarChart data={report.peakHours} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="روش پرداخت" description="سهم هر روش از دریافتی‌ها" />
          <CardBody>
            <BreakdownDonut
              data={report.breakdown.byPaymentMethod.map((entry) => ({
                label: PAYMENT_METHOD_LABELS_FA[entry.method],
                value: entry.total,
              }))}
            />
          </CardBody>
        </Card>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="پرفروش‌ترین محصولات" description="بر اساس تعداد فروش" />
          <CardBody className="p-0">
            {report.topProducts.length === 0 ? (
              <EmptyState
                icon={<Clock className="size-5" />}
                title="داده‌ای در این بازه نیست"
                description="بازه دیگری را انتخاب کنید."
              />
            ) : (
              <ol className="divide-y divide-line">
                {report.topProducts.map((product, index) => (
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
                    <span className="shrink-0 text-sm text-ink-muted">
                      {toPersianDigits(product.quantity)} عدد
                    </span>
                    <span className="w-24 shrink-0 text-end text-sm font-medium tabular-nums text-ink">
                      {formatMoney(product.total, 'IRT', { withUnit: false })}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </CardBody>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="نوع سفارش" />
            <CardBody>
              <BreakdownDonut
                data={report.breakdown.byOrderType.map((entry) => ({
                  label: ORDER_TYPE_LABELS_FA[entry.type],
                  value: entry.total,
                }))}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="دسته‌بندی‌های برتر" />
            <CardBody className="p-0">
              {report.topCategories.length === 0 ? (
                <EmptyState title="داده‌ای نیست" />
              ) : (
                <ul className="divide-y divide-line">
                  {report.topCategories.map((category) => (
                    <li
                      key={category.categoryId || category.nameFa}
                      className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm"
                    >
                      <span className="text-ink">{category.nameFa}</span>
                      <span className="tabular-nums text-ink-muted">
                        {formatMoney(category.total, 'IRT', { withUnit: false })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </section>
    </div>
  );
}
