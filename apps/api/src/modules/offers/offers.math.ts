/**
 * The arithmetic behind a checkout offer.
 *
 * Kept free of Prisma because these two numbers are the whole promise the
 * popup makes: the price a guest is shown before they pay, and the discount
 * the order is actually given. If they ever disagree, a customer is looking at
 * one number on the screen and a different one on the receipt, so they are
 * worked out in one place and tested on their own.
 */

/** A live offer as the popup and the order both see it. */
export interface OfferTerms {
  productId: string;
  /** Percentage off, in basis points. 2000 = 20%. */
  discountBps: number;
}

/** One priced order line, as the pricing service resolves it from the menu. */
export interface PricedLine {
  productId: string | null;
  quantity: number;
  unitPrice: number;
}

/**
 * What one unit of the offered product costs with the offer applied.
 *
 * Rounded to whole Toman, and never below zero however large a percentage an
 * owner typed - the schema caps it at 90%, but a price is not the place to
 * trust that.
 */
export function offerPrice(base: number, discountBps: number): number {
  return Math.max(0, base - offerDiscount(base, discountBps));
}

/** The discount one unit of the offered product is worth. */
export function offerDiscount(base: number, discountBps: number): number {
  if (base <= 0 || discountBps <= 0) return 0;
  return Math.min(base, Math.round((base * discountBps) / 10_000));
}

/**
 * The discount an accepted offer is worth on a whole order.
 *
 * Exactly one unit is discounted. "Add a croissant for 20% less" is an offer
 * on a croissant, not a standing discount on every croissant on the ticket, so
 * a guest who puts six in the basket pays full price for five.
 *
 * Returns zero when the offered product is not on the order at all, which is
 * the case that matters: a guest may accept an offer and then remove the item,
 * and the discount has to leave with it.
 */
export function offerDiscountForOrder(
  offer: OfferTerms,
  lines: PricedLine[],
): number {
  // An offer always names a product. Checked rather than assumed, because
  // `null === null` would otherwise match a line that has no product at all.
  if (!offer.productId) return 0;
  const line = lines.find((row) => row.productId === offer.productId);
  if (!line || line.quantity <= 0) return 0;
  return offerDiscount(line.unitPrice, offer.discountBps);
}

/** The headline shown when the owner did not write one. */
export function defaultOfferTitle(productNameFa: string, discountBps: number): string {
  return `امروز ${productNameFa} با ${Math.round(discountBps / 100)}٪ تخفیف`;
}
