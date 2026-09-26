/**
 * What a referral reward is worth, and what an invitation code looks like.
 *
 * Both are kept free of Prisma. The first is money - a free drink has to be
 * worth exactly the drink, and a percentage has to stop at the bill - and the
 * second is read aloud between friends, which is a design constraint of its
 * own.
 */

export type RewardType = 'PERCENTAGE' | 'FIXED' | 'FREE_PRODUCT';

export interface RewardTerms {
  type: RewardType;
  /** Basis points for PERCENTAGE, an amount for FIXED, unused otherwise. */
  value: number;
  productId: string | null;
}

/** One priced order line, as the pricing service resolves it. */
export interface PricedLine {
  productId: string | null;
  quantity: number;
  unitPrice: number;
}

/**
 * The discount a reward is worth on this order.
 *
 * Never more than the food: a 50,000 reward on a 30,000 order is worth 30,000,
 * because the alternative is a restaurant paying a customer to eat. Delivery
 * and tax are not part of the base for the same reason a coupon is not - the
 * courier still has to be paid.
 *
 * A free product is worth one unit of that product and only if it is on the
 * order. Nothing is quietly substituted: a guest who was promised a free latte
 * and ordered tea gets nothing, which is the honest outcome and the one the
 * checkout screen can explain.
 */
export function rewardDiscount(
  reward: RewardTerms,
  lines: PricedLine[],
  discountableSubtotal: number,
): number {
  if (discountableSubtotal <= 0) return 0;

  if (reward.type === 'FREE_PRODUCT') {
    if (!reward.productId) return 0;
    const line = lines.find((row) => row.productId === reward.productId);
    if (!line || line.quantity <= 0) return 0;
    return Math.min(discountableSubtotal, line.unitPrice);
  }

  if (reward.value <= 0) return 0;

  if (reward.type === 'PERCENTAGE') {
    return Math.min(
      discountableSubtotal,
      Math.round((discountableSubtotal * reward.value) / 10_000),
    );
  }

  return Math.min(discountableSubtotal, reward.value);
}

/**
 * Whether a reward can be spent right now.
 *
 * Expiry is checked here rather than by a nightly job: a sweep that has not run
 * yet must not be the reason an expired reward still pays out.
 */
export function isSpendable(
  reward: { status: string; expiresAt: Date },
  now: Date,
): boolean {
  return reward.status === 'AVAILABLE' && reward.expiresAt > now;
}

/**
 * Whether enough friends have ordered for the inviter to be paid.
 *
 * Rewards are granted per completed batch of invitations, so a programme that
 * asks for three friends pays on the third, the sixth and the ninth - not once
 * and then never again.
 */
export function rewardsEarned(
  invitedCount: number,
  invitesRequired: number,
): number {
  if (invitesRequired <= 0) return 0;
  return Math.floor(invitedCount / invitesRequired);
}

/*
 * The alphabet a code is drawn from.
 *
 * No O/0, no I/1/L, no S/5, no Z/2: these are codes people read to each other
 * across a table and retype from memory, and every one of those pairs is a
 * support conversation. What remains is unambiguous in both Latin and Persian
 * keyboard layouts.
 */
const ALPHABET = 'ABCDEFGHJKMNPQRTUVWXY34679';

/** Builds a code from bytes the caller supplies, so the source is testable. */
export function codeFromBytes(bytes: Uint8Array, length = 6): string {
  let code = '';
  for (let index = 0; index < length; index += 1) {
    code += ALPHABET[(bytes[index] ?? 0) % ALPHABET.length];
  }
  return code;
}

/** True for a code this system could have issued. */
export function isWellFormedCode(code: string): boolean {
  const normalised = code.trim().toUpperCase();
  if (normalised.length < 4 || normalised.length > 16) return false;
  return [...normalised].every((character) => ALPHABET.includes(character));
}

/** What a typed code becomes before it is looked up. */
export function normaliseCode(code: string): string {
  return code.trim().toUpperCase();
}
