/**
 * Memory Duel: the two-player game.
 *
 * Two guests at one table share the phone that scanned the QR code and take
 * turns flipping cards. Hot seat rather than two devices on purpose: a game
 * that needs both people to scan, pair and stay connected is a game nobody
 * finishes while waiting for food, and the table already has one phone out.
 *
 * The deck is dealt from a seed the server issues, so the layout the players
 * see is one the server can reproduce - which is what lets it tell an honest
 * result from a typed-in one when a discount is at stake.
 *
 * Lives here, in shared types, precisely so that the client that deals the
 * cards and the server that checks the result cannot drift apart.
 */

/** One card: its position, and which pair it belongs to. */
export interface DuelCard {
  /** Index into the tenant's configured item labels. */
  item: number;
}

export type DuelPlayer = 1 | 2;
/** 0 is a draw, which an even number of pairs makes possible. */
export type DuelWinner = DuelPlayer | 0;

/**
 * A small, fast, deterministic PRNG.
 *
 * mulberry32: thirty-two bits of state, the same sequence in every JavaScript
 * engine. `Math.random` cannot be used here because the whole point is that
 * two machines deal the same deck.
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The deck for a seed: each item twice, shuffled.
 *
 * Fisher-Yates, drawing from the seeded generator, so the same seed always
 * produces the same table.
 */
export function dealDeck(seed: number, pairs: number): DuelCard[] {
  const count = Math.max(2, Math.min(12, Math.floor(pairs)));
  const cards: DuelCard[] = [];
  for (let item = 0; item < count; item += 1) {
    cards.push({ item }, { item });
  }

  const random = mulberry32(seed);
  for (let index = cards.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [cards[index], cards[swap]] = [cards[swap], cards[index]];
  }
  return cards;
}

/** Who won, from the two scores. */
export function duelWinner(scoreOne: number, scoreTwo: number): DuelWinner {
  if (scoreOne > scoreTwo) return 1;
  if (scoreTwo > scoreOne) return 2;
  return 0;
}

/**
 * The fewest and most turns a real game of this size can take.
 *
 * A turn is one pair of flips. The floor is the pairs themselves - a player
 * who somehow knew every position still has to turn each pair over. The
 * ceiling is generous: forgetting is allowed, and a pair can be missed many
 * times before it is found, but not unboundedly, and a client claiming a
 * thousand turns for six pairs is not reporting a game anybody played.
 */
export function duelTurnBounds(pairs: number): { min: number; max: number } {
  return { min: pairs, max: pairs * 12 };
}

export interface DuelResult {
  pairs: number;
  scoreOne: number;
  scoreTwo: number;
  turns: number;
  durationMs: number;
}

/**
 * Whether a submitted result could have come from a game of this size.
 *
 * Not proof - a hot-seat game is played entirely in the browser, and the only
 * honest claim is that nothing here is impossible. It rules out the results
 * that are: scores that do not account for every pair, a winner who did not
 * win, a game with fewer turns than pairs, and one played faster than a person
 * can tap.
 */
export function isPlausibleDuel(
  result: DuelResult,
  options: { maxDurationMs?: number } = {},
): boolean {
  const { pairs, scoreOne, scoreTwo, turns, durationMs } = result;
  if (!Number.isInteger(pairs) || pairs < 2 || pairs > 12) return false;
  if (!Number.isInteger(scoreOne) || !Number.isInteger(scoreTwo)) return false;
  if (scoreOne < 0 || scoreTwo < 0) return false;
  // Every pair is found by somebody before the game can end.
  if (scoreOne + scoreTwo !== pairs) return false;

  const bounds = duelTurnBounds(pairs);
  if (!Number.isInteger(turns) || turns < bounds.min || turns > bounds.max) {
    return false;
  }

  // Two taps and a moment to look, per turn, is about as fast as it goes.
  const floorMs = turns * 400;
  if (!Number.isInteger(durationMs) || durationMs < floorMs) return false;
  const ceiling = options.maxDurationMs ?? 15 * 60_000;
  return durationMs <= ceiling;
}
