import type { PlanFeatures, PlanLimits } from '@restaurant-os/types';
import {
  hasOverrides,
  mergeFeatures,
  mergeLimits,
  readFeatureOverrides,
  readLimitOverrides,
} from './entitlement-overrides';

/**
 * Per-tenant exceptions decide what a paying customer may do, and they arrive
 * as untyped JSON from a column a support tool wrote. These cover both halves:
 * that nothing unexpected becomes an entitlement, and that what an admin
 * actually granted survives.
 */
const PLAN_LIMITS: PlanLimits = {
  maxBranches: 1,
  maxStaff: 5,
  maxProducts: 60,
  maxTables: 10,
  maxMonthlyOrders: 1_000,
  smsAllowance: 200,
};

const PLAN_FEATURES: PlanFeatures = {
  customThemeEnabled: true,
  advancedThemeEnabled: false,
  customCssEnabled: false,
  crmEnabled: true,
  campaignsEnabled: false,
  takeawayEnabled: true,
  dineInEnabled: true,
  waiterCallEnabled: false,
  reportsEnabled: true,
  couponsEnabled: false,
  multiBranchEnabled: false,
};

describe('readLimitOverrides', () => {
  it('keeps a granted number', () => {
    expect(readLimitOverrides({ maxBranches: 3 })).toEqual({ maxBranches: 3 });
  });

  it('keeps an explicit null, which means unlimited', () => {
    expect(readLimitOverrides({ maxProducts: null })).toEqual({ maxProducts: null });
  });

  it('drops a key that is not a limit', () => {
    expect(readLimitOverrides({ maxBranches: 2, isAdmin: true })).toEqual({
      maxBranches: 2,
    });
  });

  it('drops values that are not whole, non-negative counts', () => {
    expect(
      readLimitOverrides({
        maxBranches: '3',
        maxStaff: -1,
        maxTables: 2.5,
        maxProducts: Number.NaN,
      }),
    ).toEqual({});
  });

  it('survives junk in the column', () => {
    expect(readLimitOverrides(null)).toEqual({});
    expect(readLimitOverrides('nope')).toEqual({});
    expect(readLimitOverrides([1, 2, 3])).toEqual({});
  });
});

describe('readFeatureOverrides', () => {
  it('keeps real booleans for known features', () => {
    expect(readFeatureOverrides({ crmEnabled: false, couponsEnabled: true })).toEqual({
      crmEnabled: false,
      couponsEnabled: true,
    });
  });

  it('ignores a truthy value that is not a boolean', () => {
    // '1' from a form that forgot to parse must not grant a paid feature.
    expect(readFeatureOverrides({ couponsEnabled: '1' })).toEqual({});
  });

  it('ignores an unknown feature name', () => {
    expect(readFeatureOverrides({ everythingEnabled: true })).toEqual({});
  });
});

describe('mergeLimits', () => {
  it('follows the plan where there is no exception', () => {
    expect(mergeLimits(PLAN_LIMITS, {})).toEqual(PLAN_LIMITS);
  });

  it('applies a granted extra branch without touching anything else', () => {
    const merged = mergeLimits(PLAN_LIMITS, { maxBranches: 2 });
    expect(merged.maxBranches).toBe(2);
    expect(merged.maxStaff).toBe(PLAN_LIMITS.maxStaff);
  });

  it('can grant unlimited', () => {
    expect(mergeLimits(PLAN_LIMITS, { maxProducts: null }).maxProducts).toBeNull();
  });

  it('can tighten a limit as well as raise it', () => {
    expect(mergeLimits(PLAN_LIMITS, { smsAllowance: 0 }).smsAllowance).toBe(0);
  });
});

describe('mergeFeatures', () => {
  it('follows the plan where there is no exception', () => {
    expect(mergeFeatures(PLAN_FEATURES, {})).toEqual(PLAN_FEATURES);
  });

  it('turns a feature on for one tenant', () => {
    const merged = mergeFeatures(PLAN_FEATURES, { couponsEnabled: true });
    expect(merged.couponsEnabled).toBe(true);
    expect(merged.campaignsEnabled).toBe(false);
  });

  it('turns a feature off, which is how abuse is handled', () => {
    expect(mergeFeatures(PLAN_FEATURES, { campaignsEnabled: false }).campaignsEnabled).toBe(
      false,
    );
    expect(mergeFeatures(PLAN_FEATURES, { crmEnabled: false }).crmEnabled).toBe(false);
  });

  it('never invents a feature the type does not have', () => {
    const merged = mergeFeatures(PLAN_FEATURES, readFeatureOverrides({ godMode: true }));
    expect(merged).toEqual(PLAN_FEATURES);
    expect('godMode' in merged).toBe(false);
  });
});

describe('hasOverrides', () => {
  it('is false for a tenant on plain plan terms', () => {
    expect(hasOverrides({}, {})).toBe(false);
  });

  it('is true when anything at all is excepted', () => {
    expect(hasOverrides({ maxBranches: 2 }, {})).toBe(true);
    expect(hasOverrides({}, { crmEnabled: true })).toBe(true);
  });
});
