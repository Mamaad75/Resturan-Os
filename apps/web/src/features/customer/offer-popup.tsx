'use client';

import { Sparkles } from 'lucide-react';
import Image from 'next/image';
import { Button, Modal } from '@/components/ui';
import { formatMoney, toPersianDigits } from '@/lib/format';
import type { CheckoutOfferDto } from '@/services';

/**
 * The one offer a guest sees on the way to paying.
 *
 * Deliberately a single decision with two plain buttons. Anything that looks
 * like an advertisement gets dismissed without being read, and anything that
 * makes declining hard gets dismissed angrily; the goal is a guest who adds a
 * croissant because they wanted one, not one who feels handled.
 *
 * The prices here are what the server quoted. It re-reads the offer when the
 * order is submitted, so this screen makes a promise about the discount, never
 * about the total.
 */
export function OfferPopup({
  offer,
  open,
  onAccept,
  onDecline,
}: {
  offer: CheckoutOfferDto | null;
  open: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  if (!offer) return null;

  const percent = Math.round(offer.discountBps / 100);
  const saving = Math.max(0, offer.price - offer.offerPrice);

  return (
    <Modal open={open} onClose={onDecline} title={undefined} size="sm">
      <div className="pb-2 text-center">
        {offer.imageUrl ? (
          <div className="relative mx-auto mb-4 size-28 overflow-hidden rounded-2xl">
            <Image
              src={offer.imageUrl}
              alt={offer.productNameFa}
              fill
              sizes="112px"
              className="object-cover"
            />
          </div>
        ) : (
          <div className="mx-auto mb-4 flex size-28 items-center justify-center rounded-2xl bg-gold/10">
            <Sparkles className="size-10 text-gold" aria-hidden />
          </div>
        )}

        <p className="text-xs font-medium text-gold">
          پیشنهاد ویژهٔ امروز
        </p>
        <h3 className="mt-1 text-lg font-bold leading-snug text-ink">
          {offer.title}
        </h3>

        <div className="mt-4 flex items-center justify-center gap-3">
          <span className="text-sm text-ink-subtle line-through">
            {formatMoney(offer.price)}
          </span>
          <span className="text-xl font-extrabold text-ink">
            {formatMoney(offer.offerPrice)}
          </span>
          <span className="rounded-lg bg-positive/15 px-2 py-0.5 text-xs font-bold text-positive">
            {toPersianDigits(percent)}٪
          </span>
        </div>

        {saving > 0 ? (
          <p className="mt-2 text-xs text-ink-muted">
            {formatMoney(saving)} کمتر از قیمت همیشگی
          </p>
        ) : null}

        <div className="mt-6 space-y-2">
          <Button variant="primary" size="lg" fullWidth onClick={onAccept}>
            اضافه کن به سفارشم
          </Button>
          {/* Declining is one tap and reads as a normal choice, not a penalty. */}
          <Button variant="ghost" fullWidth onClick={onDecline}>
            نه ممنون، سفارشم را ثبت کن
          </Button>
        </div>
      </div>
    </Modal>
  );
}
