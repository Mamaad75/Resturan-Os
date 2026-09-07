import type { GameKind } from '@restaurant-os/types';
import { randomInt } from 'node:crypto';

export interface GameState {
  kind: GameKind;
  board: number[];
  matched: number[];
  revealed: number[];
  turns: number;
  questions: { a: number; b: number; operation: '+' | '-' }[];
  index: number;
  correct: number;
  finished: boolean;
  score: number;
}

export function newGame(kind: GameKind): GameState {
  const board = Array.from({ length: 12 }, (_, i) => i % 6);
  for (let i = board.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [board[i], board[j]] = [board[j], board[i]];
  }
  return {
    kind,
    board,
    matched: [],
    revealed: [],
    turns: 0,
    index: 0,
    correct: 0,
    questions: Array.from({ length: 5 }, () => ({
      a: randomInt(20, 80),
      b: randomInt(1, 20),
      operation: randomInt(2) ? '+' : '-',
    })),
    finished: false,
    score: 0,
  };
}

/** Only moves enter this function. Scores and the unrevealed board never come from a client. */
export function moveGame(previous: GameState, value: number): GameState {
  const s: GameState = structuredClone(previous);
  if (s.finished || !Number.isInteger(value))
    throw new RangeError('حرکت معتبر نیست.');
  if (s.kind === 'MEMORY') {
    if (value < 0 || value >= s.board.length || s.matched.includes(value))
      throw new RangeError('این کارت قابل انتخاب نیست.');
    if (s.revealed.length === 2) s.revealed = [];
    if (s.revealed.includes(value))
      throw new RangeError('کارت دیگری انتخاب کنید.');
    s.revealed.push(value);
    if (s.revealed.length === 2) {
      s.turns++;
      const [a, b] = s.revealed;
      if (s.board[a] === s.board[b]) s.matched.push(a, b);
      s.finished = s.matched.length === 12 || s.turns >= 24;
      if (s.finished && s.matched.length === 12)
        s.score = Math.max(12, 60 - Math.max(0, s.turns - 6) * 3);
    }
  } else {
    if (value < 0 || value > 200) throw new RangeError('پاسخ معتبر نیست.');
    const q = s.questions[s.index];
    if (value === (q.operation === '+' ? q.a + q.b : q.a - q.b)) s.correct++;
    s.index++;
    s.finished = s.index === s.questions.length;
    if (s.finished) s.score = s.correct * 12;
  }
  return s;
}

export function publicState(s: GameState) {
  return s.kind === 'MEMORY'
    ? {
        cards: s.board.map((n, i) =>
          s.matched.includes(i) || s.revealed.includes(i) ? n : null,
        ),
        matched: s.matched,
        turns: s.turns,
      }
    : {
        question: s.finished
          ? undefined
          : { ...s.questions[s.index], index: s.index },
      };
}
