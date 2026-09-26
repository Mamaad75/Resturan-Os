import {
  maskPlayerName,
  rankEntries,
  prizeForRank,
  rankOf,
  rankStandings,
  seasonEnd,
  seasonStart,
  type SeasonPrize,
  type StandingInput,
} from '@restaurant-os/types';

const at = (iso: string) => new Date(iso);

const player = (
  playerId: string,
  score: number,
  lastPlayAt: string | null,
  name: string | null = null,
): StandingInput => ({
  playerId,
  name,
  phone: `0912000${playerId}`,
  score,
  lastPlayAt: lastPlayAt ? at(lastPlayAt) : null,
});

/**
 * The public board.
 *
 * Two things it must get right: the order, because prizes hang off it, and how
 * much of a stranger it shows, because it is displayed to everyone who scans
 * the QR code.
 */
describe('maskPlayerName', () => {
  it('uses the name the guest gave', () => {
    expect(maskPlayerName('سارا', '09121234567')).toBe('سارا');
  });

  it('never shows a whole phone number', () => {
    const masked = maskPlayerName(null, '09121234567');
    expect(masked).not.toContain('1234567');
    expect(masked).toContain('***');
  });

  it('keeps enough for someone to recognise themselves', () => {
    expect(maskPlayerName(null, '09121234567')).toBe('0912***567');
  });

  it('falls back to a word rather than showing nonsense', () => {
    expect(maskPlayerName(null, '')).toBe('مهمان');
    expect(maskPlayerName('   ', '123')).toBe('مهمان');
  });
});

describe('rankStandings', () => {
  it('orders by score, highest first', () => {
    const board = rankStandings([
      player('a', 10, '2026-09-01T10:00:00Z'),
      player('b', 30, '2026-09-01T10:00:00Z'),
      player('c', 20, '2026-09-01T10:00:00Z'),
    ]);
    expect(board.map((row) => row.score)).toEqual([30, 20, 10]);
    expect(board.map((row) => row.rank)).toEqual([1, 2, 3]);
  });

  it('gives tied players the same rank', () => {
    const board = rankStandings([
      player('a', 40, '2026-09-01T10:00:00Z'),
      player('b', 40, '2026-09-02T10:00:00Z'),
      player('c', 10, '2026-09-01T10:00:00Z'),
    ]);
    expect(board.map((row) => row.rank)).toEqual([1, 1, 3]);
  });

  it('puts whoever got there first ahead, among equals', () => {
    const board = rankStandings([
      player('late', 40, '2026-09-05T10:00:00Z', 'دیر'),
      player('early', 40, '2026-09-01T10:00:00Z', 'زود'),
    ]);
    expect(board[0]?.displayName).toBe('زود');
  });

  it('leaves out players who have not scored', () => {
    const board = rankStandings([
      player('a', 0, null),
      player('b', 5, '2026-09-01T10:00:00Z'),
    ]);
    expect(board).toHaveLength(1);
  });

  it('marks the player who asked', () => {
    const board = rankStandings(
      [player('a', 10, '2026-09-01T10:00:00Z'), player('b', 20, '2026-09-01T10:00:00Z')],
      { youPlayerId: 'a' },
    );
    expect(board.find((row) => row.isYou)?.score).toBe(10);
    expect(board.filter((row) => row.isYou)).toHaveLength(1);
  });

  it('marks nobody when the asker is not a player', () => {
    const board = rankStandings([player('a', 10, '2026-09-01T10:00:00Z')], {
      youPlayerId: null,
    });
    expect(board.some((row) => row.isYou)).toBe(false);
  });

  it('cuts the board to the top N', () => {
    const board = rankStandings(
      [
        player('a', 10, '2026-09-01T10:00:00Z'),
        player('b', 20, '2026-09-01T10:00:00Z'),
        player('c', 30, '2026-09-01T10:00:00Z'),
      ],
      { topN: 2 },
    );
    expect(board).toHaveLength(2);
    expect(board[0]?.score).toBe(30);
  });

  it('is empty when nobody has played', () => {
    expect(rankStandings([])).toEqual([]);
  });
});

