'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Crown, Gift, Sparkles, UserPlus } from 'lucide-react';
import { useState } from 'react';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Input,
  Select,
  useToast,
} from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { membershipService } from '@/services';

const EMPTY_PLAN = {
  name: '',
  price: '0',
  durationDays: '30',
  discountPercent: '10',
  loyaltyMultiplier: '1',
  freeDelivery: false,
  monthlyFreeDrinks: '0',
};

const EMPTY_GRANT = {
  planId: '',
  phone: '',
  name: '',
  gifted: false,
  amount: '',
  paymentMethod: 'CARD',
  reference: '',
};

export default function MembershipsPage() {
  const { can } = useAuth();
  const editable = can('membership:manage');
  const qc = useQueryClient();
  const toast = useToast();

  const plans = useQuery({
    queryKey: ['membership-plans'],
    queryFn: membershipService.plans,
  });
  const memberships = useQuery({
    queryKey: ['memberships'],
    queryFn: () => membershipService.list(),
  });

  const [plan, setPlan] = useState(EMPTY_PLAN);
  const [grant, setGrant] = useState(EMPTY_GRANT);

  const mutate = useMutation({
    mutationFn: async (fn: () => Promise<unknown>) => fn(),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['membership-plans'] });
      await qc.invalidateQueries({ queryKey: ['memberships'] });
      toast.success('اشتراک به‌روزرسانی شد');
    },
    onError: (error) =>
      toast.error(
        'عملیات اشتراک انجام نشد',
        error instanceof Error ? error.message : undefined,
      ),
  });

  const numericPlanValid = [
    plan.price,
    plan.durationDays,
    plan.discountPercent,
    plan.loyaltyMultiplier,
    plan.monthlyFreeDrinks,
  ].every((value) => Number.isFinite(Number(value)) && Number(value) >= 0);

  const createPlan = () => {
    mutate.mutate(async () => {
      const result = await membershipService.createPlan({
        name: plan.name.trim(),
        price: Number(plan.price),
        durationDays: Number(plan.durationDays),
        discountBps: Math.round(Number(plan.discountPercent) * 100),
        loyaltyMultiplierBps: Math.round(Number(plan.loyaltyMultiplier) * 10_000),
        freeDelivery: plan.freeDelivery,
        monthlyFreeDrinks: Number(plan.monthlyFreeDrinks),
        isActive: true,
      });
      setPlan(EMPTY_PLAN);
      return result;
    });
  };

  const grantMembership = () => {
    mutate.mutate(async () => {
      const result = await membershipService.grant({
        planId: grant.planId,
        phone: grant.phone.trim(),
        name: grant.name.trim() || null,
        gifted: grant.gifted,
        ...(grant.amount && !grant.gifted ? { amount: Number(grant.amount) } : {}),
        paymentMethod: grant.paymentMethod,
        reference: !grant.gifted && grant.reference.trim() ? grant.reference.trim() : null,
      });
      setGrant(EMPTY_GRANT);
      return result;
    });
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-ink">اشتراک مشتریان</h1>
        <p className="text-sm text-ink-muted">
          اشتراک بفروشید یا هدیه بدهید؛ مزایا هنگام Checkout و تکمیل سفارش خودکار اعمال می‌شوند.
        </p>
      </div>

      <Card>
        <CardHeader
          title="پلن‌های اشتراک"
          description="تخفیف، ضریب امتیاز، ارسال رایگان و سهمیه نوشیدنی را برای هر پلن تعریف کنید."
        />
        <CardBody className="space-y-5">
          {(plans.data ?? []).length ? (
            <div className="grid gap-3 lg:grid-cols-3">
              {(plans.data ?? []).map((item) => (
                <div
                  key={item.id}
                  className="relative overflow-hidden rounded-2xl border border-line bg-surface-sunken/40 p-4 transition-colors hover:border-brand/30"
                >
                  <div className="absolute -start-12 -top-12 size-28 rounded-full bg-brand/[0.06] blur-2xl" />
                  <div className="relative mb-3 flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-9 items-center justify-center rounded-xl bg-brand/12 text-brand">
                        <Crown className="size-4.5" />
                      </span>
                      <div>
                        <p className="font-bold text-ink">{item.name}</p>
                        <p className="mt-0.5 text-xs text-ink-muted">
                          {item.price.toLocaleString('fa-IR')} تومان / {item.durationDays.toLocaleString('fa-IR')} روز
                        </p>
                      </div>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-[0.7rem] ${item.isActive ? 'bg-positive/10 text-positive' : 'bg-surface-raised text-ink-subtle'}`}>
                      {item.isActive ? 'فعال' : 'غیرفعال'}
                    </span>
                  </div>
                  <div className="relative grid grid-cols-2 gap-2 text-xs text-ink-muted">
                    <Benefit label="تخفیف" value={`${(item.discountBps / 100).toLocaleString('fa-IR')}٪`} />
                    <Benefit label="ضریب امتیاز" value={`×${(item.loyaltyMultiplierBps / 10_000).toLocaleString('fa-IR')}`} />
                    <Benefit label="ارسال" value={item.freeDelivery ? 'رایگان' : 'عادی'} />
                    <Benefit label="نوشیدنی" value={`${item.monthlyFreeDrinks.toLocaleString('fa-IR')} / ماه`} />
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {editable ? (
            <div className="rounded-2xl border border-line bg-surface-sunken/35 p-4">
              <div className="mb-4 flex items-center gap-2">
                <Sparkles className="size-4 text-brand" />
                <div>
                  <h3 className="text-sm font-semibold text-ink">ساخت پلن جدید</h3>
                  <p className="text-xs text-ink-subtle">مشخصات تجاری و مزایای پلن را در یک ردیف تکمیل کنید.</p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 xl:items-end">
                <Input
                  label="نام پلن"
                  value={plan.name}
                  onChange={(event) => setPlan({ ...plan, name: event.target.value })}
                  className="bg-surface"
                  required
                />
                <Input
                  label="قیمت"
                  dir="ltr"
                  inputMode="numeric"
                  value={plan.price}
                  onChange={(event) => setPlan({ ...plan, price: event.target.value })}
                  rightAddon="تومان"
                  className="bg-surface pe-16"
                />
                <Input
                  label="مدت اعتبار"
                  dir="ltr"
                  inputMode="numeric"
                  value={plan.durationDays}
                  onChange={(event) => setPlan({ ...plan, durationDays: event.target.value })}
                  rightAddon="روز"
                  className="bg-surface"
                />
                <Input
                  label="تخفیف عضویت"
                  dir="ltr"
                  inputMode="decimal"
                  value={plan.discountPercent}
                  onChange={(event) => setPlan({ ...plan, discountPercent: event.target.value })}
                  rightAddon="٪"
                  className="bg-surface"
                />
                <Input
                  label="ضریب امتیاز"
                  dir="ltr"
                  inputMode="decimal"
                  value={plan.loyaltyMultiplier}
                  onChange={(event) => setPlan({ ...plan, loyaltyMultiplier: event.target.value })}
                  rightAddon="×"
                  className="bg-surface"
                />
                <Input
                  label="نوشیدنی رایگان"
                  dir="ltr"
                  inputMode="numeric"
                  value={plan.monthlyFreeDrinks}
                  onChange={(event) => setPlan({ ...plan, monthlyFreeDrinks: event.target.value })}
                  rightAddon="ماهانه"
                  className="bg-surface pe-16"
                />
                <LabeledSwitch
                  label="ارسال رایگان"
                  checked={plan.freeDelivery}
                  onChange={(value) => setPlan({ ...plan, freeDelivery: value })}
                />
                <div className="flex items-end">
                  <Button
                    className="h-11 w-full"
                    disabled={!plan.name.trim() || !numericPlanValid || mutate.isPending}
                    loading={mutate.isPending}
                    onClick={createPlan}
                  >
                    ساخت پلن
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </CardBody>
      </Card>

      {editable ? (
        <Card>
          <CardHeader
            title="فروش یا هدیه اشتراک"
            description="پلن را برای مشتری فعال کنید و در صورت فروش، اطلاعات پرداخت را همان‌جا ثبت کنید."
          />
          <CardBody>
            <div className="rounded-2xl border border-line bg-surface-sunken/35 p-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 xl:items-end">
                <Select
                  label="پلن اشتراک"
                  value={grant.planId}
                  onChange={(event) => setGrant({ ...grant, planId: event.target.value })}
                  className="bg-surface"
                  required
                >
                  <option value="">انتخاب کنید</option>
                  {(plans.data ?? []).filter((item) => item.isActive).map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </Select>
                <Input
                  label="شماره موبایل"
                  dir="ltr"
                  inputMode="tel"
                  value={grant.phone}
                  onChange={(event) => setGrant({ ...grant, phone: event.target.value })}
                  className="bg-surface"
                  required
                />
                <Input
                  label="نام مشتری"
                  value={grant.name}
                  onChange={(event) => setGrant({ ...grant, name: event.target.value })}
                  className="bg-surface"
                />
                <Select
                  label="روش پرداخت"
                  value={grant.paymentMethod}
                  disabled={grant.gifted}
                  onChange={(event) => setGrant({ ...grant, paymentMethod: event.target.value })}
                  className="bg-surface"
                >
                  <option value="CARD">کارت</option>
                  <option value="CASH">نقدی</option>
                  <option value="ONLINE">آنلاین</option>
                  <option value="OTHER">سایر</option>
                </Select>
                <Input
                  label="مبلغ دریافتی"
                  dir="ltr"
                  inputMode="numeric"
                  disabled={grant.gifted}
                  value={grant.amount}
                  onChange={(event) => setGrant({ ...grant, amount: event.target.value })}
                  rightAddon="تومان"
                  className="bg-surface pe-16"
                />
                <Input
                  label="شماره پیگیری"
                  dir="ltr"
                  disabled={grant.gifted}
                  value={grant.reference}
                  onChange={(event) => setGrant({ ...grant, reference: event.target.value })}
                  className="bg-surface"
                />
                <LabeledSwitch
                  label="نوع ثبت"
                  checked={grant.gifted}
                  onChange={(value) => setGrant({ ...grant, gifted: value, amount: value ? '' : grant.amount, reference: value ? '' : grant.reference })}
                  onLabel="هدیه"
                  offLabel="فروش"
                />
                <div className="flex items-end">
                  <Button
                    className="h-11 w-full"
                    disabled={!grant.planId || !grant.phone.trim() || mutate.isPending}
                    loading={mutate.isPending}
                    onClick={grantMembership}
                  >
                    {grant.gifted ? <Gift className="size-4" /> : <UserPlus className="size-4" />}
                    {grant.gifted ? 'هدیه اشتراک' : 'فروش اشتراک'}
                  </Button>
                </div>
              </div>
            </div>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="اشتراک‌های مشتریان" />
        <CardBody>
          {(memberships.data ?? []).length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="text-ink-muted">
                  <tr>
                    <th className="p-2 text-start">مشتری</th>
                    <th>پلن</th>
                    <th>وضعیت</th>
                    <th>پایان</th>
                    <th>نوع</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {(memberships.data ?? []).map((membership) => (
                    <tr key={membership.id} className="border-t border-line">
                      <td className="p-3">
                        <p className="font-medium">{membership.customer.name ?? 'بدون نام'}</p>
                        <p dir="ltr" className="text-xs text-ink-muted">{membership.customer.phone}</p>
                      </td>
                      <td className="text-center">{membership.plan.name}</td>
                      <td className="text-center">{membership.status}</td>
                      <td className="text-center">{new Date(membership.endsAt).toLocaleDateString('fa-IR')}</td>
                      <td className="text-center">{membership.gifted ? 'هدیه' : 'فروخته‌شده'}</td>
                      <td className="text-end">
                        {editable && membership.status === 'ACTIVE' ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => mutate.mutate(() => membershipService.cancel(membership.id, 'لغو توسط مدیر'))}
                          >
                            لغو
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="هنوز اشتراکی ثبت نشده"
              description="یک پلن بسازید و برای مشتری بفروشید یا هدیه کنید."
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function Benefit({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line/80 bg-surface/60 px-3 py-2">
      <p className="text-[0.68rem] text-ink-subtle">{label}</p>
      <p className="mt-0.5 font-semibold text-ink">{value}</p>
    </div>
  );
}

function LabeledSwitch({
  label,
  checked,
  onChange,
  onLabel = 'فعال',
  offLabel = 'غیرفعال',
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  onLabel?: string;
  offLabel?: string;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium text-ink-muted">{label}</p>
      <div className="flex h-11 items-center justify-between rounded-xl border border-line bg-surface px-3.5 transition-colors hover:border-line-strong">
        <span className="text-sm font-medium text-ink">{checked ? onLabel : offLabel}</span>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          onClick={() => onChange(!checked)}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-brand' : 'bg-line-strong'}`}
        >
          <span
            className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${checked ? 'start-[1.375rem]' : 'start-0.5'}`}
          />
        </button>
      </div>
    </div>
  );
}
