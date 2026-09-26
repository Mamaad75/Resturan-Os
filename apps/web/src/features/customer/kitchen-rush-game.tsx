'use client';

import { useMutation } from '@tanstack/react-query';
import { Eye, Flame, Heart, Play, Timer, Trophy, UtensilsCrossed, Zap } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, useToast } from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { toPersianDigits } from '@/lib/format';
import {
  publicGameService,
  type KitchenRushSessionDto,
  type PlayResultDto,
  type PublicGameState,
} from '@/services';

type Phase = 'idle' | 'running' | 'submitting' | 'done';
type RoundMode = 'preview' | 'answer';
type Round = { order: string[]; options: string[]; index: number; position: number };
type Stats = {
  score: number;
  combo: number;
  comboMax: number;
  correct: number;
  mistakes: number;
  lives: number;
  secondsLeft: number;
};

function seeded(seed: number) {
  let x = seed || 123456789;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 1_000_000) / 1_000_000;
  };
}

function shuffle<T>(input: T[], rand: () => number): T[] {
  const items = [...input];
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function stageFor(progress: number) {
  if (progress < 0.34) {
    return { label: 'گرم‌کردن', orderSize: 2, optionCount: 4, previewMs: 1500, answerMs: 4600 };
  }
  if (progress < 0.7) {
    return { label: 'سرویس شلوغ', orderSize: 3, optionCount: 5, previewMs: 1250, answerMs: 3500 };
  }
  return { label: 'RUSH!', orderSize: 4, optionCount: 6, previewMs: 950, answerMs: 2600 };
}

export function KitchenRushGame({ token, state, onFinished }: { token: string; state: PublicGameState; onFinished: (result: PlayResultDto) => void }) {
  const toast = useToast();
  const config = state.kitchenRush;
  const [session, setSession] = useState<KitchenRushSessionDto | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [roundMode, setRoundMode] = useState<RoundMode>('preview');
  const [round, setRound] = useState<Round | null>(null);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | 'timeout' | null>(null);
  const [answerLocked, setAnswerLocked] = useState(false);
  const [stats, setStats] = useState<Stats>({
    score: 0,
    combo: 0,
    comboMax: 0,
    correct: 0,
    mistakes: 0,
    lives: config?.lives ?? 4,
    secondsLeft: config?.durationSeconds ?? 120,
  });

  const phaseRef = useRef<Phase>('idle');
  const modeRef = useRef<RoundMode>('preview');
  const sessionRef = useRef<KitchenRushSessionDto | null>(null);
  const statsRef = useRef(stats);
  const roundRef = useRef<Round | null>(null);
  const rngRef = useRef<(() => number) | null>(null);
  const roundTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishingRef = useRef(false);
  const answerLockedRef = useRef(false);

  const setPhaseSafe = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };
  const setModeSafe = (next: RoundMode) => {
    modeRef.current = next;
    setRoundMode(next);
  };
  const setAnswerLockedSafe = (locked: boolean) => {
    answerLockedRef.current = locked;
    setAnswerLocked(locked);
  };
  const clearRoundTimer = () => {
    if (roundTimerRef.current) clearTimeout(roundTimerRef.current);
    roundTimerRef.current = null;
  };

  useEffect(() => {
    statsRef.current = stats;
  }, [stats]);
  useEffect(() => {
    roundRef.current = round;
  }, [round]);
  useEffect(() => () => clearRoundTimer(), []);

  const start = useMutation({
    mutationFn: () => publicGameService.startKitchenRushByToken(token),
    onSuccess: (next) => {
      setSession(next);
      sessionRef.current = next;
      rngRef.current = seeded(next.seed);
      const elapsed = Math.max(0, Date.now() - new Date(next.startedAt).getTime());
      const secondsLeft = Math.max(1, Math.ceil((next.durationSeconds * 1000 - elapsed) / 1000));
      const initial: Stats = {
        score: 0,
        combo: 0,
        comboMax: 0,
        correct: 0,
        mistakes: 0,
        lives: next.lives,
        secondsLeft,
      };
      statsRef.current = initial;
      setStats(initial);
      setFeedback(null);
      setAnswerLockedSafe(false);
      finishingRef.current = false;
      setPhaseSafe('running');
      window.setTimeout(() => beginRound(next), 30);
    },
    onError: (error) => toast.error('بازی شروع نشد', error instanceof ApiError ? error.message : undefined),
  });

  const finish = useMutation({
    mutationFn: async ({ active, finalStats }: { active: KitchenRushSessionDto; finalStats: Stats }) => {
      const durationMs = Math.max(0, Date.now() - new Date(active.startedAt).getTime());
      return publicGameService.finishKitchenRushByToken(token, {
        sessionToken: active.sessionToken,
        score: finalStats.score,
        correct: finalStats.correct,
        mistakes: finalStats.mistakes,
        comboMax: finalStats.comboMax,
        durationMs,
      });
    },
    onSuccess: (result) => {
      setPhaseSafe('done');
      onFinished(result);
    },
    onError: (error) => {
      setPhaseSafe('idle');
      setSession(null);
      sessionRef.current = null;
      finishingRef.current = false;
      toast.error('نتیجه ثبت نشد', error instanceof ApiError ? error.message : undefined);
    },
  });

  function finishGame(finalStats = statsRef.current) {
    const active = sessionRef.current;
    if (!active || finishingRef.current) return;
    finishingRef.current = true;
    clearRoundTimer();
    setPhaseSafe('submitting');
    finish.mutate({ active, finalStats });
  }

  function beginRound(active = sessionRef.current) {
    if (!active || finishingRef.current || phaseRef.current !== 'running') return;
    clearRoundTimer();
    const rand = rngRef.current ?? seeded(active.seed);
    rngRef.current = rand;
    const elapsed = Math.max(0, Date.now() - new Date(active.startedAt).getTime());
    const progress = Math.min(1, elapsed / (active.durationSeconds * 1000));
    const stage = stageFor(progress);
    const labels = active.itemLabels.filter(Boolean);
    if (labels.length < 2) {
      toast.error('آیتم‌های بازی کافی نیست');
      finishGame(statsRef.current);
      return;
    }

    const order = Array.from({ length: stage.orderSize }, () => labels[Math.floor(rand() * labels.length)] ?? labels[0]);
    const optionSet = new Set(order);
    while (optionSet.size < Math.min(stage.optionCount, labels.length)) {
      optionSet.add(labels[Math.floor(rand() * labels.length)] ?? labels[0]);
    }
    const next: Round = {
      order,
      options: shuffle([...optionSet], rand),
      index: (roundRef.current?.index ?? 0) + 1,
      position: 0,
    };
    roundRef.current = next;
    setRound(next);
    setFeedback(null);
    setAnswerLockedSafe(false);
    setModeSafe('preview');
    roundTimerRef.current = setTimeout(() => {
      if (phaseRef.current !== 'running' || finishingRef.current) return;
      setModeSafe('answer');
      scheduleAnswerTimeout(stage.answerMs);
    }, stage.previewMs);
  }

  function scheduleAnswerTimeout(ms: number) {
    clearRoundTimer();
    roundTimerRef.current = setTimeout(() => handleTimeout(), ms);
  }

  function handleTimeout() {
    if (phaseRef.current !== 'running' || modeRef.current !== 'answer' || finishingRef.current) return;
    setAnswerLockedSafe(true);
    const previous = statsRef.current;
    const nextStats: Stats = {
      ...previous,
      combo: 0,
      mistakes: previous.mistakes + 1,
      lives: Math.max(0, previous.lives - 1),
    };
    statsRef.current = nextStats;
    setStats(nextStats);
    setFeedback('timeout');
    if (nextStats.lives <= 0) {
      window.setTimeout(() => finishGame(nextStats), 250);
      return;
    }
    window.setTimeout(() => beginRound(), 330);
  }

  function answer(value: string) {
    const active = sessionRef.current;
    const current = roundRef.current;
    if (!active || !current || phaseRef.current !== 'running' || modeRef.current !== 'answer' || finishingRef.current || answerLockedRef.current) return;
    clearRoundTimer();

    const expected = current.order[current.position];
    const previous = statsRef.current;
    if (value === expected) {
      const combo = previous.combo + 1;
      const multiplier = Math.min(3, 1 + Math.floor(combo / active.comboStep));
      const fever = combo >= active.feverThreshold;
      const gained = active.scorePerCorrect * multiplier * (fever ? 2 : 1);
      const nextStats: Stats = {
        ...previous,
        score: previous.score + gained,
        combo,
        comboMax: Math.max(previous.comboMax, combo),
        correct: previous.correct + 1,
      };
      statsRef.current = nextStats;
      setStats(nextStats);
      setFeedback('correct');

      const nextPosition = current.position + 1;
      if (nextPosition >= current.order.length) {
        setAnswerLockedSafe(true);
        window.setTimeout(() => beginRound(active), 260);
        return;
      }
      const nextRound = { ...current, position: nextPosition };
      roundRef.current = nextRound;
      setRound(nextRound);
      const elapsed = Math.max(0, Date.now() - new Date(active.startedAt).getTime());
      const stage = stageFor(Math.min(1, elapsed / (active.durationSeconds * 1000)));
      scheduleAnswerTimeout(stage.answerMs);
      return;
    }

    const nextStats: Stats = {
      ...previous,
      combo: 0,
      mistakes: previous.mistakes + 1,
      lives: Math.max(0, previous.lives - 1),
    };
    statsRef.current = nextStats;
    setStats(nextStats);
    setFeedback('wrong');
    setAnswerLockedSafe(true);
    if (nextStats.lives <= 0) {
      window.setTimeout(() => finishGame(nextStats), 250);
      return;
    }
    const elapsed = Math.max(0, Date.now() - new Date(active.startedAt).getTime());
    const stage = stageFor(Math.min(1, elapsed / (active.durationSeconds * 1000)));
    window.setTimeout(() => {
      if (phaseRef.current !== 'running' || finishingRef.current) return;
      setAnswerLockedSafe(false);
      scheduleAnswerTimeout(stage.answerMs);
    }, 220);
  }

  useEffect(() => {
    if (phase !== 'running' || !session) return;
    const id = window.setInterval(() => {
      const elapsed = Math.max(0, Date.now() - new Date(session.startedAt).getTime());
      const left = Math.max(0, Math.ceil((session.durationSeconds * 1000 - elapsed) / 1000));
      setStats((current) => {
        if (current.secondsLeft === left) return current;
        const next = { ...current, secondsLeft: left };
        statsRef.current = next;
        return next;
      });
      if (left <= 0) finishGame(statsRef.current);
    }, 250);
    return () => window.clearInterval(id);
  }, [phase, session]);

  const totalDuration = session?.durationSeconds ?? config?.durationSeconds ?? 120;
  const progress = Math.min(1, Math.max(0, 1 - stats.secondsLeft / totalDuration));
  const stage = stageFor(progress);
  const fever = !!session && stats.combo >= session.feverThreshold;
  const rewardHint = useMemo(() => {
    const rewards = config?.rewards ?? [];
    return rewards.slice().sort((a, b) => a.minScore - b.minScore).find((reward) => stats.score < reward.minScore) ?? null;
  }, [config?.rewards, stats.score]);

  if (!config || !config.enabled) return null;

  if (phase === 'idle') {
    if (!config.canPlay) {
      return (
        <div className="w-full rounded-2xl border border-line bg-surface p-4 text-center">
          <Flame className="mx-auto size-8 text-brand" />
          <p className="mt-2 text-sm font-semibold text-ink">Kitchen Rush</p>
          <p className="mt-1 text-xs text-ink-subtle">
            {config.nextPlayAt ? `نوبت بعدی: ${new Date(config.nextPlayAt).toLocaleString('fa-IR')}` : 'فعلاً امکان بازی نیست.'}
          </p>
        </div>
      );
    }
    return (
      <div className="w-full overflow-hidden rounded-2xl border border-brand/25 bg-gradient-to-b from-brand/10 to-surface p-4">
        <div className="flex items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-brand/15"><Flame className="size-6 text-brand" /></span>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-ink">Kitchen Rush: Memory Service</p>
            <p className="mt-0.5 text-xs leading-5 text-ink-muted">سفارش چندآیتمی چند لحظه نمایش داده می‌شود؛ به خاطر بسپار و بعد آیتم‌ها را دقیقاً به همان ترتیب بزن. هرچه جلوتر بروی سفارش‌ها بلندتر و سریع‌تر می‌شوند.</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-xl bg-surface-sunken p-2"><Timer className="mx-auto mb-1 size-4 text-brand" />{toPersianDigits(config.durationSeconds)} ثانیه</div>
          <div className="rounded-xl bg-surface-sunken p-2"><Heart className="mx-auto mb-1 size-4 text-critical" />{toPersianDigits(config.lives)} جان</div>
          <div className="rounded-xl bg-surface-sunken p-2"><Zap className="mx-auto mb-1 size-4 text-brand" />Fever ×2</div>
        </div>
        <Button className="mt-4" variant="primary" fullWidth leftIcon={<Play className="size-4" />} loading={start.isPending} onClick={() => start.mutate()}>
          شروع Kitchen Rush
        </Button>
      </div>
    );
  }

  if (phase === 'submitting') {
    return <div className="w-full rounded-2xl border border-line bg-surface p-6 text-center text-sm text-ink-muted">در حال ثبت و اعتبارسنجی نتیجه…</div>;
  }
  if (phase === 'done') return null;

  return (
    <div className={cn('w-full overflow-hidden rounded-2xl border p-3 transition-colors', fever ? 'border-brand bg-brand/10' : 'border-line bg-surface')}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2"><Badge tone={stage.label === 'RUSH!' ? 'critical' : 'brand'}>{stage.label}</Badge>{fever ? <Badge tone="brand">🔥 FEVER ×2</Badge> : null}</div>
        <div className="flex items-center gap-1 text-critical" aria-label={`${stats.lives} جان`}>
          {Array.from({ length: session?.lives ?? config.lives }).map((_, index) => <Heart key={index} className={cn('size-4', index < stats.lives ? 'fill-current' : 'opacity-20')} />)}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Stat label="زمان" value={toPersianDigits(stats.secondsLeft)} icon={<Timer className="size-3.5" />} />
        <Stat label="امتیاز" value={toPersianDigits(stats.score)} icon={<Trophy className="size-3.5" />} />
        <Stat label="Combo" value={`×${toPersianDigits(stats.combo)}`} icon={<Zap className="size-3.5" />} />
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-sunken"><div className="h-full bg-brand transition-all" style={{ width: `${Math.min(100, progress * 100)}%` }} /></div>

      <div className={cn('mt-4 rounded-2xl border p-4 text-center transition-colors', feedback === 'wrong' || feedback === 'timeout' ? 'border-critical/40 bg-critical/10' : feedback === 'correct' ? 'border-positive/40 bg-positive/10' : 'border-line bg-surface-sunken')}>
        {roundMode === 'preview' ? <Eye className="mx-auto size-6 text-brand" /> : <UtensilsCrossed className="mx-auto size-6 text-brand" />}
        <p className="mt-2 text-xs text-ink-subtle">سفارش #{toPersianDigits(round?.index ?? 1)}</p>
        {roundMode === 'preview' ? (
          <>
            <p className="mt-1 text-sm font-bold text-ink">سفارش را به خاطر بسپار</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {(round?.order ?? []).map((item, index) => <span key={`${item}-${index}`} className="rounded-xl border border-brand/30 bg-brand/10 px-3 py-2 text-sm font-semibold text-ink"><span className="me-1 text-[0.65rem] text-brand">{toPersianDigits(index + 1)}</span>{item}</span>)}
            </div>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm font-bold text-ink">آیتم بعدی را انتخاب کن</p>
            <div className="mt-3 flex justify-center gap-1.5">
              {(round?.order ?? []).map((_, index) => <span key={index} className={cn('h-2.5 w-8 rounded-full', index < (round?.position ?? 0) ? 'bg-positive' : index === (round?.position ?? 0) ? 'bg-brand' : 'bg-line-strong')} />)}
            </div>
            {feedback === 'wrong' ? <p className="mt-2 text-xs font-medium text-critical">اشتباه بود؛ یک جان کم شد.</p> : feedback === 'timeout' ? <p className="mt-2 text-xs font-medium text-critical">زمان سفارش تمام شد.</p> : null}
          </>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {(round?.options ?? []).map((option) => (
          <button type="button" key={option} disabled={roundMode !== 'answer' || answerLocked} onClick={() => answer(option)} className="min-h-14 rounded-xl border border-line bg-surface-sunken px-3 py-2 text-sm font-semibold text-ink transition active:scale-[0.98] enabled:hover:border-brand/60 enabled:hover:bg-brand/5 disabled:cursor-wait disabled:opacity-45">
            {option}
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 text-[0.68rem] text-ink-subtle">
        <span>{toPersianDigits(stats.correct)} آیتم درست · {toPersianDigits(stats.mistakes)} خطا</span>
        <span>{rewardHint ? `جایزه بعدی از ${toPersianDigits(rewardHint.minScore)} امتیاز` : 'بالاترین جایزه باز شده'}</span>
      </div>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface-sunken px-2 py-2">
      <div className="flex items-center justify-center gap-1 text-[0.65rem] text-ink-subtle">{icon}{label}</div>
      <p className="mt-0.5 font-bold tabular-nums text-ink">{value}</p>
    </div>
  );
}
