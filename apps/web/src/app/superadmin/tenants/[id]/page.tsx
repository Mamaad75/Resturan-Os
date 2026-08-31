'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Ban,
  CalendarPlus,
  Play,
  Power,
  Save,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ErrorState,
  Input,
  Modal,
  Select,
  Skeleton,
  Textarea,
  useToast,
} from '@/components/ui';
import { PlatformShell } from '@/features/platform/platform-shell';
import { ApiError } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { formatMoney, toPersianDigits } from '@/lib/format';
import { platformService } from '@/services';
import {
  PLATFORM_ACTION_LABEL,
  SUBSCRIPTION_STATUS_LABEL,
  SUBSCRIPTION_STATUS_TONE,
} from '@/features/platform/labels';

export default function TenantDetailPage() {
  return (
    <PlatformShell>
      <TenantDetail />
    </PlatformShell>
  );
}

function TenantDetail() {
  const params = useParams<{ id: string }>();
  const tenantId = params.id;
  const toast = useToast();
  const queryClient = useQueryClient();

  const [notes, setNotes] = useState('');
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [extendDays, setExtendDays] = useState('30');
  const [planId, setPlanId] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [trialEndsAt, setTrialEndsAt] = useState('');
  const [graceUntil, setGraceUntil] = useState('');

  const query = useQuery({
    queryKey: ['platform-tenant', tenantId],
    queryFn: () => platformService.tenant(tenantId),
  });
  const plansQuery = useQuery({
    queryKey: ['platform-plans'],
    queryFn: () => platformService.plans(),
  });

  useEffect(() => {
    const data = query.data;
    if (!data) return;
    setNotes(data.adminNotes ?? '');
    setPlanId(data.subscription?.plan.id ?? '');
    setExpiresAt(toDateInput(data.subscription?.expiresAt));
    setTrialEndsAt(toDateInput(data.subscription?.trialEndsAt));
    setGraceUntil(toDateInput(data.subscription?.graceUntil));
  }, [query.data]);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['platform-tenant', tenantId] });
    void queryClient.invalidateQueries({ queryKey: ['platform-tenants'] });
    void queryClient.invalidateQueries({ queryKey: ['platform-dashboard'] });
  }

  function onError(error: unknown) {
    toast.error(
      'انجام نشد',
      error instanceof ApiError ? error.message : undefined,
    );
  }

  const suspend = useMutation({
    mutationFn: () => platformService.suspend(tenantId, reason),
    onSuccess: () => {
      toast.success('کسب‌وکار معلق شد');
      setSuspendOpen(false);
      setReason('');
      refresh();
    },
    onError,
  });

  const activate = useMutation({
    mutationFn: () => platformService.activate(tenantId),
    onSuccess: () => {
      toast.success('تعلیق برداشته شد');
      refresh();
    },
    onError,
  });

  const toggleActive = useMutation({
    mutationFn: (next: boolean) =>
      next ? platformService.restore(tenantId) : platformService.disable(tenantId),
    onSuccess: () => {
      toast.success('وضعیت به‌روزرسانی شد');
      refresh();
    },
    onError,
  });

  const saveNotes = useMutation({
    mutationFn: () => platformService.setNotes(tenantId, notes.trim() || null),
    onSuccess: () => {
      toast.success('یادداشت ذخیره شد');
      refresh();
    },
    onError,
  });

  const saveSubscription = useMutation({
    mutationFn: () =>
      platformService.updateSubscription(tenantId, {
        planId: planId || undefined,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        trialEndsAt: trialEndsAt ? new Date(trialEndsAt).toISOString() : null,
        graceUntil: graceUntil ? new Date(graceUntil).toISOString() : null,
      }),
    onSuccess: () => {
      toast.success('اشتراک به‌روزرسانی شد');
      refresh();
    },
    onError,
  });

  const extend = useMutation({
    mutationFn: () => platformService.extend(tenantId, Number(extendDays) || 30),
    onSuccess: (subscription) => {
      toast.success(
        'اشتراک تمدید شد',
        subscription.expiresAt
          ? `تا ${new Date(subscription.expiresAt).toLocaleDateString('fa-IR')}`
          : undefined,
      );
      refresh();
    },
    onError,
  });

  if (query.isPending) {
    return <Skeleton className="h-64 rounded-2xl" />;
  }
  if (query.isError || !query.data) {
    return <ErrorState onRetry={() => query.refetch()} />;
  }

  const tenant = query.data;
  const subscription = tenant.subscription;
  const suspended = subscription?.status === 'SUSPENDED';

  return (
    <div className="space-y-4">
      <Link
        href="/superadmin/tenants"
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowRight className="size-4" />
        بازگشت به فهرست
      </Link>

      <Card>
        <CardHeader
          title={tenant.name}
          description={tenant.restaurantName ?? tenant.slug}
          action={
            subscription ? (
              <Badge tone={SUBSCRIPTION_STATUS_TONE[subscription.status]}>
                {SUBSCRIPTION_STATUS_LABEL[subscription.status]}
              </Badge>
            ) : null
          }
        />
        <CardBody className="flex flex-wrap gap-2">
          {suspended ? (
            <Button
              variant="primary"
              leftIcon={<Play className="size-4" />}
              loading={activate.isPending}
              onClick={() => activate.mutate()}
            >
              رفع تعلیق
            </Button>
          ) : (
            <Button
              variant="ghost"
              leftIcon={<Ban className="size-4" />}
              onClick={() => setSuspendOpen(true)}
            >
              تعلیق
            </Button>
          )}
          <Button
            variant="ghost"
            leftIcon={<Power className="size-4" />}
            loading={toggleActive.isPending}
            onClick={() => toggleActive.mutate(!tenant.isActive)}
          >
            {tenant.isActive ? 'غیرفعال‌سازی' : 'بازگردانی'}
          </Button>
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="اشتراک" />
          <CardBody className="space-y-3">
            <Select
              label="پلن"
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              options={(plansQuery.data ?? []).map((plan) => ({
                value: plan.id,
                label: `${plan.nameFa} — ${formatMoney(plan.monthlyPrice, 'IRT', { withUnit: false })}`,
              }))}
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <Input
                label="پایان اشتراک"
                type="date"
                dir="ltr"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
              <Input
                label="پایان دوره آزمایشی"
                type="date"
                dir="ltr"
                value={trialEndsAt}
                onChange={(e) => setTrialEndsAt(e.target.value)}
              />
              <Input
                label="مهلت تمدید تا"
                type="date"
                dir="ltr"
                value={graceUntil}
                onChange={(e) => setGraceUntil(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <Button
                variant="primary"
                leftIcon={<Save className="size-4" />}
                loading={saveSubscription.isPending}
                onClick={() => saveSubscription.mutate()}
              >
                ذخیره اشتراک
              </Button>
              <div className="flex items-end gap-2">
                <Input
                  label="تمدید سریع"
                  dir="ltr"
                  inputMode="numeric"
                  rightAddon="روز"
                  containerClassName="w-32"
                  value={extendDays}
                  onChange={(e) => setExtendDays(e.target.value)}
                />
                <Button
                  variant="ghost"
                  leftIcon={<CalendarPlus className="size-4" />}
                  loading={extend.isPending}
                  onClick={() => extend.mutate()}
                >
                  تمدید
                </Button>
              </div>
            </div>

            {subscription?.suspendedReason ? (
              <p className="rounded-xl border border-critical/30 bg-critical/10 p-3 text-xs text-critical">
                دلیل تعلیق: {subscription.suspendedReason}
              </p>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="مصرف و سقف پلن" />
          <CardBody className="space-y-1.5">
            {(
              [
                ['شعبه', tenant.entitlements.usage.branches, tenant.entitlements.limits.maxBranches],
                ['کاربر', tenant.entitlements.usage.staff, tenant.entitlements.limits.maxStaff],
                ['محصول', tenant.entitlements.usage.products, tenant.entitlements.limits.maxProducts],
                ['میز', tenant.entitlements.usage.tables, tenant.entitlements.limits.maxTables],
                [
                  'سفارش این ماه',
                  tenant.entitlements.usage.monthlyOrders,
                  tenant.entitlements.limits.maxMonthlyOrders,
                ],
                [
                  'پیامک تبلیغاتی',
                  tenant.entitlements.usage.monthlyMarketingSms,
                  tenant.entitlements.limits.smsAllowance,
                ],
              ] as Array<[string, number, number | null]>
            ).map(([label, used, cap]) => {
              const over = cap !== null && used >= cap;
              return (
                <div
                  key={label}
                  className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-xs"
                >
                  <span className="text-ink-muted">{label}</span>
                  <span
                    className={cn('tabular-nums', over ? 'text-critical' : 'text-ink')}
                  >
                    {toPersianDigits(used)}
                    {cap === null ? ' / نامحدود' : ` / ${toPersianDigits(cap)}`}
                  </span>
                </div>
              );
            })}
            <p className="pt-1 text-xs text-ink-subtle">
              پیامک این ماه: {toPersianDigits(tenant.smsUsage.thisMonth)} (
              {toPersianDigits(tenant.smsUsage.marketingThisMonth)} تبلیغاتی) • مجموع{' '}
              {toPersianDigits(tenant.smsUsage.allTime)}
            </p>
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="شعبه‌ها" />
          <CardBody className="p-0">
            <ul className="divide-y divide-line">
              {tenant.branches.map((branch) => (
                <li
                  key={branch.id}
                  className="flex items-center justify-between px-4 py-2.5 text-sm"
                >
                  <span className="text-ink">{branch.name}</span>
                  <span className="text-xs text-ink-subtle">
                    {toPersianDigits(branch.orders)} سفارش
                  </span>
                  <Badge tone={branch.isActive ? 'positive' : 'critical'}>
                    {branch.isActive ? 'فعال' : 'غیرفعال'}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="کاربران" />
          <CardBody className="p-0">
            <ul className="divide-y divide-line">
              {tenant.users.map((user) => (
                <li
                  key={user.id}
                  className="flex items-center justify-between px-4 py-2.5 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate text-ink">{user.fullName}</p>
                    <p className="truncate text-xs text-ink-subtle ltr-nums">
                      {user.email}
                    </p>
                  </div>
                  <Badge tone="neutral">{user.role}</Badge>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="یادداشت مدیر"
          description="فقط تیم فوداواس این یادداشت را می‌بیند."
        />
        <CardBody className="space-y-3">
          <Textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="مثلاً: فاکتور مرداد پرداخت نشده، تماس گرفته شد."
          />
          <Button
            variant="ghost"
            leftIcon={<Save className="size-4" />}
            loading={saveNotes.isPending}
            onClick={() => saveNotes.mutate()}
          >
            ذخیره یادداشت
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="تاریخچه اقدامات" />
        <CardBody className="p-0">
          {tenant.recentActivity.length === 0 ? (
            <p className="p-5 text-sm text-ink-subtle">اقدامی ثبت نشده است.</p>
          ) : (
            <ul className="divide-y divide-line">
              {tenant.recentActivity.map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm"
                >
                  <Badge tone="neutral">
                    {PLATFORM_ACTION_LABEL[entry.action] ?? entry.action}
                  </Badge>
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

      <Modal
        open={suspendOpen}
        onClose={() => setSuspendOpen(false)}
        title="تعلیق کسب‌وکار"
        description="پس از تعلیق، کارکنان می‌توانند وارد شوند و اطلاعات را ببینند اما هیچ تغییری ثبت نمی‌شود و منوی عمومی از دسترس خارج می‌شود."
        size="sm"
        footer={
          <div className="flex gap-3">
            <Button variant="ghost" onClick={() => setSuspendOpen(false)} fullWidth>
              انصراف
            </Button>
            <Button
              variant="primary"
              fullWidth
              disabled={reason.trim().length < 3}
              loading={suspend.isPending}
              onClick={() => suspend.mutate()}
            >
              تعلیق
            </Button>
          </div>
        }
      >
        <Textarea
          label="دلیل تعلیق"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          hint="در تاریخچه ثبت می‌شود و برای صاحب کسب‌وکار نمایش داده می‌شود."
        />
      </Modal>
    </div>
  );
}

/** ISO instant -> the `yyyy-mm-dd` a date input expects. */
function toDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toISOString().slice(0, 10);
}
