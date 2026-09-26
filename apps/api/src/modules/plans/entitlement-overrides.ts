import {
  PLAN_FEATURE_KEYS,
  PLAN_LIMIT_KEYS,
  type PlanFeatureKey,
  type PlanFeatures,
  type PlanLimitKey,
  type PlanLimits,
} from '@restaurant-os/types';

/**
 * Per-tenant exceptions to a plan.
 *
 * Support says yes to one restaurant - a second branch for a month, inventory
 * turned on while they trial it - and the alternative to this is inventing a
 * plan that then appears on the pricing page for everyone. An override is a
 * note about one tenant: anything it does not mention still follows the plan,
 * so a tenant who is later upgraded picks up the new plan's terms everywhere
 * the override is silent.
 *
 * Kept free of Prisma because it decides what a paying customer may do, and
 * because the values arrive as untyped JSON from a column that anything could
 * have written.
 */

/** A limit override. `null` means unlimited, which is a deliberate value. */
export type LimitOverrides = Partial<Record<PlanLimitKey, number | null>>;
export type FeatureOverrides = Partial<Record<PlanFeatureKey, boolean>>;

/**
 * Reads a limits override out of whatever the JSON column holds.
 *
 * Unknown keys are dropped rather than carried: a typo in a support tool must
 * not end up as an entitlement nobody can find again. A present key with an
 * explicit null is kept, because "unlimited" is a thing an admin grants.
 */
export function readLimitOverrides(raw: unknown): LimitOverrides {
  if (!isRecord(raw)) return {};
  const out: LimitOverrides = {};
  for (const key of PLAN_LIMIT_KEYS) {
    if (!(key in raw)) continue;
    const value = raw[key];
    if (value === null) {
      out[key] = null;
    } else if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
      out[key] = value;
    }
    // Anything else - a string, a float, a negative - is not a limit.
  }
  return out;
}

/** Reads a features override, keeping only real booleans for known features. */
export function readFeatureOverrides(raw: unknown): FeatureOverrides {
  if (!isRecord(raw)) return {};
  const out: FeatureOverrides = {};
  for (const key of PLAN_FEATURE_KEYS) {
    const value = raw[key];
    if (typeof value === 'boolean') out[key] = value;
  }
  return out;
}

/** The plan's limits with the tenant's exceptions applied. */
export function mergeLimits(
  planLimits: PlanLimits,
  overrides: LimitOverrides,
): PlanLimits {
  const merged = { ...planLimits };
  for (const key of PLAN_LIMIT_KEYS) {
    if (key in overrides) merged[key] = overrides[key] ?? null;
  }
  return merged;
}

/**
 * The plan's features with the tenant's exceptions applied.
 *
 * An override can turn a feature off as well as on: a tenant abusing campaign
 * sending is dealt with by switching campaigns off for them, not by moving
 * them to a plan they are not paying for.
 */
export function mergeFeatures(
  planFeatures: PlanFeatures,
  overrides: FeatureOverrides,
): PlanFeatures {
  const merged = { ...planFeatures };
  for (const key of PLAN_FEATURE_KEYS) {
    if (key in overrides) merged[key] = overrides[key] === true;
  }
  return merged;
}

/** True when a tenant has any exception at all, for the badge that says so. */
export function hasOverrides(
  limits: LimitOverrides,
  features: FeatureOverrides,
): boolean {
  return Object.keys(limits).length > 0 || Object.keys(features).length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
