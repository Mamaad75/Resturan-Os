/**
 * The arithmetic behind the points scheme.
 *
 * Kept free of Prisma so the rules that decide what a customer earns and what
 * they may spend can be tested exhaustively without a database - these are the
 * numbers a restaurant owner will be asked to explain to a customer at the
 * counter, and they have to be right.
 */

export interface LoyaltyRules {
  isEnabled: boolean;
  /** Points per 1,000 Toman of eligible spend. */
  pointsPerThousand: number;
  /** Toman a single point is worth on redemption. */
  tomanPerPoint: number;
  minRedeemPoints: number;
  /** Share of the order points may cover, in basis points. */
  maxRedeemBps: number;
  welcomePoints: number;
  expiryDays: number | null;
}

export const DEFAULT_LOYALTY_RULES: LoyaltyRules = {
  isEnabled: false,
  pointsPerThousand: 1,
  tomanPerPoint: 1_000,
  minRedeemPoints: 50,
  maxRedeemBps: 5_000,
  welcomePoints: 0,
  expiryDays: null,
};

/**
 * Points earned on an order.
 *
 * Measured on the food after discount, never on tax, service charge or the
 * courier fee: a customer should not earn points on the tax they paid, and a
 * restaurant paying a courier should not also pay points for the privilege.
 *
 * Rounded down, so a scheme can never award more than it advertises.
 */
export function pointsEarned(rules: LoyaltyRules, eligibleSpend: number): number {
  if (!rules.isEnabled || rules.pointsPerThousand <= 0) return 0;
  if (eligibleSpend <= 0) return 0;
  return Math.floor((eligibleSpend / 1_000) * rules.pointsPerThousand);
}

export interface RedemptionQuote {
  /** Points actually spent. Zero when nothing can be redeemed. */
  points: number;
  /** Toman taken off the order. */
  discount: number;
  /** Why nothing could be redeemed, for the customer to read. */
  reason: string | null;
}

/**
 * What a requested redemption is worth, after every cap.
 *
 * Three limits apply and the smallest wins: the balance the customer holds,
 * the share of this order points may cover, and the order total itself. The
 * result is always a whole number of points, so a redemption never leaves a
 * fractional point behind.
 */
export function quoteRedemption(
  rules: LoyaltyRules,
  args: { requestedPoints: number; balance: number; orderTotal: number },
): RedemptionQuote {
  const none = (reason: string | null): RedemptionQuote => ({
    points: 0,
    discount: 0,
    reason,
  });

  if (!rules.isEnabled) return none('باشگاه مشتریان فعال نیست.');
  if (rules.tomanPerPoint <= 0) return none('ارزش امتیاز تعریف نشده است.');

  const requested = Math.floor(args.requestedPoints);
  if (requested <= 0) return none(null);
  if (args.balance <= 0) return none('امتیازی برای استفاده ندارید.');

  if (requested > args.balance) {
    return none('امتیاز کافی ندارید.');
  }
  if (requested < rules.minRedeemPoints) {
    return none(`حداقل ${rules.minRedeemPoints} امتیاز برای استفاده لازم است.`);
  }

  // The order caps the discount, and so does the scheme's own ceiling.
  const orderCap =
    rules.maxRedeemBps > 0
      ? Math.floor((args.orderTotal * rules.maxRedeemBps) / 10_000)
      : args.orderTotal;
  const spendable = Math.max(0, Math.min(orderCap, args.orderTotal));

  // Whole points only: a cap between two point values rounds down, so the
  // discount can never exceed the cap.
  const affordablePoints = Math.floor(spendable / rules.tomanPerPoint);
  const points = Math.min(requested, affordablePoints);

  if (points < rules.minRedeemPoints) {
    return none('مبلغ این سفارش برای استفاده از امتیاز کافی نیست.');
  }

  return { points, discount: points * rules.tomanPerPoint, reason: null };
}

/** Customer tiers, derived from lifetime spend rather than stored. */
export const LOYALTY_TIERS = [
  { key: 'BRONZE', label: 'برنزی', minSpent: 0 },
  { key: 'SILVER', label: 'نقره‌ای', minSpent: 5_000_000 },
  { key: 'GOLD', label: 'طلایی', minSpent: 15_000_000 },
  { key: 'PLATINUM', label: 'پلاتین', minSpent: 40_000_000 },
] as const;

export type LoyaltyTierKey = (typeof LOYALTY_TIERS)[number]['key'];

export interface LoyaltyTier {
  key: LoyaltyTierKey;
  label: string;
  /** Toman still to spend to reach the next tier; null at the top. */
  toNext: number | null;
  nextLabel: string | null;
}

/** Which tier a lifetime spend falls into, and how far the next one is. */
export function tierFor(totalSpent: number): LoyaltyTier {
  const spent = Math.max(0, totalSpent);
  let index = 0;
  for (let i = LOYALTY_TIERS.length - 1; i >= 0; i -= 1) {
    if (spent >= LOYALTY_TIERS[i].minSpent) {
      index = i;
      break;
    }
  }
  const current = LOYALTY_TIERS[index];
  const next = LOYALTY_TIERS[index + 1];
  return {
    key: current.key,
    label: current.label,
    toNext: next ? next.minSpent - spent : null,
    nextLabel: next ? next.label : null,
  };
}

/** The instant a batch of points earned now would lapse. */
export function expiresAt(rules: LoyaltyRules, from: Date): Date | null {
  if (rules.expiryDays == null || rules.expiryDays <= 0) return null;
  return new Date(from.getTime() + rules.expiryDays * 86_400_000);
}
