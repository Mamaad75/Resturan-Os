import { gameLevel } from '@restaurant-os/types';
import { gameMoveSchema } from '@restaurant-os/validation';
import { moveGame, newGame, publicState } from './game.engine';

describe('Table games: authoritative rules', () => {
  it('starts with six pairs and exposes no hidden cards or future math answers', () => {
    const s = newGame('MEMORY');
    for (let i = 0; i < 6; i++)
      expect(s.board.filter((n) => n === i)).toHaveLength(2);
    expect(publicState(s).cards).toEqual(Array(12).fill(null));
    expect(Object.keys(publicState(newGame('MATH')))).toEqual(['question']);
  });
  it('rejects forged score fields, negative moves and noninteger moves at the boundary', () => {
    for (const input of [
      { revision: 0, value: 1, score: 999 },
      { revision: -1, value: 1 },
      { revision: 0, value: 1.5 },
    ])
      expect(gameMoveSchema.safeParse(input).success).toBe(false);
  });
  it('awards 60 XP for a perfect memory game, once', () => {
    let s = newGame('MEMORY');
    const original = structuredClone(s);
    for (let face = 0; face < 6; face++)
      for (let i = 0; i < 12; i++) if (s.board[i] === face) s = moveGame(s, i);
    expect(s.finished).toBe(true);
    expect(s.score).toBe(60);
    expect(s.turns).toBe(6);
    expect(original.matched).toEqual([]);
    expect(() => moveGame(s, 0)).toThrow(RangeError);
  });
  it('does not allow selecting one card twice to manufacture a pair', () => {
    const s = moveGame(newGame('MEMORY'), 0);
    expect(() => moveGame(s, 0)).toThrow();
    expect(() => moveGame(s, 12)).toThrow();
  });
  it('ends memory attempts after 24 failed pairs without reward', () => {
    let s = newGame('MEMORY');
    const other = s.board.findIndex((n) => n !== s.board[0]);
    for (let i = 0; i < 24; i++) {
      s = moveGame(s, 0);
      s = moveGame(s, other);
    }
    expect(s.finished).toBe(true);
    expect(s.score).toBe(0);
  });
  it('hides a failed pair on the next flip', () => {
    let s = newGame('MEMORY');
    const other = s.board.findIndex((n) => n !== s.board[0]);
    s = moveGame(moveGame(s, 0), other);
    const next = [1, 2, 3].find((i) => i !== other)!;
    s = moveGame(s, next);
    expect(publicState(s).cards?.[0]).toBeNull();
    expect(s.revealed).toEqual([next]);
  });
  it('scores math answers server-side and stops after five', () => {
    let s = newGame('MATH');
    for (let i = 0; i < 5; i++) {
      const q = s.questions[i];
      s = moveGame(
        s,
        i === 4 ? 200 : q.operation === '+' ? q.a + q.b : q.a - q.b,
      );
    }
    expect(s.score).toBe(48);
    expect(s.finished).toBe(true);
    expect(publicState(s).question).toBeUndefined();
  });
  it('levels use lifetime XP with bounded progression', () => {
    expect([0, 99, 100, 199, 200, 99999].map(gameLevel)).toEqual([
      1, 1, 2, 2, 3, 20,
    ]);
  });
});