describe('rankOf', () => {
  const entries = [
    player('a', 10, '2026-09-01T10:00:00Z'),
    player('b', 30, '2026-09-01T10:00:00Z'),
    player('c', 20, '2026-09-01T10:00:00Z'),
  ];

  it('finds a player far below the visible board', () => {
    expect(rankOf(entries, 'a')).toBe(3);
  });

  it('returns nothing for somebody who has not played', () => {
    expect(rankOf(entries, 'nobody')).toBeNull();
  });
});

describe('prizeForRank', () => {
  const prizes: SeasonPrize[] = [
    { rank: 1, label: 'اول', rewardType: 'PERCENTAGE', rewardValue: 30, minOrderTotal: 0, expiryDays: 14 },
    { rank: 2, label: 'دوم', rewardType: 'PERCENTAGE', rewardValue: 20, minOrderTotal: 0, expiryDays: 14 },
  ];

  it('finds the prize for a winning position', () => {
    expect(prizeForRank(prizes, 1)?.label).toBe('اول');
  });

  it('gives nothing below the last prize', () => {
    expect(prizeForRank(prizes, 3)).toBeNull();
  });
});

describe('seasons', () => {
  const started = at('2026-01-01T00:00:00Z');

  it('runs from the start date for a brand new competition', () => {
    expect(seasonStart(started, 30, at('2026-01-05T00:00:00Z'))).toEqual(started);
  });

  it('rolls forward a whole period at a time', () => {
    expect(seasonStart(started, 30, at('2026-02-05T00:00:00Z'))).toEqual(
      at('2026-01-31T00:00:00Z'),
    );
  });

  it('ends one period after it begins', () => {
    const end = seasonEnd(started, 30, at('2026-01-05T00:00:00Z'));
    expect(end).toEqual(at('2026-01-31T00:00:00Z'));
  });

  it('does not run backwards for a start date in the future', () => {
    expect(seasonStart(started, 30, at('2025-12-01T00:00:00Z'))).toEqual(started);
  });

  it('survives a nonsense period', () => {
    expect(seasonStart(started, 0, at('2026-01-05T00:00:00Z'))).toEqual(
      at('2026-01-05T00:00:00Z'),
    );
  });
});

describe('rankEntries', () => {
  it('keeps each player attached to their rank', () => {
    const ranked = rankEntries([
      player('a', 10, '2026-09-01T10:00:00Z'),
      player('b', 30, '2026-09-01T10:00:00Z'),
    ]);
    expect(ranked[0]?.playerId).toBe('b');
    expect(ranked[0]?.rank).toBe(1);
  });

  it('tells two nameless tied players apart', () => {
    // The case that made the prize-giving match on ids rather than on the
    // masked name: same score, same mask, two different people.
    const ranked = rankEntries([
      { playerId: 'one', name: null, phone: '09120000000', score: 40, lastPlayAt: at('2026-09-01T10:00:00Z') },
      { playerId: 'two', name: null, phone: '09120000000', score: 40, lastPlayAt: at('2026-09-02T10:00:00Z') },
    ]);
    expect(ranked).toHaveLength(2);
    expect(new Set(ranked.map((row) => row.playerId)).size).toBe(2);
    expect(ranked.every((row) => row.rank === 1)).toBe(true);
  });

  it('agrees with the public board on order and rank', () => {
    const entries = [
      player('a', 10, '2026-09-01T10:00:00Z'),
      player('b', 40, '2026-09-02T10:00:00Z'),
      player('c', 40, '2026-09-01T10:00:00Z'),
    ];
    expect(rankEntries(entries).map((row) => row.rank)).toEqual(
      rankStandings(entries).map((row) => row.rank),
    );
  });
});
