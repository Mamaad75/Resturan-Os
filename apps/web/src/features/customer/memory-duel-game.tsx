'use client';

import { dealDeck, duelWinner, type DuelPlayer } from '@restaurant-os/types';
import { Crown, Timer } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';
import { toPersianDigits } from '@/lib/format';

/** A card as the board holds it. */
interface BoardCard {
  item: number;
  matched: boolean;
}

export interface DuelOutcome {
  scoreOne: number;
  scoreTwo: number;
  turns: number;
  durationMs: number;
}

/**
 * Memory Duel: two guests, one phone.
 *
 * Hot seat rather than two devices, because a game that needs both people to
 * scan, pair and stay connected is a game nobody finishes while waiting for
 * food - and the table already has one phone out on it.
 *
 * The board is dealt from the server's seed by the shared dealer, so what the
 * two players see is a table the server can reproduce when the result comes
 * back with a discount attached.
 */
export function MemoryDuelGame({
  seed,
  pairs,
  itemLabels,
  onFinish,
  finishing,
}: {
  seed: number;
  pairs: number;
  itemLabels: string[];
  onFinish: (outcome: DuelOutcome) => void;
  finishing: boolean;
}) {
  const [cards, setCards] = useState<BoardCard[]>([]);
  const [flipped, setFlipped] = useState<number[]>([]);
  const [turn, setTurn] = useState<DuelPlayer>(1);
  const [scores, setScores] = useState<[number, number]>([0, 0]);
  const [turns, setTurns] = useState(0);
  const [locked, setLocked] = useState(false);
  const startedAt = useRef<number>(Date.now());
  const submitted = useRef(false);

  useEffect(() => {
    setCards(dealDeck(seed, pairs).map((card) => ({ ...card, matched: false })));
    setFlipped([]);
    setTurn(1);
    setScores([0, 0]);
    setTurns(0);
    setLocked(false);
    startedAt.current = Date.now();
    submitted.current = false;
  }, [seed, pairs]);

  const finished = cards.length > 0 && cards.every((card) => card.matched);

  // Reported once. A second submission would be rejected by the server, but
  // the player should not see that error for a game they won.
  useEffect(() => {
    if (!finished || submitted.current) return;
    submitted.current = true;
    onFinish({
      scoreOne: scores[0],
      scoreTwo: scores[1],
      turns,
      durationMs: Date.now() - startedAt.current,
    });
  }, [finished, scores, turns, onFinish]);

  function flip(index: number) {
    if (locked || finished) return;
    if (cards[index]?.matched) return;
    if (flipped.includes(index)) return;

    const next = [...flipped, index];
    setFlipped(next);
    if (next.length < 2) return;

    setTurns((count) => count + 1);
    const [first, second] = next;

    if (cards[first].item === cards[second].item) {
      // A match scores and keeps the turn, which is what makes a good memory
      // worth having rather than just lucky.
      setCards((current) =>
        current.map((card, index) =>
          index === first || index === second ? { ...card, matched: true } : card,
        ),
      );
      setScores((current) => {
        const updated: [number, number] = [...current];
        updated[turn - 1] += 1;
        return updated;
      });
      setFlipped([]);
      return;
    }

    // A miss: both cards stay face up long enough to be remembered, then the
    // turn passes.
    setLocked(true);
    window.setTimeout(() => {
      setFlipped([]);
      setTurn((current) => (current === 1 ? 2 : 1));
      setLocked(false);
    }, 900);
  }

  const winner = duelWinner(scores[0], scores[1]);
  const columns = pairs <= 4 ? 'grid-cols-4' : 'grid-cols-4';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {([1, 2] as DuelPlayer[]).map((player) => (
          <div
            key={player}
            className={cn(
              'rounded-xl border p-3 text-center transition-colors',
              turn === player && !finished
                ? 'border-brand bg-brand/10'
                : 'border-line bg-surface',
            )}
          >
            <p className="text-xs text-ink-muted">
              بازیکن {toPersianDigits(player)}
              {turn === player && !finished ? ' — نوبت شماست' : ''}
            </p>
            <p className="mt-0.5 text-2xl font-extrabold tabular-nums text-ink">
              {toPersianDigits(scores[player - 1])}
            </p>
          </div>
        ))}
      </div>

      <div className={cn('grid gap-2', columns)}>
        {cards.map((card, index) => {
          const face = card.matched || flipped.includes(index);
          return (
            <button
              key={index}
              type="button"
              onClick={() => flip(index)}
              disabled={finished || card.matched}
              aria-label={face ? itemLabels[card.item] : 'کارت بسته'}
              className={cn(
                'flex aspect-square items-center justify-center rounded-xl border p-1 text-center text-xs font-medium leading-tight transition-all',
                face
                  ? card.matched
                    ? 'border-positive/40 bg-positive/10 text-positive'
                    : 'border-brand/50 bg-brand/10 text-ink'
                  : 'border-line bg-surface-sunken text-transparent hover:border-line-strong',
              )}
            >
              {face ? itemLabels[card.item] : '؟'}
            </button>
          );
        })}
      </div>

      {finished ? (
        <div className="rounded-xl border border-brand/30 bg-brand/[0.08] p-4 text-center">
          <Crown className="mx-auto mb-1 size-5 text-brand" aria-hidden />
          <p className="font-bold text-ink">
            {winner === 0
              ? 'مساوی شد!'
              : `بازیکن ${toPersianDigits(winner)} برنده شد!`}
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            {toPersianDigits(turns)} نوبت
          </p>
          {finishing ? (
            <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-ink-subtle">
              <Timer className="size-3.5 animate-pulse" aria-hidden />
              در حال ثبت نتیجه…
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-center text-xs text-ink-subtle">
          هر جفت درست، یک امتیاز و یک نوبت دیگر.
        </p>
      )}
    </div>
  );
}

/** Shown before the first card is turned, so both players know the rules. */
export function DuelIntro({
  rewardLabel,
  onStart,
  starting,
}: {
  rewardLabel: string | null;
  onStart: () => void;
  starting: boolean;
}) {
  return (
    <div className="space-y-3 text-center">
      <p className="text-sm leading-relaxed text-ink-muted">
        یک گوشی، دو نفر. به نوبت کارت برگردانید؛ هر جفت درست یک امتیاز دارد و
        نوبت را نگه می‌دارد.
        {rewardLabel ? ` برندهٔ بازی ${rewardLabel} می‌گیرد.` : ''}
      </p>
      <Button variant="primary" fullWidth loading={starting} onClick={onStart}>
        شروع دوئل
      </Button>
    </div>
  );
}
