'use client';

import {
  ServiceMode,
  type PublicRestaurant,
} from '@restaurant-os/types';
import { createPublicOrderSchema } from '@restaurant-os/validation';
import { Minus, Plus, ShoppingBag, Trash2, UtensilsCrossed } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Input, Modal, Textarea, useToast } from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { formatMoney, toPersianDigits } from '@/lib/format';
import { publicService } from '@/services';
import { useCart } from './cart';

type OrderType = 'DINE_IN' | 'TAKEAWAY';

export function CheckoutSheet({
  open,
  onClose,
  restaurant,
  slug,
}: {
  open: boolean;
  onClose: () => void;
  restaurant: PublicRestaurant;
  slug: string;
}) {
  const cart = useCart();
  const router = useRouter();
  const toast = useToast();

  const modes = restaurant.settings.serviceModes;
  const dineInAvailable =
    modes.includes(ServiceMode.DINE_IN) && Boolean(restaurant.table);
  const takeawayAvailable = modes.includes(ServiceMode.TAKEAWAY);

  const [orderType, setOrderType] = useState<OrderType>(
    dineInAvailable ? 'DINE_IN' : 'TAKEAWAY',
  );
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setErrors({});

    const payload = {
      type: orderType,
      tableId: orderType === 'DINE_IN' ? (restaurant.table?.id ?? null) : null,
      customerName: customerName.trim() || null,
      customerPhone: customerPhone.trim() || null,
      notes: notes.trim() || null,
      items: cart.lines.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        notes: line.notes,
        modifierOptionIds: line.modifiers.map((m) => m.id),
      })),
    };

    // Validate with the very schema the API will apply, for instant feedback.
    const parsed = createPublicOrderSchema.safeParse(payload);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        fieldErrors[String(issue.path[0])] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setSubmitting(true);
    try {
      const result = await publicService.createOrder(slug, payload);
      cart.clear();
      onClose();
      // The tracking token is the customer's only handle on this order.
      router.push(`/order/track/${result.trackingToken}`);
    } catch (error) {
      if (error instanceof ApiError) {
        toast.error('ثبت سفارش انجام نشد', error.message);
        if (error.details) {
          setErrors(
            Object.fromEntries(
              Object.entries(error.details).map(([key, list]) => [
                key.split('.')[0],
                list[0],
              ]),
            ),
          );
        }
      } else {
        toast.error('ارتباط با سرور برقرار نشد');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="سبد خرید"
      description={
        restaurant.table
          ? `میز ${toPersianDigits(restaurant.table.number)}`
          : restaurant.branch.name
      }
      size="md"
      footer={
        cart.lines.length > 0 ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-ink-muted">جمع اقلام</span>
              <span className="font-semibold text-ink">
                {formatMoney(cart.estimatedSubtotal)}
              </span>
            </div>
            <p className="text-[0.7rem] leading-relaxed text-ink-subtle">
              مالیات و حق سرویس در فاکتور نهایی توسط سیستم محاسبه و اعمال می‌شود.
            </p>
            <Button
              variant="primary"
              size="lg"
              fullWidth
              loading={submitting}
              onClick={submit}
            >
              ثبت سفارش
            </Button>
          </div>
        ) : null
      }
    >
      {cart.lines.length === 0 ? (
        <div className="py-10 text-center">
          <ShoppingBag className="mx-auto mb-3 size-10 text-ink-subtle" />
          <p className="text-sm text-ink-muted">سبد خرید شما خالی است.</p>
        </div>
      ) : (
        <div className="space-y-5 pt-1">
          <ul className="divide-y divide-line">
            {cart.lines.map((line) => (
              <li key={line.key} className="flex gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{line.nameFa}</p>
                  {line.modifiers.length > 0 ? (
                    <p className="mt-0.5 truncate text-xs text-ink-muted">
                      {line.modifiers.map((m) => m.nameFa).join('، ')}
                    </p>
                  ) : null}
                  {line.notes ? (
                    <p className="mt-0.5 truncate text-xs text-caution">{line.notes}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-ink-subtle">
                    {formatMoney(line.unitPrice)}
                  </p>
                </div>

                <div className="flex shrink-0 flex-col items-end justify-between">
                  <span className="text-sm font-semibold text-ink">
                    {formatMoney(line.unitPrice * line.quantity, 'IRT', {
                      withUnit: false,
                    })}
                  </span>
                  <div className="flex items-center gap-1 rounded-lg border border-line bg-surface-sunken p-0.5">
                    <button
                      onClick={() => cart.setQuantity(line.key, line.quantity - 1)}
                      aria-label={line.quantity === 1 ? 'حذف' : 'کاهش'}
                      className="flex size-7 items-center justify-center rounded-md text-ink-muted hover:bg-surface-raised"
                    >
                      {line.quantity === 1 ? (
                        <Trash2 className="size-3.5 text-critical" />
                      ) : (
                        <Minus className="size-3.5" />
                      )}
                    </button>
                    <span className="w-6 text-center text-xs font-semibold tabular-nums">
                      {toPersianDigits(line.quantity)}
                    </span>
                    <button
                      onClick={() => cart.setQuantity(line.key, line.quantity + 1)}
                      aria-label="افزایش"
                      className="flex size-7 items-center justify-center rounded-md text-ink-muted hover:bg-surface-raised"
                    >
                      <Plus className="size-3.5" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {/* Only offer the modes this restaurant actually runs. */}
          {dineInAvailable && takeawayAvailable ? (
            <div>
              <p className="mb-2 text-sm font-medium text-ink-muted">نوع سفارش</p>
              <div className="grid grid-cols-2 gap-2">
                <ModeButton
                  active={orderType === 'DINE_IN'}
                  onClick={() => setOrderType('DINE_IN')}
                  icon={<UtensilsCrossed className="size-4" />}
                  label="سرو در محل"
                  sub={`میز ${toPersianDigits(restaurant.table?.number ?? 0)}`}
                />
                <ModeButton
                  active={orderType === 'TAKEAWAY'}
                  onClick={() => setOrderType('TAKEAWAY')}
                  icon={<ShoppingBag className="size-4" />}
                  label="بیرون‌بر"
                  sub="تحویل در محل"
                />
              </div>
            </div>
          ) : null}

          {orderType === 'TAKEAWAY' ? (
            <div className="space-y-3">
              <Input
                label="نام شما"
                placeholder="نام و نام خانوادگی"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                error={errors.customerName}
                required
              />
              <Input
                label="شماره موبایل"
                type="tel"
                inputMode="numeric"
                dir="ltr"
                placeholder="۰۹۱۲۱۲۳۴۵۶۷"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                error={errors.customerPhone}
                hint="برای اطلاع‌رسانی آماده شدن سفارش"
                required
              />
            </div>
          ) : (
            <Input
              label="نام (اختیاری)"
              placeholder="برای صدا زدن هنگام سرو"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              error={errors.customerName}
            />
          )}

          <Textarea
            label="توضیحات سفارش (اختیاری)"
            placeholder="مثلاً: لطفاً سفارش را یک‌جا بیاورید"
            rows={2}
            maxLength={500}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            error={errors.notes}
          />
        </div>
      )}
    </Modal>
  );
}

function ModeButton({
  active,
  onClick,
  icon,
  label,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  sub: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex flex-col items-center gap-1 rounded-xl border p-3 transition-colors',
        active
          ? 'border-gold/50 bg-gold/[0.08] text-ink'
          : 'border-line bg-surface-sunken text-ink-muted hover:border-line-strong',
      )}
    >
      <span className={active ? 'text-gold' : ''}>{icon}</span>
      <span className="text-sm font-medium">{label}</span>
      <span className="text-[0.7rem] text-ink-subtle">{sub}</span>
    </button>
  );
}
