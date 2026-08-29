'use client';

import { CouponType, type CouponDto } from '@restaurant-os/types';
import { createCouponSchema } from '@restaurant-os/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Plus, Tag, Trash2 } from 'lucide-react';
import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Input,
  Modal,
  Select,
  SkeletonList,
  Textarea,
  useToast,
} from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { ApiError } from '@/lib/api-client';
import { formatDateFa, formatMoney, toPersianDigits } from '@/lib/format';
import { couponService } from '@/services';

export default function CouponsPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<CouponDto | null>(null);

  const couponsQuery = useQuery({
    queryKey: ['coupons'],
    queryFn: () => couponService.list(),
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['coupons'] });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      couponService.update(id, { isActive }),
    onSuccess: () => {
      toast.success('وضعیت کد تخفیف به‌روزرسانی شد');
      invalidate();
    },
    onError: (error) =>
      toast.error('تغییر انجام نشد', error instanceof ApiError ? error.message : undefined),
  });

  const remove = useMutation({
    mutationFn: (id: string) => couponService.remove(id),
    onSuccess: (result) => {
      toast.success(
        result.deactivated ? 'کد تخفیف غیرفعال شد' : 'کد تخفیف حذف شد',
        result.deactivated
          ? 'چون قبلاً استفاده شده بود، برای حفظ سوابق سفارش‌ها فقط غیرفعال شد.'
          : undefined,
      );
      setDeleting(null);
      invalidate();
    },
    onError: (error) =>
      toast.error('حذف انجام نشد', error instanceof ApiError ? error.message : undefined),
  });

  const coupons = couponsQuery.data ?? [];
  const manageable = can('settings:manage');

  function copyCode(code: string) {
    void navigator.clipboard?.writeText(code);
    toast.success('کد کپی شد', code);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="کدهای تخفیف"
          description="برای کمپین‌ها، مشتریان جدید یا ساعت‌های خلوت کد بسازید."
          action={
            manageable ? (
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Plus className="size-4" />}
                onClick={() => setFormOpen(true)}
              >
                کد جدید
              </Button>
            ) : null
          }
        />
        <CardBody className="p-0">
          {couponsQuery.isPending ? (
            <div className="p-5">
              <SkeletonList rows={4} />
            </div>
          ) : couponsQuery.isError ? (
            <ErrorState onRetry={() => couponsQuery.refetch()} />
          ) : coupons.length === 0 ? (
            <EmptyState
              icon={<Tag className="size-6" />}
              title="هنوز کد تخفیفی ندارید"
              description="با یک کد خوش‌آمدگویی شروع کنید تا مشتری اولین سفارشش را ثبت کند."
              action={
                manageable ? (
                  <Button variant="primary" onClick={() => setFormOpen(true)}>
                    ساخت اولین کد
                  </Button>
                ) : null
              }
            />
          ) : (
            <ul className="divide-y divide-line">
              {coupons.map((coupon) => (
                <li
                  key={coupon.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-4 sm:px-5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => copyCode(coupon.code)}
                        className="ltr-nums flex items-center gap-1.5 rounded-lg border border-line bg-surface-sunken px-2.5 py-1 font-mono text-sm font-semibold text-gold transition-colors hover:border-gold/40"
                        title="کپی کد"
                      >
                        {coupon.code}
                        <Copy className="size-3 opacity-60" />
                      </button>

                      <Badge tone={coupon.type === CouponType.PERCENTAGE ? 'info' : 'gold'}>
                        {coupon.type === CouponType.PERCENTAGE
                          ? `${toPersianDigits(coupon.value / 100)}٪ تخفیف`
                          : `${formatMoney(coupon.value)} تخفیف`}
                      </Badge>

                      {coupon.isRedeemable ? (
                        <Badge tone="positive" dot>
                          فعال
                        </Badge>
                      ) : (
                        <Badge tone="neutral">
                          {!coupon.isActive
                            ? 'غیرفعال'
                            : coupon.usageLimit != null &&
                                coupon.usageCount >= coupon.usageLimit
                              ? 'ظرفیت تمام'
                              : 'خارج از بازه'}
                        </Badge>
                      )}
                    </div>

                    {coupon.description ? (
                      <p className="mt-1.5 text-sm text-ink-muted">{coupon.description}</p>
                    ) : null}

                    <p className="mt-1 text-xs text-ink-subtle">
                      {coupon.minOrderTotal > 0
                        ? `حداقل سفارش ${formatMoney(coupon.minOrderTotal)}`
                        : 'بدون حداقل سفارش'}
                      {coupon.maxDiscount != null
                        ? ` • سقف ${formatMoney(coupon.maxDiscount)}`
                        : ''}
                      {coupon.perCustomerLimit != null
                        ? ` • ${toPersianDigits(coupon.perCustomerLimit)} بار برای هر مشتری`
                        : ''}
                      {coupon.endsAt ? ` • تا ${formatDateFa(coupon.endsAt)}` : ''}
                    </p>
                  </div>

                  <div className="text-end">
                    <p className="text-sm font-medium tabular-nums text-ink">
                      {toPersianDigits(coupon.usageCount)}
                      {coupon.usageLimit != null
                        ? ` / ${toPersianDigits(coupon.usageLimit)}`
                        : ''}{' '}
                      استفاده
                    </p>
                    <p className="text-xs text-ink-subtle">
                      هزینه کمپین: {formatMoney(coupon.totalDiscountGiven)}
                    </p>
                  </div>

                  {manageable ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          toggleActive.mutate({
                            id: coupon.id,
                            isActive: !coupon.isActive,
                          })
                        }
                        className={
                          coupon.isActive
                            ? 'rounded-lg border border-positive/30 bg-positive/10 px-2.5 py-1.5 text-xs text-positive'
                            : 'rounded-lg border border-line px-2.5 py-1.5 text-xs text-ink-muted'
                        }
                      >
                        {coupon.isActive ? 'فعال' : 'غیرفعال'}
                      </button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="حذف"
                        onClick={() => setDeleting(coupon)}
                      >
                        <Trash2 className="size-4 text-critical" />
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <CouponFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          invalidate();
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        title="حذف کد تخفیف"
        message={
          deleting && deleting.usageCount > 0
            ? `کد «${deleting.code}» قبلاً ${toPersianDigits(deleting.usageCount)} بار استفاده شده است. برای حفظ سوابق سفارش‌ها فقط غیرفعال می‌شود.`
            : `آیا از حذف کد «${deleting?.code}» مطمئن هستید؟`
        }
        confirmLabel={deleting && deleting.usageCount > 0 ? 'غیرفعال کن' : 'حذف کن'}
        loading={remove.isPending}
      />
    </div>
  );
}

function CouponFormModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [code, setCode] = useState('');
  const [type, setType] = useState<CouponType>(CouponType.PERCENTAGE);
  const [value, setValue] = useState('');
  const [description, setDescription] = useState('');
  const [minOrderTotal, setMinOrderTotal] = useState('');
  const [maxDiscount, setMaxDiscount] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [usageLimit, setUsageLimit] = useState('');
  const [perCustomerLimit, setPerCustomerLimit] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  function reset() {
    setCode('');
    setType(CouponType.PERCENTAGE);
    setValue('');
    setDescription('');
    setMinOrderTotal('');
    setMaxDiscount('');
    setEndsAt('');
    setUsageLimit('');
    setPerCustomerLimit('');
    setErrors({});
  }

  const save = useMutation({
    mutationFn: async () => {
      const numeric = (raw: string) => Number(raw.replace(/\D/g, ''));
      const payload = {
        code,
        type,
        // Percentages are stored as basis points, so 15% becomes 1500.
        value:
          type === CouponType.PERCENTAGE
            ? Math.round(Number(value.replace(/[^\d.]/g, '')) * 100)
            : numeric(value),
        description: description.trim() || null,
        minOrderTotal: minOrderTotal.trim() ? numeric(minOrderTotal) : 0,
        maxDiscount: maxDiscount.trim() ? numeric(maxDiscount) : null,
        endsAt: endsAt.trim() ? new Date(endsAt).toISOString() : null,
        usageLimit: usageLimit.trim() ? numeric(usageLimit) : null,
        perCustomerLimit: perCustomerLimit.trim() ? numeric(perCustomerLimit) : null,
        isActive: true,
      };

      const parsed = createCouponSchema.safeParse(payload);
      if (!parsed.success) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of parsed.error.issues) {
          fieldErrors[String(issue.path[0])] = issue.message;
        }
        setErrors(fieldErrors);
        throw new Error('validation');
      }
      setErrors({});
      return couponService.create(payload);
    },
    onSuccess: (created) => {
      toast.success('کد تخفیف ساخته شد', created.code);
      reset();
      onSaved();
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        toast.error('ذخیره انجام نشد', error.message);
        if (error.details) {
          setErrors(
            Object.fromEntries(
              Object.entries(error.details).map(([key, list]) => [key, list[0]]),
            ),
          );
        }
      }
    },
  });

  const isPercentage = type === CouponType.PERCENTAGE;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="کد تخفیف جدید"
      description="کد پس از ساخت قابل تغییر نیست، اما شرایطش را می‌توانید ویرایش کنید."
      size="md"
      footer={
        <div className="flex gap-3">
          <Button variant="ghost" fullWidth onClick={onClose}>
            انصراف
          </Button>
          <Button
            variant="primary"
            fullWidth
            loading={save.isPending}
            onClick={() => save.mutate()}
          >
            ساخت کد
          </Button>
        </div>
      }
    >
      <div className="space-y-4 pt-1">
        <Input
          label="کد"
          dir="ltr"
          placeholder="WELCOME15"
          hint="مشتری این کد را در سبد خرید وارد می‌کند. حروف بزرگ و کوچک فرقی ندارد."
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          error={errors.code}
          required
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="نوع تخفیف"
            value={type}
            onChange={(e) => setType(e.target.value as CouponType)}
            options={[
              { value: CouponType.PERCENTAGE, label: 'درصدی' },
              { value: CouponType.FIXED, label: 'مبلغ ثابت' },
            ]}
          />
          <Input
            label={isPercentage ? 'درصد تخفیف' : 'مبلغ تخفیف'}
            dir="ltr"
            inputMode="decimal"
            rightAddon={isPercentage ? '٪' : 'تومان'}
            placeholder={isPercentage ? '15' : '50000'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            error={errors.value}
            required
          />
        </div>

        <Textarea
          label="توضیح (اختیاری)"
          rows={2}
          placeholder="تخفیف خوش‌آمدگویی مشتریان جدید"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          error={errors.description}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="حداقل مبلغ سفارش"
            dir="ltr"
            inputMode="numeric"
            rightAddon="تومان"
            placeholder="۰"
            value={minOrderTotal}
            onChange={(e) => setMinOrderTotal(e.target.value)}
            error={errors.minOrderTotal}
          />
          {isPercentage ? (
            <Input
              label="سقف تخفیف"
              dir="ltr"
              inputMode="numeric"
              rightAddon="تومان"
              hint="بیشترین مبلغی که این کد تخفیف می‌دهد"
              value={maxDiscount}
              onChange={(e) => setMaxDiscount(e.target.value)}
              error={errors.maxDiscount}
            />
          ) : (
            <div />
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="سقف تعداد استفاده"
            dir="ltr"
            inputMode="numeric"
            hint="خالی یعنی نامحدود"
            value={usageLimit}
            onChange={(e) => setUsageLimit(e.target.value)}
            error={errors.usageLimit}
          />
          <Input
            label="سقف برای هر مشتری"
            dir="ltr"
            inputMode="numeric"
            hint="بر اساس شماره موبایل"
            value={perCustomerLimit}
            onChange={(e) => setPerCustomerLimit(e.target.value)}
            error={errors.perCustomerLimit}
          />
        </div>

        <Input
          label="تاریخ انقضا (اختیاری)"
          type="date"
          dir="ltr"
          value={endsAt}
          onChange={(e) => setEndsAt(e.target.value)}
          error={errors.endsAt}
        />
      </div>
    </Modal>
  );
}
