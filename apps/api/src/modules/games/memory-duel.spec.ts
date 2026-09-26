import {
  dealDeck,
  duelTurnBounds,
  duelWinner,
  isPlausibleDuel,
  mulberry32,
  type DuelResult,
} from '@restaurant-os/types';

/**
 * The two-player game.
 *
 * Two properties matter: the same seed deals the same table on every machine -
 * which is the only reason the server can say anything about a hot-seat
 * result - and a submitted result that could not have come from a real game is
 * rejected, because a discount is attached to winning.
 */
describe('dealDeck', () => {
  it('deals every item exactly twice', () => {
    const deck = dealDeck(12345, 6);
    expect(deck).toHaveLength(12);
    for (let item = 0; item < 6; item += 1) {
      expect(deck.filter((card) => card.item === item)).toHaveLength(2);
    }
  });

  it('deals the same table for the same seed, on any machine', () => {
    expect(dealDeck(99, 6)).toEqual(dealDeck(99, 6));
  });

  it('deals a different table for a different seed', () => {
    // Not a guarantee for any given pair of seeds, but these two differ.
    expect(dealDeck(1, 8)).not.toEqual(dealDeck(2, 8));
  });

  it('actually shuffles rather than returning the pairs in order', () => {
    const deck = dealDeck(2024, 8);
    const sorted = deck.every((card, index) => card.item === Math.floor(index / 2));
    expect(sorted).toBe(false);
  });

  it('clamps an absurd pair count instead of allocating forever', () => {
    expect(dealDeck(1, 500)).toHaveLength(24);
    expect(dealDeck(1, 0)).toHaveLength(4);
    expect(dealDeck(1, 2.7)).toHaveLength(4);
  });
});

describe('mulberry32', () => {
  it('stays inside the unit interval', () => {
    const random = mulberry32(7);
    for (let i = 0; i < 500; i += 1) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('is a sequence, not a constant', () => {
    const random = mulberry32(7);
    const first = random();
    expect(random()).not.toBe(first);
  });

  it('repeats exactly for the same seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe('duelWinner', () => {
  it('names the higher score', () => {
    expect(duelWinner(4, 2)).toBe(1);
    expect(duelWinner(2, 4)).toBe(2);
  });

  it('calls a tie a draw', () => {
    expect(duelWinner(3, 3)).toBe(0);
  });
});

describe('isPlausibleDuel', () => {
  const good: DuelResult = {
    pairs: 6,
    scoreOne: 4,
    scoreTwo: 2,
    turns: 11,
    durationMs: 40_000,
  };

  it('accepts a game somebody actually played', () => {
    expect(isPlausibleDuel(good)).toBe(true);
  });

  it('rejects scores that do not account for every pair', () => {
    expect(isPlausibleDuel({ ...good, scoreOne: 3 })).toBe(false);
    expect(isPlausibleDuel({ ...good, scoreOne: 5, scoreTwo: 5 })).toBe(false);
  });

  it('rejects a negative score', () => {
    expect(isPlausibleDuel({ ...good, scoreOne: -1, scoreTwo: 7 })).toBe(false);
  });

  it('rejects fewer turns than there are pairs', () => {
    expect(isPlausibleDuel({ ...good, turns: 5 })).toBe(false);
  });

  it('rejects an implausible number of turns', () => {
    expect(isPlausibleDuel({ ...good, turns: 1_000 })).toBe(false);
  });

  it('rejects a game played faster than a person can tap', () => {
    expect(isPlausibleDuel({ ...good, durationMs: 100 })).toBe(false);
  });

  it('rejects a game left open all afternoon', () => {
    expect(isPlausibleDuel({ ...good, durationMs: 60 * 60_000 })).toBe(false);
  });

  it('rejects a board size the game does not offer', () => {
    expect(isPlausibleDuel({ ...good, pairs: 1, scoreOne: 1, scoreTwo: 0 })).toBe(false);
    expect(isPlausibleDuel({ ...good, pairs: 40 })).toBe(false);
  });

  it('rejects fractional counts', () => {
    expect(isPlausibleDuel({ ...good, turns: 11.5 })).toBe(false);
    expect(isPlausibleDuel({ ...good, scoreOne: 4.5, scoreTwo: 1.5 })).toBe(false);
  });

  it('accepts the fastest legitimate game of its size', () => {
    const bounds = duelTurnBounds(6);
    expect(
      isPlausibleDuel({
        pairs: 6,
        scoreOne: 6,
        scoreTwo: 0,
        turns: bounds.min,
        durationMs: bounds.min * 400,
      }),
    ).toBe(true);
  });
});
