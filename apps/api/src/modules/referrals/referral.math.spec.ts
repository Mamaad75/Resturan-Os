import {
  codeFromBytes,
  isSpendable,
  isWellFormedCode,
  normaliseCode,
  rewardDiscount,
  rewardsEarned,
  type PricedLine,
} from './referral.math';

const lines: PricedLine[] = [
  { productId: 'burger', quantity: 1, unitPrice: 300_000 },
  { productId: 'latte', quantity: 2, unitPrice: 90_000 },
];
const subtotal = 480_000;

describe('rewardDiscount', () => {
  describe('a percentage off', () => {
    it('takes the percentage off the food', () => {
      expect(
        rewardDiscount({ type: 'PERCENTAGE', value: 1_000, productId: null }, lines, subtotal),
      ).toBe(48_000);
    });

    it('never exceeds the bill', () => {
      expect(
        rewardDiscount({ type: 'PERCENTAGE', value: 20_000, productId: null }, lines, subtotal),
      ).toBe(subtotal);
    });

    it('is worth nothing at zero percent', () => {
      expect(
        rewardDiscount({ type: 'PERCENTAGE', value: 0, productId: null }, lines, subtotal),
      ).toBe(0);
    });
  });

  describe('a fixed amount off', () => {
    it('takes the amount off', () => {
      expect(
        rewardDiscount({ type: 'FIXED', value: 50_000, productId: null }, lines, subtotal),
      ).toBe(50_000);
    });

    it('stops at the bill rather than paying the customer', () => {
      expect(
        rewardDiscount({ type: 'FIXED', value: 900_000, productId: null }, lines, 30_000),
      ).toBe(30_000);
    });
  });

  describe('a free product', () => {
    it('is worth one unit of that product', () => {
      // Two lattes on the order; the reward covers one.
      expect(
        rewardDiscount({ type: 'FREE_PRODUCT', value: 0, productId: 'latte' }, lines, subtotal),
      ).toBe(90_000);
    });

    it('is worth nothing when the product is not on the order', () => {
      expect(
        rewardDiscount({ type: 'FREE_PRODUCT', value: 0, productId: 'tea' }, lines, subtotal),
      ).toBe(0);
    });

    it('is worth nothing when the product was deleted from the menu', () => {
      expect(
        rewardDiscount({ type: 'FREE_PRODUCT', value: 0, productId: null }, lines, subtotal),
      ).toBe(0);
    });

    it('does not match a line that has lost its product', () => {
      expect(
        rewardDiscount({ type: 'FREE_PRODUCT', value: 0, productId: null }, [
          { productId: null, quantity: 1, unitPrice: 90_000 },
        ], subtotal),
      ).toBe(0);
    });
  });

  it('is worth nothing on an order with no discountable food', () => {
    // Delivery-only totals are not a base a reward can eat into.
    expect(
      rewardDiscount({ type: 'FIXED', value: 50_000, productId: null }, lines, 0),
    ).toBe(0);
  });
});

describe('isSpendable', () => {
  const now = new Date('2026-09-26T12:00:00Z');

  it('accepts an available reward inside its window', () => {
    expect(
      isSpendable({ status: 'AVAILABLE', expiresAt: new Date('2026-10-01T00:00:00Z') }, now),
    ).toBe(true);
  });

  it('refuses one that has expired, whatever its status says', () => {
    expect(
      isSpendable({ status: 'AVAILABLE', expiresAt: new Date('2026-09-25T00:00:00Z') }, now),
    ).toBe(false);
  });

  it('refuses one that was already spent', () => {
    expect(
      isSpendable({ status: 'USED', expiresAt: new Date('2026-10-01T00:00:00Z') }, now),
    ).toBe(false);
  });
});

describe('rewardsEarned', () => {
  it('pays nothing before the threshold', () => {
    expect(rewardsEarned(2, 3)).toBe(0);
  });

  it('pays once the threshold is reached', () => {
    expect(rewardsEarned(3, 3)).toBe(1);
  });

  it('keeps paying for each further batch of friends', () => {
    expect(rewardsEarned(9, 3)).toBe(3);
    expect(rewardsEarned(10, 3)).toBe(3);
  });

  it('pays per friend when one is enough', () => {
    expect(rewardsEarned(4, 1)).toBe(4);
  });

  it('refuses to divide by a nonsense threshold', () => {
    expect(rewardsEarned(4, 0)).toBe(0);
  });
});

describe('invitation codes', () => {
  it('avoids the characters people misread', () => {
    const code = codeFromBytes(new Uint8Array([0, 1, 2, 3, 4, 5]));
    expect(code).toHaveLength(6);
    for (const confusable of ['O', '0', 'I', '1', 'L', 'S', '5', 'Z', '2']) {
      expect(code).not.toContain(confusable);
    }
  });

  it('is built from every byte it is given', () => {
    const a = codeFromBytes(new Uint8Array([1, 2, 3, 4, 5, 6]));
    const b = codeFromBytes(new Uint8Array([1, 2, 3, 4, 5, 7]));
    expect(a).not.toBe(b);
  });

  it('survives being given too few bytes', () => {
    expect(codeFromBytes(new Uint8Array([7]))).toHaveLength(6);
  });

  it('accepts a code typed in lower case with spaces around it', () => {
    expect(normaliseCode('  ab34cd ')).toBe('AB34CD');
    expect(isWellFormedCode(' ab34cd ')).toBe(true);
  });

  it('rejects a code containing a character it never issues', () => {
    expect(isWellFormedCode('AB0CDE')).toBe(false);
    expect(isWellFormedCode('ABCDE!')).toBe(false);
  });

  it('rejects one that is too short or absurdly long', () => {
    expect(isWellFormedCode('AB')).toBe(false);
    expect(isWellFormedCode('A'.repeat(17))).toBe(false);
  });
});
