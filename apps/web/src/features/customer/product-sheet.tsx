'use client';

import {
  ModifierGroupType,
  type PublicModifierOption,
  type PublicProduct,
} from '@restaurant-os/types';
import { Minus, Plus } from 'lucide-react';
import Image from 'next/image';
import { useMemo, useState } from 'react';
import { Button, Modal, Textarea } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatMoney, toPersianDigits } from '@/lib/format';
import { useCart } from './cart';

/**
 * Product detail sheet with modifier selection.
 *
 * The same min/max/required rules the API enforces are applied here, so the
 * "add" button is only enabled for a selection the server will accept.
 */
export function ProductSheet({
  product,
  open,
  onClose,
}: {
  product: PublicProduct | null;
  open: boolean;
  onClose: () => void;
}) {
  const cart = useCart();
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [selected, setSelected] = useState<Record<string, string[]>>({});

  // Reset the sheet whenever a different product opens it.
  const productKey = product?.id ?? '';
  const [lastKey, setLastKey] = useState(productKey);
  if (productKey !== lastKey) {
    setLastKey(productKey);
    setQuantity(1);
    setNotes('');
    setSelected(
      Object.fromEntries(
        (product?.modifierGroups ?? []).map((group) => [
          group.id,
          // Pre-select the first option of a required single-choice group.
          group.isRequired && group.type === ModifierGroupType.SINGLE
            ? [group.options.find((o) => o.isAvailable)?.id].filter(Boolean) as string[]
            : [],
        ]),
      ),
    );
  }

  const chosenOptions = useMemo<PublicModifierOption[]>(() => {
    if (!product) return [];
    const byId = new Map(
      product.modifierGroups.flatMap((group) =>
        group.options.map((option) => [option.id, option] as const),
      ),
    );
    return Object.values(selected)
      .flat()
      .map((id) => byId.get(id))
      .filter((option): option is PublicModifierOption => Boolean(option));
  }, [product, selected]);

  const validation = useMemo(() => {
    if (!product) return { valid: false, message: null as string | null };
    for (const group of product.modifierGroups) {
      const count = selected[group.id]?.length ?? 0;
      const min = group.isRequired ? Math.max(group.minSelect, 1) : group.minSelect;
      if (count < min) {
        return { valid: false, message: `«${group.nameFa}» را انتخاب کنید.` };
      }
      const max = group.type === ModifierGroupType.SINGLE ? 1 : group.maxSelect;
      if (count > max) {
        return {
          valid: false,
          message: `برای «${group.nameFa}» حداکثر ${toPersianDigits(max)} گزینه.`,
        };
      }
    }
    return { valid: true, message: null };
  }, [product, selected]);

  if (!product) return null;

  const unitPrice =
    product.effectivePrice + chosenOptions.reduce((sum, o) => sum + o.priceDelta, 0);

  function toggle(groupId: string, optionId: string, type: ModifierGroupType) {
    setSelected((current) => {
      const existing = current[groupId] ?? [];
      if (type === ModifierGroupType.SINGLE) {
        return { ...current, [groupId]: [optionId] };
      }
      return {
        ...current,
        [groupId]: existing.includes(optionId)
          ? existing.filter((id) => id !== optionId)
          : [...existing, optionId],
      };
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={product.nameFa}
      description={product.descriptionFa ?? undefined}
      footer={
        <div className="space-y-3">
          {validation.message ? (
            <p className="text-center text-xs text-caution">{validation.message}</p>
          ) : null}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 rounded-xl border border-line bg-surface-sunken p-1">
              <button
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                aria-label="کاهش تعداد"
                className="flex size-9 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-raised hover:text-ink"
              >
                <Minus className="size-4" />
              </button>
              <span className="w-8 text-center text-sm font-semibold tabular-nums">
                {toPersianDigits(quantity)}
              </span>
              <button
                onClick={() => setQuantity((q) => Math.min(99, q + 1))}
                aria-label="افزایش تعداد"
                className="flex size-9 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-raised hover:text-ink"
              >
                <Plus className="size-4" />
              </button>
            </div>
            <Button
              variant="primary"
              size="lg"
              fullWidth
              disabled={!validation.valid || !product.isAvailable}
              onClick={() => {
                cart.add(product, chosenOptions, quantity, notes.trim() || null);
                onClose();
              }}
            >
              افزودن • {formatMoney(unitPrice * quantity)}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5 pt-1">
        {product.imageUrl ? (
          <div className="relative -mx-5 aspect-[16/10] overflow-hidden bg-surface-sunken sm:mx-0 sm:rounded-xl">
            <Image
              src={product.imageUrl}
              alt={product.nameFa}
              fill
              sizes="(max-width: 640px) 100vw, 512px"
              className="object-cover"
            />
          </div>
        ) : null}

        {product.calories ? (
          <p className="text-xs text-ink-subtle">
            {toPersianDigits(product.calories)} کالری
            {product.preparationMinutes
              ? ` • حدود ${toPersianDigits(product.preparationMinutes)} دقیقه`
              : ''}
          </p>
        ) : null}

        {product.modifierGroups.map((group) => (
          <fieldset key={group.id} className="space-y-2">
            <legend className="mb-2 flex items-baseline gap-2 text-sm font-semibold text-ink">
              {group.nameFa}
              <span className="text-xs font-normal text-ink-subtle">
                {group.isRequired
                  ? 'الزامی'
                  : group.type === ModifierGroupType.MULTIPLE
                    ? `تا ${toPersianDigits(group.maxSelect)} مورد`
                    : 'اختیاری'}
              </span>
            </legend>

            <div className="space-y-2">
              {group.options.map((option) => {
                const isChecked = (selected[group.id] ?? []).includes(option.id);
                return (
                  <label
                    key={option.id}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors',
                      isChecked
                        ? 'border-gold/50 bg-gold/[0.08]'
                        : 'border-line bg-surface-sunken hover:border-line-strong',
                      !option.isAvailable && 'cursor-not-allowed opacity-45',
                    )}
                  >
                    <input
                      type={group.type === ModifierGroupType.SINGLE ? 'radio' : 'checkbox'}
                      name={group.id}
                      checked={isChecked}
                      disabled={!option.isAvailable}
                      onChange={() => toggle(group.id, option.id, group.type)}
                      className="size-4 shrink-0 accent-[rgb(var(--gold))]"
                    />
                    <span className="flex-1 text-sm text-ink">{option.nameFa}</span>
                    {option.priceDelta > 0 ? (
                      <span className="text-xs text-ink-muted">
                        + {formatMoney(option.priceDelta, 'IRT', { withUnit: false })}
                      </span>
                    ) : null}
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}

        <Textarea
          label="توضیحات (اختیاری)"
          placeholder="مثلاً: بدون پیاز، کم‌نمک"
          rows={2}
          maxLength={200}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
    </Modal>
  );
}
