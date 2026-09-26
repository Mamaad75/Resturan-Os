'use client';

import type { Currency } from '@restaurant-os/types';
import { Dice5, Gauge, Plus, RotateCcw, Trophy, X, Zap } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Card, Input } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatMoney, toPersianDigits } from '@/lib/format';

const ROUNDS_PER_PLAYER = 3;
const EARLY_PENALTY_MS = 2500;

type Player = { name: string; rounds: number[]; earlyTaps: number };
type Phase = 'setup' | 'ready' | 'waiting' | 'go' | 'scored' | 'done';

function average(values: number[]) {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function best(values: number[]) {
  return values.length ? Math.min(...values) : 0;
}

export function BillGame({ total, currency }: { total: number; currency: Currency }) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('setup');
  const [names, setNames] = useState<string[]>(['', '']);
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentPlayer, setCurrentPlayer] = useState(0);
  const [currentRound, setCurrentRound] = useState(0);
  const [lastMs, setLastMs] = useState<number | null>(null);
  const [earlyTap, setEarlyTap] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const goAtRef = useRef(0);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const named = names.map((name) => name.trim()).filter(Boolean);
  const totalTurns = Math.max(1, players.length * ROUNDS_PER_PLAYER);
  const completedTurns = currentRound * Math.max(players.length, 1) + currentPlayer;

  const start = () => {
    const nextPlayers = named.map((name) => ({ name, rounds: [], earlyTaps: 0 }));
    setPlayers(nextPlayers);
    setCurrentPlayer(0);
    setCurrentRound(0);
    setLastMs(null);
    setEarlyTap(false);
    setPhase('ready');
  };

  const beginRound = () => {
    setEarlyTap(false);
    setLastMs(null);
    setPhase('waiting');
    const delay = 1400 + Math.random() * 3200;
    timerRef.current = setTimeout(() => {
      goAtRef.current = performance.now();
      setPhase('go');
    }, delay);
  };

  const tap = () => {
    if (phase === 'waiting') {
      if (timerRef.current) clearTimeout(timerRef.current);
      setEarlyTap(true);
      record(EARLY_PENALTY_MS, true);
      return;
    }
    if (phase === 'go') record(Math.max(1, Math.round(performance.now() - goAtRef.current)), false);
  };

  const record = (ms: number, wasEarly: boolean) => {
    setLastMs(ms);
    setPlayers((current) => current.map((player, index) => index === currentPlayer
      ? { ...player, rounds: [...player.rounds, ms], earlyTaps: player.earlyTaps + (wasEarly ? 1 : 0) }
      : player));
    setPhase('scored');
  };

  const nextTurn = () => {
    if (currentPlayer + 1 < players.length) {
      setCurrentPlayer((value) => value + 1);
      setPhase('ready');
      return;
    }
    if (currentRound + 1 < ROUNDS_PER_PLAYER) {
      setCurrentPlayer(0);
      setCurrentRound((value) => value + 1);
      setPhase('ready');
      return;
    }
    setPhase('done');
  };

  const reset = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setPhase('setup');
    setPlayers([]);
    setCurrentPlayer(0);
    setCurrentRound(0);
    setLastMs(null);
    setEarlyTap(false);
  };

  const ranking = useMemo(() => players
    .map((player) => ({ ...player, avg: average(player.rounds), best: best(player.rounds) }))
    .sort((a, b) => a.avg - b.avg), [players]);
  const loser = phase === 'done' && ranking.length ? ranking[ranking.length - 1] : null;

  if (!open) {
    return (
      <Card className="mt-4 p-4">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand"><Dice5 className="size-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">شرط ببند</p>
            <p className="mt-0.5 text-xs text-ink-subtle">سه راند سرعت؛ کندترین میانگین، حساب میز را می‌دهد!</p>
          </div>
          <Button variant="primary" size="sm" onClick={() => setOpen(true)}>شروع</Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="mt-4 overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-ink"><Dice5 className="size-4 text-brand" />شرط ببند</p>
          {phase !== 'setup' && phase !== 'done' ? <p className="mt-0.5 text-[0.68rem] text-ink-subtle">راند {toPersianDigits(currentRound + 1)} از {toPersianDigits(ROUNDS_PER_PLAYER)}</p> : null}
        </div>
        <button type="button" onClick={() => { setOpen(false); reset(); }} aria-label="بستن" className="text-ink-subtle hover:text-ink"><X className="size-4" /></button>
      </div>

      <div className="p-4">
        {phase === 'setup' ? (
          <div className="space-y-3">
            <div className="rounded-2xl border border-brand/20 bg-brand/5 p-3 text-xs leading-6 text-ink-muted">
              هر نفر سه بار تست واکنش می‌دهد. گوشی بین بازیکن‌ها می‌چرخد؛ لمس قبل از سبزشدن صفحه جریمه دارد و در پایان <span className="font-semibold text-ink">بالاترین میانگین زمان</span> بازنده است.
            </div>
            <div className="space-y-2">
              {names.map((name, index) => (
                <div key={index} className="flex gap-2">
                  <Input containerClassName="flex-1" label={`بازیکن ${toPersianDigits(index + 1)}`} value={name} onChange={(e) => setNames(names.map((value, i) => i === index ? e.target.value : value))} />
                  {names.length > 2 ? <Button className="mt-6" variant="ghost" size="icon" aria-label="حذف" onClick={() => setNames(names.filter((_, i) => i !== index))}><X className="size-4" /></Button> : null}
                </div>
              ))}
            </div>
            {names.length < 8 ? <Button variant="ghost" size="sm" leftIcon={<Plus className="size-4" />} onClick={() => setNames([...names, ''])}>افزودن بازیکن</Button> : null}
            <Button variant="primary" fullWidth disabled={named.length < 2} onClick={start}>شروع مسابقه سه‌راندی</Button>
          </div>
        ) : null}

        {phase !== 'setup' && phase !== 'done' ? (
          <div className="mb-4">
            <div className="mb-1 flex items-center justify-between text-[0.68rem] text-ink-subtle"><span>پیشرفت مسابقه</span><span>{toPersianDigits(Math.min(totalTurns, completedTurns + (phase === 'scored' ? 1 : 0)))} / {toPersianDigits(totalTurns)}</span></div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-sunken"><div className="h-full rounded-full bg-brand transition-all" style={{ width: `${Math.min(100, ((completedTurns + (phase === 'scored' ? 1 : 0)) / totalTurns) * 100)}%` }} /></div>
          </div>
        ) : null}

        {phase === 'ready' ? (
          <div className="space-y-4 text-center">
            <div className="rounded-2xl border border-line bg-surface-sunken p-4">
              <p className="text-xs text-ink-subtle">گوشی را بده به</p>
              <p className="mt-1 text-xl font-extrabold text-brand-bright">{players[currentPlayer]?.name}</p>
              <p className="mt-2 text-xs text-ink-muted">تا صفحه سبز نشده دست نزن. زمان انتظار هر بار تصادفی است.</p>
            </div>
            <Button variant="primary" fullWidth onClick={beginRound}>آماده‌ام</Button>
          </div>
        ) : null}

        {phase === 'waiting' || phase === 'go' ? (
          <button type="button" onClick={tap} className={cn('flex h-64 w-full flex-col items-center justify-center rounded-2xl text-center text-white transition-all active:scale-[0.995]', phase === 'go' ? 'bg-positive shadow-[0_0_50px_rgba(34,197,94,.25)]' : 'bg-critical/85')}>
            {phase === 'go' ? <><Zap className="size-12" /><span className="mt-3 text-2xl font-black">الان بزن!</span></> : <><Gauge className="size-9 opacity-80" /><span className="mt-3 text-lg font-semibold">صبر کن…</span><span className="mt-1 text-xs opacity-75">زود بزنی +۲.۵ ثانیه جریمه</span></>}
          </button>
        ) : null}

        {phase === 'scored' ? (
          <div className="space-y-4 text-center">
            <div className={cn('rounded-2xl border p-4', earlyTap ? 'border-critical/30 bg-critical/10' : 'border-line bg-surface-sunken')}>
              {earlyTap ? <><p className="font-bold text-critical">زود زدی! 😬</p><p className="mt-1 text-xs text-ink-subtle">این راند {toPersianDigits(EARLY_PENALTY_MS)} میلی‌ثانیه ثبت شد.</p></> : <><p className="text-xs text-ink-subtle">زمان واکنش</p><p className="mt-1 text-2xl font-black tabular-nums text-brand">{toPersianDigits(lastMs ?? 0)} ms</p></>}
            </div>
            <Button variant="primary" fullWidth onClick={nextTurn}>{currentPlayer + 1 < players.length ? 'بازیکن بعدی' : currentRound + 1 < ROUNDS_PER_PLAYER ? 'شروع راند بعد' : 'دیدن نتیجه نهایی'}</Button>
          </div>
        ) : null}

        {phase === 'done' && loser ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-brand/30 bg-brand/10 p-5 text-center">
              <Trophy className="mx-auto size-10 text-brand" />
              <p className="mt-2 text-sm text-ink-muted">حسابِ میز با…</p>
              <p className="mt-1 text-2xl font-black text-brand-bright">{loser.name}</p>
              <p className="mt-1 text-sm text-ink-muted">مبلغ: {formatMoney(total, currency)}</p>
              <p className="mt-2 text-xs text-ink-subtle">میانگین واکنش: {toPersianDigits(loser.avg)} ms</p>
            </div>

            <div className="space-y-2">
              {ranking.map((player, index) => (
                <div key={player.name} className="rounded-xl border border-line bg-surface-sunken px-3 py-2">
                  <div className="flex items-center gap-3 text-sm">
                    <span className="flex size-7 items-center justify-center rounded-lg bg-surface text-xs font-bold text-ink-muted">{toPersianDigits(index + 1)}</span>
                    <span className="min-w-0 flex-1 truncate font-medium text-ink">{player.name}</span>
                    {index === 0 ? <Badge tone="positive">سریع‌ترین</Badge> : index === ranking.length - 1 ? <Badge tone="critical">حساب با من</Badge> : null}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 ps-10 text-[0.68rem] text-ink-subtle">
                    <span>میانگین: {toPersianDigits(player.avg)} ms</span><span>بهترین: {toPersianDigits(player.best)} ms</span><span>جریمه: {toPersianDigits(player.earlyTaps)}</span>
                  </div>
                </div>
              ))}
            </div>
            <Button variant="ghost" fullWidth leftIcon={<RotateCcw className="size-4" />} onClick={reset}>مسابقه دوباره</Button>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
