'use client';
import type { GameKind, GameProfile, GameView } from '@restaurant-os/types';
import {
  ArrowRight,
  Brain,
  Calculator,
  Check,
  Copy,
  Gamepad2,
  Gift,
  Sparkles,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { formatMoney, toPersianDigits as fa } from '@/lib/format';
import { gameApi } from './game-api';
import {
  CardFace,
  PracticeMath,
  PracticeMemory,
  TableDuel,
  tileClass,
} from './practice-games';

const games = [
  {
    kind: 'MEMORY' as const,
    title: 'جفت خوشمزه',
    eyebrow: 'حافظه‌ات را به چالش بکش',
    description: '۱۲ کارت، ۶ جفت. با حرکت‌های کمتر، امتیاز بیشتری بگیر.',
    icon: Brain,
    color: 'from-teal-400/25 to-teal-950/10',
    label: 'حافظه • تک‌نفره',
  },
  {
    kind: 'MATH' as const,
    title: 'ذهن آماده',
    eyebrow: 'پنج سؤال تا خط پایان',
    description:
      'جمع و تفریق‌های کوتاه؛ هر پاسخ درست یک قدم به پاداش نزدیک‌تر.',
    icon: Calculator,
    color: 'from-amber-400/25 to-amber-950/10',
    label: 'محاسبه • تک‌نفره',
  },
  {
    kind: 'DUEL' as const,
    title: 'دوز دور میز',
    eyebrow: 'این دور نوبت کیه؟',
    description: 'یک گوشی، دو بازیکن و یک رقابت دوستانه. سه مهره را ردیف کن.',
    icon: Users,
    color: 'from-violet-400/25 to-violet-950/10',
    label: 'دونفره • روی یک گوشی',
  },
];

export function GameHub({ token, slug }: { token?: string; slug?: string }) {
  const [profile, setProfile] = useState<GameProfile | null>(null);
  const [loading, setLoading] = useState(!!token);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [active, setActive] = useState<GameKind | 'DUEL' | null>(null);
  const [session, setSession] = useState<GameView | null>(null);
  const [busy, setBusy] = useState(false);
  const [practice, setPractice] = useState(!token);
  const [answer, setAnswer] = useState('');
  const [clock, setClock] = useState(Date.now());
  const [copied, setCopied] = useState('');
  const [rewardKey, setRewardKey] = useState<string | null>(null);
  const inFlight = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!active) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.showModal();
    return () => {
      document.body.style.overflow = previous;
    };
  }, [active]);
  const refresh = useCallback(async () => {
    if (token) setProfile(await gameApi.profile(token));
  }, [token]);
  useEffect(() => {
    let live = true;
    if (token)
      gameApi
        .profile(token)
        .then((p) => {
          if (live) {
            setProfile(p);
            setPractice(!p.eligible);
          }
        })
        .catch((e) => {
          if (live) setError(e.message);
        })
        .finally(() => {
          if (live) setLoading(false);
        });
    return () => {
      live = false;
    };
  }, [token]);
  useEffect(() => {
    if (!session || session.finished) return;
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [session]);
  async function action(fn: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'ارتباط برقرار نشد؛ دوباره تلاش کنید.',
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function play(kind: GameKind | 'DUEL') {
    if (kind === 'DUEL' || practice || !profile?.eligible || !token) {
      setSession(null);
      setActive(kind);
      return;
    }
    await action(async () => {
      const s = await gameApi.start(token, kind);
      setSession(s);
      setActive(kind);
      setClock(Date.now());
      await refresh();
    });
  }
  async function move(value: number) {
    if (!session || !token) return;
    await action(async () => {
      const s = await gameApi.move(token, session.id, session.revision, value);
      setSession(s);
      setAnswer('');
      if (s.finished) await refresh();
    });
  }
  async function claim() {
    if (!token) return;
    // Reuse this key after a timeout: a successful but lost response must not charge twice.
    const key = rewardKey ?? crypto.randomUUID();
    setRewardKey(key);
    await action(async () => {
      const reward = await gameApi.reward(token, key);
      setNotice(`کد ${reward.code} آماده است.`);
      await refresh();
      setRewardKey(null);
    });
  }
  const back = token
    ? `/order/track/${token}`
    : `/r/${encodeURIComponent(slug ?? profile?.slug ?? '')}`;
  const remaining = session
    ? Math.max(
        0,
        Math.ceil((new Date(session.expiresAt).getTime() - clock) / 1000),
      )
    : 0;
  const selected = games.find((g) => g.kind === active);
  return (
    <main
      dir="rtl"
      className="min-h-dvh bg-[#101915] px-4 pb-16 pt-6 text-white sm:px-8"
    >
      <div className="mx-auto max-w-5xl">
        <header className="mb-10 flex items-center justify-between">
          <Link
            href={back}
            className="flex items-center gap-2 text-sm text-white/70 hover:text-white"
          >
            <ArrowRight className="size-4" />
            {token ? 'پیگیری سفارش' : 'بازگشت به منو'}
          </Link>
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Gamepad2 className="size-5 text-amber-300" /> دور میز
          </span>
        </header>
        <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-bl from-[#294936] via-[#1c3025] to-[#16241c] p-6 sm:p-10">
          <div className="pointer-events-none absolute -left-10 -top-20 size-64 rounded-full bg-amber-200/10 blur-3xl" />
          <span className="inline-flex items-center gap-2 rounded-full border border-amber-200/20 bg-amber-200/10 px-3 py-1 text-xs text-amber-200">
            <Sparkles className="size-3.5" /> چند دقیقه خوش‌گذرانی کنار هم
          </span>
          <h1 className="mt-6 text-3xl font-extrabold leading-tight sm:text-5xl">
            بازی کن، خاطره بساز.
            <br />
            <span className="mt-3 inline-block text-amber-200">
              پاداشت هم سر جاشه!
            </span>
          </h1>
          <p className="mt-5 max-w-lg text-sm leading-7 text-white/65">
            از یک چالش کوچک شروع کن؛ حافظه و ذهنت را گرم کن یا با هم‌میزی‌ات دوز
            بازی کن.
            {profile ? ` به باشگاه ${profile.restaurantName} خوش آمدی.` : ''}
          </p>
          <div className="mt-8 grid max-w-xl grid-cols-3 gap-3">
            {[
              { label: 'سطح بازی', value: profile?.level ?? 1, icon: Trophy },
              {
                label: 'امتیاز پیشرفت',
                value: profile?.xp ?? 0,
                icon: Sparkles,
              },
              {
                label: 'قابل تبدیل به کد',
                value: profile?.points ?? 0,
                icon: Gift,
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl border border-white/10 bg-black/10 p-3 sm:p-4"
              >
                <stat.icon className="mb-3 size-4 text-amber-200/80" />
                <p className="text-2xl font-bold">{fa(stat.value)}</p>
                <p className="mt-1 text-[11px] text-white/55 sm:text-xs">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
          {profile && (
            <div className="mt-5 max-w-xl">
              <div className="mb-2 flex justify-between text-xs text-white/60">
                <span>
                  {profile.level === 20 ? 'بالاترین سطح' : 'تا سطح بعد'}
                </span>
                <span>{fa(profile.xp % 100)} / ۱۰۰</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-amber-200"
                  style={{
                    width: `${profile.level === 20 ? 100 : profile.xp % 100}%`,
                  }}
                />
              </div>
            </div>
          )}
        </section>
        {loading && (
          <p role="status" className="mt-5 text-sm text-white/70">
            در حال دریافت باشگاه شما…
          </p>
        )}
        {error && (
          <div
            role="alert"
            className="mt-5 rounded-xl border border-red-300/30 bg-red-300/10 p-4 text-sm text-red-100"
          >
            {error}
            <button
              className="mr-4 underline"
              onClick={() => void action(refresh)}
            >
              تلاش دوباره
            </button>
          </div>
        )}
        {notice && (
          <p
            role="status"
            className="mt-5 rounded-xl bg-teal-300/10 p-4 text-sm text-teal-100"
          >
            {notice}
          </p>
        )}
        {token && (
          <p className="mt-5 rounded-xl border border-white/10 p-4 text-xs leading-6 text-white/60">
            برای ادامه‌ی سابقه و دریافت پاداش، با همین مرورگر و شماره همراه
            برگرد. پاک‌کردن داده‌های مرورگر، دسترسی به سابقه‌ی بازی را از بین
            می‌برد. فقط امتیازهای بازیِ خودت قابل تبدیل به کد هستند.
          </p>
        )}
        <section className="mt-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">امروز کدام بازی؟</h2>
            <p className="mt-2 text-xs leading-6 text-white/50">
              {profile?.eligible
                ? `${fa(profile.remainingToday)} نوبت پاداش‌دار باقی مانده در امروز؛ هر بازی فقط یک بار برای هر سفارش.`
                : (profile?.reason ??
                  'بازی تمرینی آزاد است. برای پاداش، از لینک پیگیری سفارش پرداخت‌شده وارد شو.')}
            </p>
          </div>
          {profile?.eligible && (
            <label className="flex items-center gap-2 text-sm text-white/70">
              <input
                type="checkbox"
                checked={practice}
                onChange={(e) => setPractice(e.target.checked)}
              />{' '}
              حالت تمرینی بدون پاداش
            </label>
          )}
        </section>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {games.map((g) => (
            <button
              key={g.kind}
              disabled={busy || loading || (!!token && !profile)}
              onClick={() => void play(g.kind)}
              className={`group rounded-3xl border border-white/10 bg-gradient-to-br ${g.color} p-6 text-right transition hover:-translate-y-1 hover:border-white/30 disabled:opacity-50`}
            >
              <div className="flex items-center justify-between">
                <g.icon className="size-8 text-white/90" />
                <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] text-white/65">
                  {g.label}
                </span>
              </div>
              <p className="mt-8 text-xs text-white/50">{g.eyebrow}</p>
              <h3 className="mt-2 text-2xl font-bold">{g.title}</h3>
              <p className="mt-3 min-h-12 text-sm leading-6 text-white/60">
                {g.description}
              </p>
              <span className="mt-7 flex items-center justify-between text-sm font-semibold text-amber-100">
                <span>
                  {profile?.sessions.some(
                    (s) => s.kind === g.kind && !s.finished,
                  ) && !practice
                    ? 'ادامه بازی'
                    : 'شروع بازی'}
                </span>
                <ArrowRight className="size-4 rotate-180" />
              </span>
            </button>
          ))}
        </div>
        <section className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="flex gap-3">
            <Gift className="size-6 shrink-0 text-amber-200" />
            <div>
              <h2 className="font-bold">
                امتیازها را به یک تخفیف خوشمزه تبدیل کن
              </h2>
              <p className="mt-3 text-sm leading-7 text-white/60">
                سطح ۲ با ۱۰۰ امتیاز پیشرفت باز می‌شود. کد تخفیف از ۵٪ شروع
                می‌شود و با بالاتر رفتن سطح تا ۱۰٪ می‌رسد. کد ۷ روز اعتبار دارد
                و یک‌بار با شماره همراه خودت قابل استفاده است.
              </p>
              {profile && (
                <>
                  <p className="mt-2 text-sm leading-7 text-white/60">
                    هزینه دریافت: {fa(profile.rules.couponCost)} امتیاز کیف •
                    سقف تخفیف: {formatMoney(profile.rules.couponMaxDiscount)} •
                    حداقل سفارش: {formatMoney(profile.rules.couponMinOrder)}. هر
                    بازی حداکثر {fa(profile.rules.pointsPerWin)} امتیاز کیف
                    می‌دهد.
                  </p>
                  <button
                    onClick={() => void claim()}
                    disabled={
                      busy ||
                      !profile.eligible ||
                      profile.level < 2 ||
                      profile.points < profile.rules.couponCost
                    }
                    className="mt-5 rounded-xl bg-amber-200 px-6 py-3 text-sm font-bold text-stone-950 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {busy
                      ? 'در حال ثبت…'
                      : `دریافت کد با ${fa(profile.rules.couponCost)} امتیاز`}
                  </button>
                </>
              )}
            </div>
          </div>
          {profile?.coupons.map((c) => (
            <div
              key={c.code}
              className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-amber-200/30 p-4"
            >
              <div>
                <code className="font-mono text-amber-200" dir="ltr">
                  {c.code}
                </code>
                <p className="mt-2 text-xs text-white/55">
                  {fa(c.value / 100)}٪ تا {formatMoney(c.maxDiscount ?? 0)} •
                  حداقل {formatMoney(c.minOrderTotal)} • تا{' '}
                  {c.endsAt
                    ? new Date(c.endsAt).toLocaleDateString('fa-IR')
                    : '—'}
                </p>
              </div>
              <button
                aria-label="کپی کد تخفیف"
                onClick={() => {
                  navigator.clipboard
                    .writeText(c.code)
                    .then(() => setCopied(c.code))
                    .catch(() => setError('کد را انتخاب و کپی کنید.'));
                }}
                className="rounded-lg bg-white/10 p-3"
              >
                {copied === c.code ? (
                  <Check className="size-4" />
                ) : (
                  <Copy className="size-4" />
                )}
              </button>
            </div>
          ))}
        </section>
        <p className="mt-8 text-center text-xs leading-6 text-white/35">
          بازی‌ها ورودی پولی ندارند. رقابت دونفره دوستانه است؛ نتیجه بازی تعهد
          پرداخت ایجاد نمی‌کند.
        </p>
        {active && selected && (
          <dialog
            ref={dialog}
            aria-labelledby="game-title"
            onCancel={(e) => {
              e.preventDefault();
              if (!busy) setActive(null);
            }}
            className="fixed max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-md overflow-y-auto rounded-3xl border border-white/15 bg-[#19271f] p-6 text-white backdrop:bg-black/75 backdrop:backdrop-blur-sm"
          >
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 id="game-title" className="text-xl font-bold">
                  {selected.title}
                </h2>
                <p className="mt-1 text-xs text-white/50">
                  {session
                    ? `نوبت پاداش‌دار • ${fa(remaining)} ثانیه باقی‌مانده`
                    : 'رقابت دوستانه • بدون پاداش کیف'}
                </p>
              </div>
              <button
                autoFocus
                disabled={busy}
                aria-label="بستن بازی"
                className="rounded-full bg-white/10 p-2"
                onClick={() => setActive(null)}
              >
                <X className="size-5" />
              </button>
            </div>
            {error && (
              <p role="alert" className="mb-4 text-sm text-red-200">
                {error}
              </p>
            )}
            {active === 'DUEL' ? (
              <TableDuel />
            ) : !session ? (
              active === 'MEMORY' ? (
                <PracticeMemory />
              ) : (
                <PracticeMath />
              )
            ) : session.finished ? (
              <div role="status" className="py-8 text-center">
                <Trophy className="mx-auto size-14 text-amber-200" />
                <h3 className="mt-5 text-2xl font-bold">این دور تمام شد!</h3>
                <p className="mt-4 text-white/65">
                  {fa(session.score)} امتیاز پیشرفت و{' '}
                  {fa(session.awardedPoints)} امتیاز کیف ثبت شد.
                </p>
                <button
                  className="mt-6 rounded-xl bg-white/10 px-6 py-3"
                  onClick={() => setActive(null)}
                >
                  برگشت به بازی‌ها
                </button>
              </div>
            ) : remaining === 0 ? (
              <p role="status" className="py-8 leading-8">
                زمان این نوبت تمام شد. نوبت دوباره پاداش نمی‌دهد؛ می‌توانی
                تمرینی ادامه بدهی.
              </p>
            ) : active === 'MEMORY' ? (
              <>
                <p className="mb-4 text-sm text-white/60">
                  {fa(session.turns ?? 0)} از ۲۴ حرکت • جفت‌ها را پیدا کن
                </p>
                <div className="grid grid-cols-4 gap-3">
                  {session.cards?.map((v, i) => (
                    <button
                      key={i}
                      disabled={busy || session.matched?.includes(i)}
                      aria-label={`کارت ${fa(i + 1)}${v === null ? '، بسته' : '، باز'}`}
                      className={tileClass}
                      onClick={() => void move(i)}
                    >
                      <CardFace value={v} />
                    </button>
                  ))}
                </div>
              </>
            ) : session.question ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const normalized = answer.replace(/[۰-۹]/g, (n) =>
                    String('۰۱۲۳۴۵۶۷۸۹'.indexOf(n)),
                  );
                  if (/^\d+$/.test(normalized)) void move(Number(normalized));
                }}
              >
                <p className="text-sm text-white/60">
                  سؤال {fa(session.question.index + 1)} از ۵
                </p>
                <p dir="ltr" className="my-8 text-center text-5xl font-bold">
                  {session.question.a} {session.question.operation}{' '}
                  {session.question.b} = ?
                </p>
                <label className="text-sm">
                  پاسخ تو
                  <input
                    inputMode="numeric"
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-white/20 bg-white/10 p-4 text-white"
                  />
                </label>
                <button
                  disabled={busy || !answer.trim()}
                  className="mt-4 w-full rounded-xl bg-amber-300 p-3 font-bold text-stone-950 disabled:opacity-40"
                >
                  ثبت پاسخ
                </button>
              </form>
            ) : null}
          </dialog>
        )}
      </div>
    </main>
  );
}
