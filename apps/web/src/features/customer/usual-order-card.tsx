'use client';

import type { PublicProduct } from '@restaurant-os/types';
import { useQuery } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react';
import { useMemo } from 'react';
import { cn } from '@/lib/cn';
import { formatMoney, toPersianDigits } from '@/lib/format';
import { publicService } from '@/services';
import { useCart } from './cart';
import { lastOrderToken } from './last-order-token';

/** One line of the usual order, resolved against today's menu. */
interface ResolvedLine {
  product: PublicProduct;
  quantity: number;
  modifierOptionIds: string[];
}

/**
 * "Order the usual" at the top of the menu.
 *
 * A regular who buys the same coffee every morning should not have to walk the
 * menu to find it. The server says which basket - by id - and everything the
 * guest sees is resolved from the menu already on the page, so a price that
 * changed overnight or an item that sold out this morning cannot be offered.
 *
 * Renders nothing at all unless there is a whole basket to offer: a partial
 * "your usual, minus the thing that is unavailable" is worse than no card.
 */
export function UsualOrderCard({
  slug,
  products,
  headingClassName,
  onAdded,
}: {
  slug: string;
  products: PublicProduct[];
  headingClassName?: string;
  /** Opens the basket, so re-ordering the usual is one tap and a confirmation. */
  onAdded?: () => void;
}) {
  const cart = useCart();
  // Read once per mount: the token only changes when an order is placed, and
  // that navigates away from the menu.
  const token = useMemo(() => lastOrderToken(slug), [slug]);

  const query = useQuery({
    queryKey: ['usual-order', slug, token],
    queryFn: () => publicService.usualOrder(slug, token!),
    enabled: token != null,
    staleTime: 300_000,
  });

  const byId = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );

  const lines = useMemo<ResolvedLine[] | null>(() => {
    const usual = query.data;
    if (!usual || usual.lines.length === 0) return null;

    const resolved: ResolvedLine[] = [];
    for (const line of usual.lines) {
      const product = byId.get(line.productId);
      // Gone from the menu, hidden, or sold out today - the basket cannot be
      // offered as "the usual" if any of it is missing.
      if (!product || !product.isAvailable) return null;

      const available = new Set(
        product.modifierGroups.flatMap((group) =>
          group.options.filter((option) => option.isAvailable).map((option) => option.id),
        ),
      );
      if (!line.modifierOptionIds.every((id) => available.has(id))) return null;

      resolved.push({
        product,
        quantity: line.quantity,
        modifierOptionIds: line.modifierOptionIds,
      });
    }
    return resolved;
  }, [query.data, byId]);

  if (!lines) return null;

  const total = lines.reduce((sum, line) => {
    const modifiers = line.product.modifierGroups
      .flatMap((group) => group.options)
      .filter((option) => line.modifierOptionIds.includes(option.id));
    const unit =
      line.product.effectivePrice +
      modifiers.reduce((extra, option) => extra + option.priceDelta, 0);
    return sum + unit * line.quantity;
  }, 0);

  const repeated = (query.data?.repeatCount ?? 0) >= 2;

  // Bound to the narrowed value: a hoisted function body would not know that
  // `lines` is non-null by the time it runs.
  const basket = lines;
  function addAll() {
    for (const line of basket) {
      const options = line.product.modifierGroups
        .flatMap((group) => group.options)
        .filter((option) => line.modifierOptionIds.includes(option.id));
      cart.add(line.product, options, line.quantity, null);
    }
    onAdded?.();
  }

  return (
    <section className="pt-[var(--menu-section-gap)]" aria-labelledby="heading-usual">
      <h2 id="heading-usual" className={headingClassName}>
        {/* Only called "your usual" once it actually is one. */}
        {repeated ? 'سفارش همیشگی شما' : 'آخرین سفارش شما'}
      </h2>

      <div className="rounded-[var(--menu-radius)] border border-brand/30 bg-brand/[0.06] p-4">
        <ul className="space-y-1.5">
          {lines.map((line) => {
            const chosen = line.product.modifierGroups
              .flatMap((group) => group.options)
              .filter((option) => line.modifierOptionIds.includes(option.id));
            return (
              <li
                key={`${line.product.id}-${line.modifierOptionIds.join('-')}`}
                className="flex items-baseline justify-between gap-3 text-sm"
              >
                <span className="min-w-0 text-ink">
                  <span className="font-medium">{line.product.nameFa}</span>
                  {line.quantity > 1 ? (
                    <span className="text-ink-muted">
                      {' '}
                      × {toPersianDigits(line.quantity)}
                    </span>
                  ) : null}
                  {chosen.length > 0 ? (
                    <span className="block truncate text-xs text-ink-muted">
                      {chosen.map((option) => option.nameFa).join('، ')}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-xs text-ink-subtle">
                  {formatMoney(line.product.effectivePrice, 'IRT', { withUnit: false })}
                </span>
              </li>
            );
          })}
        </ul>

        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-sm font-bold text-ink">{formatMoney(total)}</p>
          <button
            type="button"
            onClick={addAll}
            className={cn(
              'flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5',
              'text-sm font-semibold text-ink-inverse',
              'transition-transform active:scale-[0.98]',
            )}
          >
            <RotateCcw className="size-4" aria-hidden />
            همین را سفارش بده
          </button>
        </div>
      </div>
    </section>
  );
}
