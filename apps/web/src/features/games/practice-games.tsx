'use client';
import { useState } from 'react';
import { toPersianDigits as fa } from '@/lib/format';
const faces = ['☕', '🍕', '🍓', '🥐', '🍋', '🍔'];
export const tileClass =
  'flex aspect-square items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-3xl transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 disabled:cursor-default';
export function CardFace({ value }: { value: number | null }) {
  return <span aria-hidden>{value === null ? '✦' : faces[value]}</span>;
}
const shuffle = () => {
  const cards = Array.from({ length: 12 }, (_, i) => i % 6);
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
};
export function PracticeMemory() {
  const [board] = useState(shuffle);
  const [opened, setOpened] = useState<number[]>([]);
  const [matched, setMatched] = useState<number[]>([]);
  const [turns, setTurns] = useState(0);
  function flip(i: number) {
    if (matched.includes(i)) return;
    const next = opened.length === 2 ? [] : opened;
    if (next.includes(i)) return;
    const pair = [...next, i];
    setOpened(pair);
    if (pair.length === 2) {
      setTurns((t) => t + 1);
      if (board[pair[0]] === board[i]) setMatched((m) => [...m, ...pair]);
    }
  }
  return (
    <div>
      <p className="mb-4 text-sm text-white/60" aria-live="polite">
        {matched.length === 12
          ? 'عالی بود! همه‌ی جفت‌ها پیدا شدند.'
          : `جفت‌ها را پیدا کن • ${fa(turns)} حرکت`}
      </p>
      <div className="grid grid-cols-4 gap-3">
        {board.map((v, i) => (
          <button
            key={i}
            className={tileClass}
            onClick={() => flip(i)}
            disabled={matched.includes(i)}
            aria-label={`کارت ${fa(i + 1)}${matched.includes(i) ? '، پیدا شده' : ''}`}
          >
            <CardFace
              value={matched.includes(i) || opened.includes(i) ? v : null}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
function question() {
  return {
    a: Math.floor(Math.random() * 60) + 20,
    b: Math.floor(Math.random() * 19) + 1,
  };
}
export function PracticeMath() {
  const [q, setQ] = useState(question);
  const [answer, setAnswer] = useState('');
  const [round, setRound] = useState(0);
  const [correct, setCorrect] = useState(0);
  return round === 5 ? (
    <p className="py-10 text-center text-xl" role="status">
      {fa(correct)} پاسخ درست از ۵؛ دستت گرم شد!
    </p>
  ) : (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!answer.trim()) return;
        setCorrect(
          (c) =>
            c +
            (Number(
              answer.replace(/[۰-۹]/g, (n) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(n))),
            ) ===
            q.a + q.b
              ? 1
              : 0),
        );
        setRound((r) => r + 1);
        setAnswer('');
        setQ(question());
      }}
    >
      <p className="text-sm text-white/60">سؤال {fa(round + 1)} از ۵</p>
      <p dir="ltr" className="my-8 text-center text-5xl font-bold">
        {q.a} + {q.b} = ?
      </p>
      <label className="block text-sm">
        پاسخ تو
        <input
          autoFocus
          inputMode="numeric"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          className="mt-2 w-full rounded-xl border border-white/20 bg-white/10 p-4 text-white"
        />
      </label>
      <button className="mt-4 w-full rounded-xl bg-amber-300 p-3 font-bold text-stone-950">
        ثبت پاسخ
      </button>
    </form>
  );
}
const lines = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];
export function TableDuel() {
  const [board, setBoard] = useState<(string | null)[]>(Array(9).fill(null));
  const [turn, setTurn] = useState('X');
  const [names, setNames] = useState(['بازیکن اول', 'بازیکن دوم']);
  const [wins, setWins] = useState([0, 0]);
  const winner = lines.find(
    ([a, b, c]) => board[a] && board[a] === board[b] && board[b] === board[c],
  );
  const done = !!winner || board.every(Boolean);
  function move(i: number) {
    if (board[i] || done) return;
    const b = [...board];
    b[i] = turn;
    setBoard(b);
    if (lines.some(([a, c, d]) => b[a] && b[a] === b[c] && b[a] === b[d]))
      setWins((w) =>
        w.map((n, j) => n + (j === (turn === 'X' ? 0 : 1) ? 1 : 0)),
      );
    setTurn((t) => (t === 'X' ? 'O' : 'X'));
  }
  return (
    <div>
      <div className="mb-5 grid grid-cols-2 gap-3">
        {names.map((name, i) => (
          <label key={i} className="text-xs text-white/60">
            {i === 0 ? '✕' : '○'} • {fa(wins[i])} برد
            <input
              aria-label={`نام بازیکن ${i + 1}`}
              maxLength={20}
              value={name}
              onChange={(e) =>
                setNames((n) => n.map((v, j) => (j === i ? e.target.value : v)))
              }
              className="mt-2 w-full rounded-xl border border-white/15 bg-white/5 p-3 text-sm text-white"
            />
          </label>
        ))}
      </div>
      <p role="status" className="mb-4 text-center">
        {winner
          ? `${names[board[winner[0]] === 'X' ? 0 : 1]} برنده شد!`
          : done
            ? 'مساوی! یک دور دیگر؟'
            : `نوبت ${names[turn === 'X' ? 0 : 1]}`}
      </p>
      <div className="mx-auto grid max-w-xs grid-cols-3 gap-3" dir="ltr">
        {board.map((v, i) => (
          <button
            key={i}
            onClick={() => move(i)}
            disabled={!!v || done}
            aria-label={`خانه ${i + 1}${v ? `: ${v}` : ''}`}
            className={`${tileClass} ${v === 'X' ? 'text-amber-300' : 'text-teal-300'}`}
          >
            {v === 'X' ? '✕' : v === 'O' ? '○' : ''}
          </button>
        ))}
      </div>
      {done && (
        <button
          className="mt-5 w-full rounded-xl bg-white/10 p-3"
          onClick={() => {
            setBoard(Array(9).fill(null));
            setTurn('X');
          }}
        >
          دور بعد
        </button>
      )}
      <p className="mt-5 text-center text-xs leading-6 text-white/50">
        گوشی را نوبتی دست هم بدهید. امتیاز این رقابت فقط در همین صفحه نگه داشته
        می‌شود و به کیف امتیاز اضافه نمی‌شود.
      </p>
    </div>
  );
}
