'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgePercent, Plus, Trash2 } from 'lucide-react';
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
  useToast,
} from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { ApiError } from '@/lib/api-client';
import { formatDateFa, formatMoney, toPersianDigits } from '@/lib/format';
import {
  menuService,
  offerService,
  type CheckoutOfferAdminDto,
} from '@/services';

/**
 * Special offers shown to a guest on the last screen before they pay.
 *
 * One offer runs at a time, on purpose: the guest sees a single decision, and
 * the owner can tell what it did. The two counters are the whole point of the
 * page - "shown 40 times, taken 9" is what tells an owner whether to run the
 * croissant again next week.
 */
export default function OffersPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<CheckoutOfferAdminDto | null>(null);

  const offersQuery = useQuery({
    queryKey: ['offers'],
    queryFn: () => offerService.list(),
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['offers'] });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      offerService.update(id, { isActive }),
    onSuccess: () => {
      toast.success('وضعیت پیشنهاد به‌روزرسانی شد');
      invalidate();
    },
    onError: (error) =>
      toast.error(
        'تغییر انجام نشد',
        error instanceof ApiError ? error.message : undefined,
      ),
  });

  const remove = useMutation({
    mutationFn: (id: string) => offerService.remove(id),
    onSuccess: () => {
      toast.success('پیشنهاد حذف شد');
      setDeleting(null);
      invalidate();
    },
    onError: (error) =>
      toast.error('حذف انجام نشد', error instanceof ApiError ? error.message : undefined),
  });

  const offers = offersQuery.data ?? [];
  const manageable = can('settings:manage');
  const liveCount = offers.filter((offer) => offer.isLive).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="پیشنهاد ویژه قبل از پرداخت"
          description="یک آیتم را با تخفیف به مشتری پیشنهاد دهید؛ درست قبل از ثبت سفارش نمایش داده می‌شود."
          action={
            manageable ? (
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Plus className="size-4" />}
                onClick={() => setFormOpen(true)}
              >
                پیشنهاد جدید
              </Button>
            ) : null
          }
        />
        <CardBody className="p-0">
          {offersQuery.isPending ? (
            <div className="p-5">
              <SkeletonList rows={3} />
            </div>
          ) : offersQuery.isError ? (
            <ErrorState onRetry={() => offersQuery.refetch()} />
          ) : offers.length === 0 ? (
            <EmptyState
              icon={<BadgePercent className="size-6" />}
              title="هنوز پیشنهادی نساخته‌اید"
              description="مثلاً کروسان با ۲۰٪ تخفیف برای هفت روز. مشتری قبل از پرداخت آن را می‌بیند و با یک ضربه به سفارشش اضافه می‌کند."
              action={
                manageable ? (
                  <Button variant="primary" onClick={() => setFormOpen(true)}>
                    ساخت اولین پیشنهاد
                  </Button>
                ) : null
              }
            />
          ) : (
            <ul className="divide-y divide-line">
              {offers.map((offer) => (
                <li
                  key={offer.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-4 sm:px-5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-ink">
                        {offer.productNameFa}
                      </span>
                      <Badge tone="brand">
                        {toPersianDigits(Math.round(offer.discountBps / 100))}٪ تخفیف
                      </Badge>
                      {offer.isLive ? (
                        <Badge tone="positive" dot>
                          در حال نمایش
                        </Badge>
                      ) : (
                        <Badge tone="neutral">
                          {offer.isActive ? 'خارج از بازه' : 'غیرفعال'}
                        </Badge>
                      )}
                    </div>

                    {offer.title ? (
                      <p className="mt-1.5 text-sm text-ink-muted">{offer.title}</p>
                    ) : null}

                    <p className="mt-1 text-xs text-ink-subtle">
                      از {formatDateFa(offer.startsAt)} تا {formatDateFa(offer.endsAt)}
                    </p>
                  </div>

                  <div className="text-end">
                    <p className="text-sm font-medium tabular-nums text-ink">
                      {toPersianDigits(offer.acceptedCount)} از{' '}
                      {toPersianDigits(offer.shownCount)} نمایش
                    </p>
                    <p className="text-xs text-ink-subtle">
                      {offer.shownCount > 0
                        ? `${toPersianDigits(
                            Math.round((offer.acceptedCount / offer.shownCount) * 100),
                          )}٪ پذیرش`
                        : 'هنوز نمایش داده نشده'}
                    </p>
                  </div>

                  {manageable ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          toggleActive.mutate({
                            id: offer.id,
                            isActive: !offer.isActive,
                          })
                        }
                        className={
                          offer.isActive
                            ? 'rounded-lg border border-positive/30 bg-positive/10 px-2.5 py-1.5 text-xs text-positive'
                            : 'rounded-lg border border-line px-2.5 py-1.5 text-xs text-ink-muted'
                        }
                      >
                        {offer.isActive ? 'فعال' : 'غیرفعال'}
                      </button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`حذف پیشنهاد ${offer.productNameFa}`}
                        onClick={() => setDeleting(offer)}
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

      {/*
        Several live offers are allowed but only the newest is shown, so an
        owner who forgot to switch the last one off is told rather than left
        wondering why their new offer never appears.
      */}
      {liveCount > 1 ? (
        <p className="rounded-xl border border-caution/30 bg-caution/10 px-4 py-3 text-xs leading-relaxed text-caution">
          {toPersianDigits(liveCount)} پیشنهاد همزمان فعال است. به هر مشتری فقط
          جدیدترین پیشنهاد نشان داده می‌شود؛ بقیه را غیرفعال کنید تا نتیجه هر کدام
          مشخص باشد.
        </p>
      ) : null}

      <OfferFormModal
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
        title="حذف پیشنهاد"
        message={`آیا از حذف پیشنهاد «${deleting?.productNameFa}» مطمئن هستید؟ آمار نمایش و پذیرش آن هم پاک می‌شود.`}
        confirmLabel="حذف"
        tone="danger"
        loading={remove.isPending}
      />
    </div>
  );
}

/** Three decisions: which item, how much off, for how long. */
function OfferFormModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [productId, setProductId] = useState('');
  const [percent, setPercent] = useState('20');
  const [days, setDays] = useState('7');
  const [title, setTitle] = useState('');

  const productsQuery = useQuery({
    queryKey: ['products', 'offer-picker'],
    queryFn: () => menuService.products({ pageSize: 200 }),
    enabled: open,
  });

  const products = productsQuery.data?.items ?? [];
  const selected = products.find((product) => product.id === productId) ?? null;
  const percentValue = Number(percent);
  const basePrice = selected?.discountPrice ?? selected?.price ?? 0;
  const preview =
    selected && percentValue > 0
      ? Math.max(0, basePrice - Math.round((basePrice * percentValue * 100) / 10_000))
      : null;

  const save = useMutation({
    mutationFn: () =>
      offerService.create({
        productId,
        title: title.trim() || null,
        discountBps: Math.round(percentValue * 100),
        days: Number(days),
      }),
    onSuccess: () => {
      toast.success('پیشنهاد ساخته شد', 'از همین حالا به مشتری‌ها نشان داده می‌شود.');
      setProductId('');
      setTitle('');
      setPercent('20');
      setDays('7');
      onSaved();
    },
    onError: (error) =>
      toast.error('ثبت نشد', error instanceof ApiError ? error.message : undefined),
  });

  const valid =
    Boolean(productId) &&
    percentValue >= 1 &&
    percentValue <= 90 &&
    Number(days) >= 1 &&
    Number(days) <= 365;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="پیشنهاد ویژه جدید"
      description="مشتری این پیشنهاد را درست قبل از ثبت سفارش می‌بیند."
      size="md"
      footer={
        <div className="flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            انصراف
          </Button>
          <Button
            variant="primary"
            loading={save.isPending}
            disabled={!valid}
            onClick={() => save.mutate()}
          >
            ساختن پیشنهاد
          </Button>
        </div>
      }
    >
      <div className="space-y-4 pt-1">
        <Select
          label="کدام آیتم؟"
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          placeholder={
            productsQuery.isPending ? 'در حال بارگذاری…' : 'یک آیتم را انتخاب کنید'
          }
          options={products.map((product) => ({
            value: product.id,
            label: `${product.nameFa} — ${formatMoney(
              product.discountPrice ?? product.price,
            )}`,
          }))}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="درصد تخفیف"
            dir="ltr"
            inputMode="numeric"
            rightAddon="٪"
            value={percent}
            onChange={(e) => setPercent(e.target.value.replace(/[^\d]/g, ''))}
            hint="بین ۱ تا ۹۰ درصد"
          />
          <Input
            label="چند روز اجرا شود؟"
            dir="ltr"
            inputMode="numeric"
            rightAddon="روز"
            value={days}
            onChange={(e) => setDays(e.target.value.replace(/[^\d]/g, ''))}
            hint="از امروز شمرده می‌شود"
          />
        </div>

        <Input
          label="متن پیشنهاد (اختیاری)"
          placeholder="امروز کروسان را با ۲۰٪ تخفیف بخرید"
          maxLength={120}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          hint="خالی بگذارید تا خودش از نام آیتم و درصد تخفیف ساخته شود."
        />

        {preview != null && selected ? (
          <div className="rounded-xl border border-line bg-surface-sunken p-3 text-sm">
            <p className="text-ink-muted">مشتری این را می‌بیند:</p>
            <p className="mt-1 font-semibold text-ink">
              {selected.nameFa}؛{' '}
              <span className="text-ink-subtle line-through">
                {formatMoney(basePrice)}
              </span>{' '}
              <span className="text-brand">{formatMoney(preview)}</span>
            </p>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
