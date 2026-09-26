/**
 * The seasonal competition.
 *
 * Every game a guest plays adds to their score for the current season, and the
 * board is what makes that worth doing: a restaurant's regulars competing over
 * a month is a reason to come back that no single discount buys.
 *
 * Ranking and masking live here, free of Prisma, because both are decisions
 * about people - who is ahead of whom, and how much of a stranger's identity a
 * public board is allowed to show.
 */

export interface StandingInput {
  playerId: string;
  name: string | null;
  phone: string;
  score: number;
  /** Tie-break: whoever reached the score first is ahead. */
  lastPlayAt: Date | null;
}

export interface Standing {
  /** Shared by tied players: two on 40 points are both second. */
  rank: number;
  displayName: string;
  score: number;
  /** True for the player who asked, so the board can highlight their row. */
  isYou: boolean;
}

/**
 * How a stranger appears on a public board.
 *
 * The name they gave, if they gave one; otherwise a phone number with its
 * middle removed. Never the whole number: a leaderboard is shown to everyone
 * who scans the QR code, and the guests on it did not agree to publish their
 * contact details to the room.
 */
export function maskPlayerName(name: string | null, phone: string): string {
  const trimmed = name?.trim();
  if (trimmed) return trimmed;

  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7) return 'مهمان';
  return `${digits.slice(0, 4)}***${digits.slice(-3)}`;
}

/**
 * The board, in order.
 *
 * Higher score first; ties broken by who got there first, because a player who
 * has held forty points all week is ahead of one who reached forty this
 * afternoon. Tied players still share a rank - the tie-break decides the row
 * order, not the prize.
 */
export type RankedEntry = StandingInput & { rank: number };

/**
 * The board with each player still attached.
 *
 * What the prize-giving uses: matching a masked row back to a person by name
 * and score would put the wrong coupon in somebody's hand the first time two
 * guests without names tied.
 */
export function rankEntries(
  entries: StandingInput[],
  options: { topN?: number } = {},
): RankedEntry[] {
  const sorted = [...entries]
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aTime = a.lastPlayAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bTime = b.lastPlayAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    });

  const ranked: RankedEntry[] = [];
  let rank = 0;
  let previousScore: number | null = null;

  for (let index = 0; index < sorted.length; index += 1) {
    const entry = sorted[index];
    // A new rank only when the score actually changes; equal scores share it.
    if (previousScore === null || entry.score !== previousScore) {
      rank = index + 1;
      previousScore = entry.score;
    }
    ranked.push({ ...entry, rank });
  }

  const topN = options.topN;
  return typeof topN === 'number' ? ranked.slice(0, topN) : ranked;
}

export function rankStandings(
  entries: StandingInput[],
  options: { topN?: number; youPlayerId?: string | null } = {},
): Standing[] {
  return rankEntries(entries, { topN: options.topN }).map((entry) => ({
    rank: entry.rank,
    displayName: maskPlayerName(entry.name, entry.phone),
    score: entry.score,
    isYou: options.youPlayerId != null && entry.playerId === options.youPlayerId,
  }));
}

/** Where one player sits, even when they are far below the visible board. */
export function rankOf(entries: StandingInput[], playerId: string): number | null {
  const all = rankStandings(entries, { youPlayerId: playerId });
  return all.find((standing) => standing.isYou)?.rank ?? null;
}

export interface SeasonPrize {
  /** Inclusive rank this prize covers, from 1. */
  rank: number;
  label: string;
  rewardType: 'PERCENTAGE' | 'FIXED';
  rewardValue: number;
  minOrderTotal: number;
  expiryDays: number;
}

/**
 * The prize for a finishing position, if any.
 *
 * Tied players each get the prize for the rank they share, which is the
 * generous reading and the only one that can be explained at the counter.
 */
export function prizeForRank(
  prizes: SeasonPrize[],
  rank: number,
): SeasonPrize | null {
  return prizes.find((prize) => prize.rank === rank) ?? null;
}

/** When the current season began, counting back from now in whole periods. */
export function seasonStart(
  startedAt: Date,
  periodDays: number,
  now: Date = new Date(),
): Date {
  const period = Math.max(1, Math.floor(periodDays)) * 86_400_000;
  const elapsed = now.getTime() - startedAt.getTime();
  if (elapsed < 0) return startedAt;
  const seasons = Math.floor(elapsed / period);
  return new Date(startedAt.getTime() + seasons * period);
}

/** When the current season ends. */
export function seasonEnd(
  startedAt: Date,
  periodDays: number,
  now: Date = new Date(),
): Date {
  const period = Math.max(1, Math.floor(periodDays)) * 86_400_000;
  return new Date(seasonStart(startedAt, periodDays, now).getTime() + period);
}
