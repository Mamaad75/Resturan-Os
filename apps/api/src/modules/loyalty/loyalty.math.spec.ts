import {
  DEFAULT_LOYALTY_RULES,
  expiresAt,
  pointsEarned,
  quoteRedemption,
  tierFor,
  type LoyaltyRules,
} from './loyalty.math';

const rules = (overrides: Partial<LoyaltyRules> = {}): LoyaltyRules => ({
  ...DEFAULT_LOYALTY_RULES,
  isEnabled: true,
  ...overrides,
});

describe('pointsEarned', () => {
  it('awards nothing while the scheme is off', () => {
    expect(pointsEarned(rules({ isEnabled: false }), 500_000)).toBe(0);
  });

  it('awards the advertised rate', () => {
    expect(pointsEarned(rules({ pointsPerThousand: 1 }), 250_000)).toBe(250);
    expect(pointsEarned(rules({ pointsPerThousand: 2 }), 250_000)).toBe(500);
  });

  it('rounds down, so it never pays more than advertised', () => {
    expect(pointsEarned(rules(), 1_999)).toBe(1);
    expect(pointsEarned(rules(), 999)).toBe(0);
  });

  it('handles a zero or negative bill', () => {
    expect(pointsEarned(rules(), 0)).toBe(0);
    expect(pointsEarned(rules(), -5_000)).toBe(0);
  });

  it('awards nothing when the rate is zero', () => {
    expect(pointsEarned(rules({ pointsPerThousand: 0 }), 500_000)).toBe(0);
  });
});

describe('quoteRedemption', () => {
  const base = { requestedPoints: 100, balance: 500, orderTotal: 1_000_000 };

  it('refuses while the scheme is off', () => {
    const quote = quoteRedemption(rules({ isEnabled: false }), base);
    expect(quote.points).toBe(0);
    expect(quote.reason).toContain('فعال نیست');
  });

  it('converts points at the configured rate', () => {
    const quote = quoteRedemption(rules({ tomanPerPoint: 1_000 }), base);
    expect(quote.points).toBe(100);
    expect(quote.discount).toBe(100_000);
    expect(quote.reason).toBeNull();
  });

  it('refuses to spend points the customer does not hold', () => {
    const quote = quoteRedemption(rules(), { ...base, requestedPoints: 600 });
    expect(quote.points).toBe(0);
    expect(quote.reason).toContain('کافی');
  });

  it('enforces the minimum redemption', () => {
    const quote = quoteRedemption(rules({ minRedeemPoints: 200 }), base);
    expect(quote.points).toBe(0);
    expect(quote.reason).toContain('200');
  });

  it('caps the discount at the configured share of the order', () => {
    // 50% of 100,000 is 50,000, which buys 50 points at 1,000 each.
    const quote = quoteRedemption(rules({ maxRedeemBps: 5_000, minRedeemPoints: 10 }), {
      requestedPoints: 500,
      balance: 500,
      orderTotal: 100_000,
    });
    expect(quote.points).toBe(50);
    expect(quote.discount).toBe(50_000);
  });

  it('never discounts more than the order is worth', () => {
    const quote = quoteRedemption(
      rules({ maxRedeemBps: 10_000, minRedeemPoints: 1 }),
      { requestedPoints: 10_000, balance: 10_000, orderTotal: 30_000 },
    );
    expect(quote.discount).toBeLessThanOrEqual(30_000);
    expect(quote.points).toBe(30);
  });

  it('rounds the cap down to whole points', () => {
    // 50% of 12,345 is 6,172; at 1,000 per point that is 6 points, not 6.17.
    const quote = quoteRedemption(rules({ minRedeemPoints: 1 }), {
      requestedPoints: 100,
      balance: 100,
      orderTotal: 12_345,
    });
    expect(quote.points).toBe(6);
    expect(quote.discount).toBe(6_000);
    expect(quote.discount).toBeLessThanOrEqual(Math.floor(12_345 * 0.5));
  });

  it('refuses when the order is too small to clear the minimum', () => {
    const quote = quoteRedemption(rules({ minRedeemPoints: 50 }), {
      requestedPoints: 100,
      balance: 100,
      orderTotal: 20_000,
    });
    expect(quote.points).toBe(0);
    expect(quote.reason).toContain('کافی نیست');
  });

  it('says nothing when nothing was asked for', () => {
    const quote = quoteRedemption(rules(), { ...base, requestedPoints: 0 });
    expect(quote.points).toBe(0);
    expect(quote.reason).toBeNull();
  });

  it('refuses an empty balance', () => {
    const quote = quoteRedemption(rules(), { ...base, balance: 0 });
    expect(quote.points).toBe(0);
  });

  it('ignores a fractional request', () => {
    const quote = quoteRedemption(rules({ minRedeemPoints: 1 }), {
      ...base,
      requestedPoints: 100.9,
    });
    expect(Number.isInteger(quote.points)).toBe(true);
    expect(quote.points).toBe(100);
  });

  it('never returns a discount that outruns the points spent', () => {
    for (const total of [10_000, 55_555, 1_000_000]) {
      for (const requested of [10, 50, 999]) {
        const quote = quoteRedemption(rules({ minRedeemPoints: 1 }), {
          requestedPoints: requested,
          balance: 999,
          orderTotal: total,
        });
        expect(quote.discount).toBe(quote.points * 1_000);
        expect(quote.discount).toBeLessThanOrEqual(total);
      }
    }
  });
});

describe('tierFor', () => {
  it('starts everyone at bronze', () => {
    expect(tierFor(0).key).toBe('BRONZE');
    expect(tierFor(-100).key).toBe('BRONZE');
  });

  it('promotes on lifetime spend', () => {
    expect(tierFor(5_000_000).key).toBe('SILVER');
    expect(tierFor(15_000_000).key).toBe('GOLD');
    expect(tierFor(40_000_000).key).toBe('PLATINUM');
  });

  it('reports the distance to the next tier', () => {
    const tier = tierFor(4_000_000);
    expect(tier.key).toBe('BRONZE');
    expect(tier.toNext).toBe(1_000_000);
    expect(tier.nextLabel).toBe('نقره‌ای');
  });

  it('has nowhere to go at the top', () => {
    const tier = tierFor(100_000_000);
    expect(tier.key).toBe('PLATINUM');
    expect(tier.toNext).toBeNull();
    expect(tier.nextLabel).toBeNull();
  });

  it('never moves backwards as spend rises', () => {
    const order = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM'];
    let previous = -1;
    for (const spent of [0, 1_000_000, 5_000_000, 20_000_000, 50_000_000]) {
      const index = order.indexOf(tierFor(spent).key);
      expect(index).toBeGreaterThanOrEqual(previous);
      previous = index;
    }
  });
});

describe('expiresAt', () => {
  const now = new Date('2026-01-01T00:00:00Z');

  it('returns null when points never lapse', () => {
    expect(expiresAt(rules({ expiryDays: null }), now)).toBeNull();
    expect(expiresAt(rules({ expiryDays: 0 }), now)).toBeNull();
  });

  it('counts forward from the earning date', () => {
    const expiry = expiresAt(rules({ expiryDays: 30 }), now);
    expect(expiry?.toISOString()).toBe('2026-01-31T00:00:00.000Z');
  });
});
