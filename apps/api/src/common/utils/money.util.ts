/**
 * All money arithmetic lives here so totals are computed identically by the
 * order service, the POS preview endpoint and the reporting queries.
 *
 * Amounts are integers in the restaurant's currency unit (Toman by default),
 * which removes floating-point drift from the system entirely.
 */

export interface PricedLine {
  quantity: number;
  unitPrice: number;
  modifiersTotal: number;
}

export interface OrderTotals {
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  serviceChargeTotal: number;
  total: number;
}

export interface TotalsOptions {
  discountAmount?: number;
  taxEnabled?: boolean;
  /** Basis points: 900 = 9.00%. */
  taxRateBps?: number;
  serviceChargeEnabled?: boolean;
  serviceChargeBps?: number;
}

export function lineTotal(line: PricedLine): number {
  return (line.unitPrice + line.modifiersTotal) * line.quantity;
}

/**
 * Service charge applies to the discounted subtotal; VAT then applies to the
 * discounted subtotal plus service charge, matching Iranian invoice practice.
 */
export function computeOrderTotals(
  lines: PricedLine[],
  options: TotalsOptions = {},
): OrderTotals {
  const {
    discountAmount = 0,
    taxEnabled = false,
    taxRateBps = 0,
    serviceChargeEnabled = false,
    serviceChargeBps = 0,
  } = options;

  const subtotal = lines.reduce((sum, line) => sum + lineTotal(line), 0);
  // A discount can never exceed the subtotal or produce a negative total.
  const discountTotal = Math.min(Math.max(discountAmount, 0), subtotal);
  const base = subtotal - discountTotal;

  const serviceChargeTotal =
    serviceChargeEnabled && serviceChargeBps > 0
      ? Math.round((base * serviceChargeBps) / 10_000)
      : 0;

  const taxTotal =
    taxEnabled && taxRateBps > 0
      ? Math.round(((base + serviceChargeTotal) * taxRateBps) / 10_000)
      : 0;

  return {
    subtotal,
    discountTotal,
    taxTotal,
    serviceChargeTotal,
    total: base + serviceChargeTotal + taxTotal,
  };
}

/** `discountPrice` wins whenever it is set and genuinely lower. */
export function effectivePrice(price: number, discountPrice: number | null): number {
  if (discountPrice == null) return price;
  return discountPrice > 0 && discountPrice < price ? discountPrice : price;
}

/** Guards against a bigint coming back from a SQL aggregate. */
export function toNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
