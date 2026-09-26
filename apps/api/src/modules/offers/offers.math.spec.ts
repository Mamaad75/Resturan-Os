import {
  defaultOfferTitle,
  offerDiscount,
  offerDiscountForOrder,
  offerPrice,
  type PricedLine,
} from './offers.math';

describe('checkout offer arithmetic', () => {
  describe('offerPrice', () => {
    it('takes the advertised percentage off', () => {
      // 20% off a 100,000 croissant, the example the feature exists for.
      expect(offerPrice(100_000, 2_000)).toBe(80_000);
    });

    it('rounds to whole Toman', () => {
      // 33% of 85,000 is 28,050 exactly; 7% of 85,000 is 5,950. Neither
      // should ever produce a fractional price on a receipt.
      expect(offerPrice(85_000, 3_300)).toBe(56_950);
      expect(Number.isInteger(offerPrice(85_001, 3_333))).toBe(true);
    });

    it('never goes below zero', () => {
      expect(offerPrice(50_000, 20_000)).toBe(0);
    });

    it('leaves a price alone when there is no discount', () => {
      expect(offerPrice(75_000, 0)).toBe(75_000);
      expect(offerPrice(75_000, -500)).toBe(75_000);
    });

    it('agrees with the discount it is derived from', () => {
      for (const base of [15_000, 85_000, 130_000, 999_999]) {
        for (const bps of [100, 1_500, 2_000, 5_000, 9_000]) {
          expect(offerPrice(base, bps)).toBe(base - offerDiscount(base, bps));
        }
      }
    });
  });

  describe('offerDiscountForOrder', () => {
    const lines: PricedLine[] = [
      { productId: 'coffee', quantity: 2, unitPrice: 90_000 },
      { productId: 'croissant', quantity: 3, unitPrice: 85_000 },
    ];

    it('discounts one unit, not the whole line', () => {
      // Three croissants at 85,000 with a 20% offer: 17,000 off, once.
      expect(
        offerDiscountForOrder({ productId: 'croissant', discountBps: 2_000 }, lines),
      ).toBe(17_000);
    });

    it('is worth nothing when the product was removed from the cart', () => {
      expect(
        offerDiscountForOrder({ productId: 'brownie', discountBps: 2_000 }, lines),
      ).toBe(0);
    });

    it('is worth nothing on an empty order', () => {
      expect(
        offerDiscountForOrder({ productId: 'croissant', discountBps: 2_000 }, []),
      ).toBe(0);
    });

    it('ignores a line with no product', () => {
      expect(
        offerDiscountForOrder({ productId: null as unknown as string, discountBps: 2_000 }, [
          { productId: null, quantity: 1, unitPrice: 50_000 },
        ]),
      ).toBe(0);
    });

    it('never exceeds the price of the unit it discounts', () => {
      const discount = offerDiscountForOrder(
        { productId: 'croissant', discountBps: 20_000 },
        lines,
      );
      expect(discount).toBeLessThanOrEqual(85_000);
    });
  });

  describe('defaultOfferTitle', () => {
    it('reads as a sentence with a whole percentage', () => {
      expect(defaultOfferTitle('کروسان', 2_000)).toBe('امروز کروسان با 20٪ تخفیف');
    });

    it('does not print a fraction of a percent', () => {
      expect(defaultOfferTitle('لاته', 1_550)).toContain('16٪');
    });
  });
});
