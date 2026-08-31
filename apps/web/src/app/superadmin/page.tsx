'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Building2,
  ClipboardList,
  MessageSquare,
  Store,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  ErrorState,
  Skeleton,
} from '@/components/ui';
import { PlatformShell } from '@/features/platform/platform-shell';
import { formatMoney, toPersianDigits } from '@/lib/format';
import { PLATFORM_ACTION_LABEL } from '@/features/platform/labels';
import { platformService } from '@/services';

export default function PlatformDashboardPage() {
  return (
    <PlatformShell>
      <DashboardContent />
    </PlatformShell>
  );
}

function DashboardContent() {
  const query = useQuery({
    queryKey: ['platform-dashboard'],
    queryFn: () => platformService.dashboard(),
    refetchInterval: 60_000,
  });

  if (query.isPending) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
    );
  }
  if (query.isError || !query.data) {
    return <ErrorState onRetry={() => query.refetch()} />;
  }

  const data = query.data;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          icon={<Building2 className="size-4" />}
          label="کسب‌وکارها"
          value={toPersianDigits(data.tenants.total)}
          hint={`${toPersianDigits(data.tenants.active)} فعال`}
        />
        <Tile
          icon={<TrendingUp className="size-4" />}
          label="درآمد ماهانه"
          value={formatMoney(data.revenue.monthlyRecurring, 'IRT', { withUnit: false })}
          hint="مجموع اشتراک‌های فعال"
        />
        <Tile
          icon={<ClipboardList className="size-4" />}
          label="سفارش‌ها"
          value={toPersianDigits(data.orders.total)}
          hint={`${toPersianDigits(data.orders.thisMonth)} این ماه`}
        />
        <Tile
          icon={<MessageSquare className="size-4" />}
          label="پیامک این ماه"
          value={toPersianDigits(data.sms.totalThisMonth)}
          hint={`${toPersianDigits(data.sms.marketingThisMonth)} تبلیغاتی`}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatusTile label="فعال" value={data.tenants.active} tone="positive" />
        <StatusTile label="آزمایشی" value={data.tenants.trial} tone="info" />
        <StatusTile label="مهلت تمدید" value={data.tenants.gracePeriod} tone="caution" />
        <StatusTile
          label="منقضی / معلق"
          value={data.tenants.expired + data.tenants.suspended}
          tone="critical"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="درآمد به تفکیک پلن" />
          <CardBody className="space-y-2">
            {data.revenue.byPlan.length === 0 ? (
              <p className="text-sm text-ink-subtle">هنوز اشتراک فعالی وجود ندارد.</p>
            ) : (
              data.revenue.byPlan.map((row) => (
                <div
                  key={row.planKey}
                  className="flex items-center justify-between rounded-xl border border-line px-3 py-2.5"
                >
                  <span className="text-sm text-ink">{row.planNameFa}</span>
                  <span className="text-xs text-ink-subtle">
                    {toPersianDigits(row.tenants)} کسب‌وکار
                  </span>
                  <span className="font-semibold tabular-nums text-gold">
                    {formatMoney(row.amount, 'IRT', { withUnit: false })}
                  </span>
                </div>
              ))
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="زیرساخت" />
          <CardBody>
            <div className="grid grid-cols-3 gap-3">
              <MiniStat
                icon={<Store className="size-4" />}
                label="رستوران"
                value={data.restaurants}
              />
              <MiniStat
                icon={<Building2 className="size-4" />}
                label="شعبه"
                value={data.branches}
              />
              <MiniStat
                icon={<Users className="size-4" />}
                label="کاربر"
                value={data.users}
              />
            </div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="فعالیت اخیر" description="آخرین اقدام‌های تیم پلتفرم." />
        <CardBody className="p-0">
          {data.recentActivity.length === 0 ? (
            <p className="p-5 text-sm text-ink-subtle">فعالیتی ثبت نشده است.</p>
          ) : (
            <ul className="divide-y divide-line">
              {data.recentActivity.map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm"
                >
                  <Badge tone="neutral">{PLATFORM_ACTION_LABEL[entry.action] ?? entry.action}</Badge>
                  <span className="text-ink">{entry.tenantName ?? '—'}</span>
                  <span className="flex-1 text-xs text-ink-subtle">
                    {entry.adminName}
                  </span>
                  <span className="text-xs text-ink-subtle">
                    {new Date(entry.createdAt).toLocaleString('fa-IR')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function Tile({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center gap-2 text-ink-subtle">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums text-ink">{value}</p>
      <p className="mt-0.5 text-xs text-ink-subtle">{hint}</p>
    </div>
  );
}

function StatusTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'positive' | 'info' | 'caution' | 'critical';
}) {
  const colour = {
    positive: 'text-positive',
    info: 'text-info',
    caution: 'text-caution',
    critical: 'text-critical',
  }[tone];
  return (
    <div className="rounded-xl border border-line bg-surface-sunken px-4 py-3">
      <p className="text-xs text-ink-subtle">{label}</p>
      <p className={`mt-0.5 text-xl font-bold tabular-nums ${colour}`}>
        {toPersianDigits(value)}
      </p>
    </div>
  );
}

function MiniStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface-sunken p-3 text-center">
      <div className="flex justify-center text-ink-subtle">{icon}</div>
      <p className="mt-1 text-lg font-bold tabular-nums text-ink">
        {toPersianDigits(value)}
      </p>
      <p className="text-xs text-ink-subtle">{label}</p>
    </div>
  );
}
