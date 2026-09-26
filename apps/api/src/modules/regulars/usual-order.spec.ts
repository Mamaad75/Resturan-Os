import {
  basketSignature,
  pickUsualOrder,
  type HistoricOrder,
} from './usual-order';

const at = (iso: string) => new Date(iso);

const order = (
  id: string,
  iso: string,
  lines: Array<[string, number, string[]?]>,
): HistoricOrder => ({
  id,
  placedAt: at(iso),
  lines: lines.map(([productId, quantity, modifierOptionIds]) => ({
    productId,
    quantity,
    modifierOptionIds: modifierOptionIds ?? [],
  })),
});

describe('basketSignature', () => {
  it('ignores the order the lines were added in', () => {
    const a = basketSignature([
      { productId: 'coffee', quantity: 1, modifierOptionIds: [] },
      { productId: 'croissant', quantity: 2, modifierOptionIds: [] },
    ]);
    const b = basketSignature([
      { productId: 'croissant', quantity: 2, modifierOptionIds: [] },
      { productId: 'coffee', quantity: 1, modifierOptionIds: [] },
    ]);
    expect(a).toBe(b);
  });

  it('ignores the order modifiers were chosen in', () => {
    const a = basketSignature([
      { productId: 'coffee', quantity: 1, modifierOptionIds: ['large', 'oat'] },
    ]);
    const b = basketSignature([
      { productId: 'coffee', quantity: 1, modifierOptionIds: ['oat', 'large'] },
    ]);
    expect(a).toBe(b);
  });

  it('treats a different quantity as a different basket', () => {
    const one = basketSignature([
      { productId: 'coffee', quantity: 1, modifierOptionIds: [] },
    ]);
    const three = basketSignature([
      { productId: 'coffee', quantity: 3, modifierOptionIds: [] },
    ]);
    expect(one).not.toBe(three);
  });

  it('treats a different modifier as a different basket', () => {
    const oat = basketSignature([
      { productId: 'coffee', quantity: 1, modifierOptionIds: ['oat'] },
    ]);
    const plain = basketSignature([
      { productId: 'coffee', quantity: 1, modifierOptionIds: [] },
    ]);
    expect(oat).not.toBe(plain);
  });
});

describe('pickUsualOrder', () => {
  it('finds nothing in an empty history', () => {
    expect(pickUsualOrder([])).toBeNull();
  });

  it('picks the basket ordered most often', () => {
    const history = [
      order('1', '2026-09-01T08:00:00Z', [['coffee', 1]]),
      order('2', '2026-09-02T08:00:00Z', [['coffee', 1]]),
      order('3', '2026-09-03T08:00:00Z', [['coffee', 1]]),
      order('4', '2026-09-04T13:00:00Z', [['burger', 1], ['cola', 1]]),
    ];
    const usual = pickUsualOrder(history);
    expect(usual).not.toBeNull();
    expect(usual!.repeatCount).toBe(3);
    expect(usual!.lines).toHaveLength(1);
    expect(usual!.lines[0]?.productId).toBe('coffee');
  });

  it('takes the lines from the most recent time it was ordered', () => {
    const history = [
      order('1', '2026-09-01T08:00:00Z', [['coffee', 1, ['oat']]]),
      order('2', '2026-09-05T08:00:00Z', [['coffee', 1, ['oat']]]),
    ];
    const usual = pickUsualOrder(history);
    expect(usual!.lastOrderedAt.toISOString()).toBe('2026-09-05T08:00:00.000Z');
  });

  it('breaks a tie with the more recent habit', () => {
    // Two baskets, twice each. The one they have ordered lately is the usual.
    const history = [
      order('1', '2026-08-01T08:00:00Z', [['tea', 1]]),
      order('2', '2026-08-02T08:00:00Z', [['tea', 1]]),
      order('3', '2026-09-20T08:00:00Z', [['coffee', 1]]),
      order('4', '2026-09-21T08:00:00Z', [['coffee', 1]]),
    ];
    const usual = pickUsualOrder(history);
    expect(usual!.lines[0]?.productId).toBe('coffee');
  });

  it('returns a one-off order with a repeat count of one', () => {
    const usual = pickUsualOrder([
      order('1', '2026-09-01T08:00:00Z', [['coffee', 1]]),
    ]);
    expect(usual!.repeatCount).toBe(1);
  });

  it('skips an order whose product has been deleted from the menu', () => {
    const history: HistoricOrder[] = [
      {
        id: '1',
        placedAt: at('2026-09-05T08:00:00Z'),
        lines: [
          { productId: null, quantity: 1, modifierOptionIds: [] },
          { productId: 'coffee', quantity: 1, modifierOptionIds: [] },
        ],
      },
      order('2', '2026-09-01T08:00:00Z', [['tea', 1]]),
    ];
    // The newer order is unusable, so the older one is the only candidate.
    const usual = pickUsualOrder(history);
    expect(usual!.lines[0]?.productId).toBe('tea');
  });

  it('finds nothing when every order has a deleted product', () => {
    const usual = pickUsualOrder([
      {
        id: '1',
        placedAt: at('2026-09-05T08:00:00Z'),
        lines: [{ productId: null, quantity: 1, modifierOptionIds: [] }],
      },
    ]);
    expect(usual).toBeNull();
  });

  it('ignores an empty order', () => {
    const usual = pickUsualOrder([
      { id: '1', placedAt: at('2026-09-05T08:00:00Z'), lines: [] },
      order('2', '2026-09-01T08:00:00Z', [['tea', 1]]),
    ]);
    expect(usual!.lines[0]?.productId).toBe('tea');
  });

  it('keeps the modifiers, because the usual is the usual with oat milk', () => {
    const history = [
      order('1', '2026-09-01T08:00:00Z', [['coffee', 1, ['large', 'oat']]]),
      order('2', '2026-09-02T08:00:00Z', [['coffee', 1, ['large', 'oat']]]),
      order('3', '2026-09-03T08:00:00Z', [['coffee', 1]]),
    ];
    const usual = pickUsualOrder(history);
    expect(usual!.repeatCount).toBe(2);
    expect(usual!.lines[0]?.modifierOptionIds.sort()).toEqual(['large', 'oat']);
  });
});
