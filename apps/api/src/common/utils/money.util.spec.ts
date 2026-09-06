import { computeOrderTotals, effectivePrice, lineTotal, toNumber } from './money.util';

describe('money utilities', () => {
  describe('lineTotal', () => {
    it('multiplies the modifier-inclusive unit price by quantity', () => {
      expect(lineTotal({ quantity: 3, unitPrice: 100_000, modifiersTotal: 25_000 })).toBe(
        375_000,
      );
    });

    it('handles a line with no modifiers', () => {
      expect(lineTotal({ quantity: 2, unitPrice: 145_000, modifiersTotal: 0 })).toBe(
        290_000,
      );
    });
  });

  describe('effectivePrice', () => {
    it('uses the discount price when it is genuinely lower', () => {
      expect(effectivePrice(320_000, 285_000)).toBe(285_000);
    });

    it('ignores a discount that is not lower than the base price', () => {
      expect(effectivePrice(320_000, 320_000)).toBe(320_000);
      expect(effectivePrice(320_000, 400_000)).toBe(320_000);
    });

    it('ignores a zero or absent discount', () => {
      expect(effectivePrice(320_000, 0)).toBe(320_000);
      expect(effectivePrice(320_000, null)).toBe(320_000);
    });
  });

  describe('computeOrderTotals', () => {
    const lines = [
      { quantity: 2, unitPrice: 210_000, modifiersTotal: 40_000 },
      { quantity: 1, unitPrice: 145_000, modifiersTotal: 30_000 },
    ];

    it('sums the subtotal from the priced lines', () => {
      const totals = computeOrderTotals(lines);
      expect(totals.subtotal).toBe(675_000);
      expect(totals.total).toBe(675_000);
    });

    it('applies service charge to the discounted base, then VAT on top', () => {
      const totals = computeOrderTotals(lines, {
        serviceChargeEnabled: true,
        serviceChargeBps: 1000,
        taxEnabled: true,
        taxRateBps: 900,
      });

      expect(totals.serviceChargeTotal).toBe(67_500);
      // VAT is charged on base + service charge, matching Iranian invoicing.
      expect(totals.taxTotal).toBe(66_825);
      expect(totals.total).toBe(675_000 + 67_500 + 66_825);
    });

    it('never lets a discount exceed the subtotal or drive the total negative', () => {
      const totals = computeOrderTotals(lines, { discountAmount: 10_000_000 });
      expect(totals.discountTotal).toBe(675_000);
      expect(totals.total).toBe(0);
    });

    it('treats a negative discount as zero', () => {
      const totals = computeOrderTotals(lines, { discountAmount: -50_000 });
      expect(totals.discountTotal).toBe(0);
      expect(totals.total).toBe(675_000);
    });

    it('leaves tax and service charge at zero when disabled', () => {
      const totals = computeOrderTotals(lines, {
        taxEnabled: false,
        taxRateBps: 900,
        serviceChargeEnabled: false,
        serviceChargeBps: 1000,
      });
      expect(totals.taxTotal).toBe(0);
      expect(totals.serviceChargeTotal).toBe(0);
    });

    it('produces integer amounts only, so no fractional Toman can appear', () => {
      const totals = computeOrderTotals([{ quantity: 3, unitPrice: 33_333, modifiersTotal: 0 }], {
        taxEnabled: true,
        taxRateBps: 900,
        serviceChargeEnabled: true,
        serviceChargeBps: 1000,
      });
      for (const value of Object.values(totals)) {
        expect(Number.isInteger(value)).toBe(true);
      }
    });

    it('returns zeroes for an empty order', () => {
      expect(computeOrderTotals([])).toEqual({
        subtotal: 0,
        discountTotal: 0,
        taxTotal: 0,
        serviceChargeTotal: 0,
        deliveryTotal: 0,
        total: 0,
      });
    });
  });

  /*
   * The courier fee is a carriage cost, not a menu item: it must not be
   * discounted, taxed, or service-charged, and must not inflate the subtotal
   * that a percentage coupon is measured against.
   */
  describe('computeOrderTotals with a delivery fee', () => {
    const line = { unitPrice: 100_000, modifiersTotal: 0, quantity: 2 };

    it('adds the fee to the total but not the subtotal', () => {
      const totals = computeOrderTotals([line], { deliveryFee: 45_000 });
      expect(totals.subtotal).toBe(200_000);
      expect(totals.deliveryTotal).toBe(45_000);
      expect(totals.total).toBe(245_000);
    });

    it('does not tax or service-charge the fee', () => {
      const withFee = computeOrderTotals([line], {
        deliveryFee: 45_000,
        taxEnabled: true,
        taxRateBps: 900,
        serviceChargeEnabled: true,
        serviceChargeBps: 1000,
      });
      const withoutFee = computeOrderTotals([line], {
        taxEnabled: true,
        taxRateBps: 900,
        serviceChargeEnabled: true,
        serviceChargeBps: 1000,
      });
      expect(withFee.taxTotal).toBe(withoutFee.taxTotal);
      expect(withFee.serviceChargeTotal).toBe(withoutFee.serviceChargeTotal);
      expect(withFee.total).toBe(withoutFee.total + 45_000);
    });

    it('does not let a discount eat the fee', () => {
      // A discount larger than the food still leaves the courier to be paid.
      const totals = computeOrderTotals([line], {
        discountAmount: 500_000,
        deliveryFee: 45_000,
      });
      expect(totals.discountTotal).toBe(200_000);
      expect(totals.total).toBe(45_000);
    });

    it('treats a negative fee as zero', () => {
      expect(computeOrderTotals([line], { deliveryFee: -1 }).total).toBe(200_000);
    });

    it('is zero when no fee is given', () => {
      expect(computeOrderTotals([line]).deliveryTotal).toBe(0);
    });
  });

  describe('toNumber', () => {
    it('converts a SQL bigint aggregate to a number', () => {
      expect(toNumber(123n)).toBe(123);
    });

    it('maps null and unparseable values to zero', () => {
      expect(toNumber(null)).toBe(0);
      expect(toNumber(undefined)).toBe(0);
      expect(toNumber('not a number')).toBe(0);
    });
  });
});
