'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dices, Flame, Gift, PartyPopper, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Card, useToast } from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { formatMoney, toPersianDigits } from '@/lib/format';
import { publicGameService, type GameRewardResult, type PlayResultDto } from '@/services';
import { KitchenRushGame } from './kitchen-rush-game';

/* Alternating brand and charcoal, so the wheel belongs to the same app. */
const SLICE_COLORS = ['#0D7666', '#1C1E21', '#12907C', '#26292D', '#3FB39C', '#15171A'];
const TEXT_ON = ['#F4F7F5', '#F4F7F5', '#0B1F1B', '#F4F7F5', '#0B1F1B', '#F4F7F5'];

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function slicePath(index: number, count: number) {
  const slice = 360 / count;
  const p0 = polar(100, 100, 95, index * slice);
  const p1 = polar(100, 100, 95, index * slice + slice);
  const large = slice > 180 ? 1 : 0;
  return `M100,100 L${p0.x.toFixed(2)},${p0.y.toFixed(2)} A95,95 0 ${large} 1 ${p1.x.toFixed(2)},${p1.y.toFixed(2)} Z`;
}

export function GamePanel({ token }: { token: string }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [spinResult, setSpinResult] = useState<PlayResultDto | null>(null);
  const [rushResult, setRushResult] = useState<PlayResultDto | null>(null);

  const query = useQuery({
    queryKey: ['game-state', token],
    queryFn: () => publicGameService.stateByToken(token),
  });

  const spin = useMutation({
    mutationFn: () => publicGameService.playByToken(token),
    onSuccess: (result) => {
      const segmentCount = Math.max(query.data?.spin?.segments.length ?? 1, 1);
      const slice = 360 / segmentCount;
      const selected = result.segmentIndex ?? 0;
      // Keep adding turns so a second spin never animates backwards.
      setRotation((current) => current + 360 * 6 + (360 - ((selected * slice + slice / 2 + current) % 360)));
      setSpinResult(null);
      setSpinning(true);
      window.setTimeout(() => {
        setSpinning(false);
        setSpinResult(result);
        void queryClient.invalidateQueries({ queryKey: ['game-state', token] });
      }, 4300);
    },
    onError: (error) => {
      setSpinning(false);
      toast.error('گردونه اجرا نشد', error instanceof ApiError ? error.message : undefined);
    },
  });

  const state = query.data;
  if (!state || !state.enabled) return null;
  const hasSpin = state.spin?.enabled;
  const hasRush = state.kitchenRush?.enabled;
  if (!hasSpin && !hasRush) return null;

  return (
    <Card className="mt-4 overflow-hidden p-0">
      <div className="border-b border-line px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Sparkles className="size-4 text-brand" />
            بازی و جایزه
          </p>
          {state.player ? (
            <span className="text-xs text-ink-subtle">
              امتیاز باشگاه: {toPersianDigits(state.player.score)} · سطح {toPersianDigits(state.player.level)}
            </span>
          ) : null}
        </div>
      </div>

      <div className="space-y-5 p-4">
        {hasSpin && state.spin ? (
          <section className="rounded-2xl border border-line bg-surface-sunken/50 p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-sm font-bold text-ink"><Dices className="size-4 text-brand" />گردونهٔ شانس</p>
                <p className="mt-1 text-xs text-ink-subtle">بچرخان؛ نتیجه و جایزه مستقیم از سرور ثبت می‌شود.</p>
              </div>
              <Badge tone="brand">بازی اول</Badge>
            </div>

            <div className="flex flex-col items-center gap-4">
              <SpinWheel segments={state.spin.segments} rotation={rotation} spinning={spinning} />
              {state.spin.canPlay ? (
                <Button variant="primary" fullWidth loading={spin.isPending || spinning} disabled={spin.isPending || spinning} onClick={() => spin.mutate()}>
                  {spinning ? 'در حال چرخش…' : 'بچرخان!'}
                </Button>
              ) : (
                <p className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-center text-xs text-ink-subtle">
                  {state.spin.nextPlayAt ? `نوبت بعدی گردونه: ${new Date(state.spin.nextPlayAt).toLocaleString('fa-IR')}` : 'فعلاً امکان چرخاندن گردونه نیست.'}
                </p>
              )}
              {spinResult ? <ResultView result={spinResult} /> : null}
            </div>
          </section>
        ) : null}

        {hasRush && state.kitchenRush ? (
          <section className="rounded-2xl border border-line bg-surface-sunken/50 p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-sm font-bold text-ink"><Flame className="size-4 text-brand" />Kitchen Rush</p>
                <p className="mt-1 text-xs text-ink-subtle">سفارش را به خاطر بسپار و قبل از تمام‌شدن زمان، آیتم‌ها را به ترتیب آماده کن.</p>
              </div>
              <Badge tone="neutral">بازی دوم</Badge>
            </div>
            <KitchenRushGame
              token={token}
              state={state}
              onFinished={(result) => {
                setRushResult(result);
                void queryClient.invalidateQueries({ queryKey: ['game-state', token] });
              }}
            />
            {rushResult ? <div className="mt-3"><ResultView result={rushResult} /></div> : null}
          </section>
        ) : null}
      </div>
    </Card>
  );
}

function SpinWheel({ segments, rotation, spinning }: { segments: Array<{ label: string }>; rotation: number; spinning: boolean }) {
  const count = Math.max(segments.length, 1);
  return (
    <div className="relative" style={{ width: 272, height: 272 }}>
      <div className="absolute left-1/2 top-[-2px] z-20 -translate-x-1/2 drop-shadow" style={{ width: 0, height: 0, borderLeft: '13px solid transparent', borderRight: '13px solid transparent', borderTop: '24px solid #F1C75B' }} />
      <div className="absolute inset-1 rounded-full bg-brand/10 blur-xl" />
      <svg
        viewBox="0 0 200 200"
        width={272}
        height={272}
        className="relative z-10 drop-shadow-xl"
        style={{
          transform: `rotate(${rotation}deg)`,
          transition: spinning ? 'transform 4.2s cubic-bezier(0.12,0.62,0.18,1)' : 'none',
        }}
      >
        <circle cx="100" cy="100" r="98" fill="#14171A" stroke="#0D7666" strokeWidth="3" />
        {segments.map((segment, index) => {
          const slice = 360 / count;
          const mid = index * slice + slice / 2;
          const label = polar(100, 100, 63, mid);
          return (
            <g key={`${segment.label}-${index}`}>
              <path d={slicePath(index, count)} fill={SLICE_COLORS[index % SLICE_COLORS.length]} stroke="#0F0F13" strokeWidth="0.7" />
              <text
                x={label.x}
                y={label.y}
                fill={TEXT_ON[index % TEXT_ON.length]}
                fontSize={count > 8 ? '6.5' : '7.5'}
                fontWeight="700"
                textAnchor="middle"
                dominantBaseline="middle"
                transform={`rotate(${mid}, ${label.x.toFixed(2)}, ${label.y.toFixed(2)})`}
              >
                {segment.label.length > 13 ? `${segment.label.slice(0, 12)}…` : segment.label}
              </text>
            </g>
          );
        })}
        <circle cx="100" cy="100" r="15" fill="#14171A" stroke="#0D7666" strokeWidth="3" />
        <circle cx="100" cy="100" r="6" fill="#0D7666" />
      </svg>
    </div>
  );
}

function ResultView({ result }: { result: PlayResultDto }) {
  if (result.model === 'SPIN') {
    const won = result.rewardType !== 'NONE' && !!result.couponCode;
    return won ? (
      <CouponReveal
        label={result.label ?? ''}
        rewardType={result.rewardType ?? 'NONE'}
        rewardValue={result.rewardValue ?? 0}
        couponCode={result.couponCode ?? null}
        minOrderTotal={result.minOrderTotal ?? 0}
        expiryDays={result.expiryDays ?? 0}
      />
    ) : <NoPrize label={result.label ?? 'پوچ!'} />;
  }

  if (result.model === 'KITCHEN_RUSH') {
    return (
      <div className="w-full space-y-2">
        <div className="rounded-xl border border-line bg-surface p-3 text-center">
          <Flame className="mx-auto size-6 text-brand" />
          <p className="mt-1 text-sm font-bold text-ink">{toPersianDigits(result.runScore ?? 0)} امتیاز در Kitchen Rush</p>
          <p className="mt-1 text-xs text-ink-subtle">{toPersianDigits(result.correct ?? 0)} آیتم درست · رکورد Combo ×{toPersianDigits(result.comboMax ?? 0)}</p>
        </div>
        {result.reward?.couponCode ? <CouponReveal {...toReveal(result.reward)} /> : <NoPrize label="این بار به پلهٔ جایزه نرسیدی" />}
      </div>
    );
  }

  return null;
}

function toReveal(reward: GameRewardResult) {
  return {
    label: reward.label ?? '',
    rewardType: reward.rewardType,
    rewardValue: reward.rewardValue,
    couponCode: reward.couponCode,
    minOrderTotal: reward.minOrderTotal,
    expiryDays: reward.expiryDays,
  };
}

function CouponReveal({ label, rewardType, rewardValue, couponCode, minOrderTotal, expiryDays }: { label: string; rewardType: string; rewardValue: number; couponCode: string | null; minOrderTotal: number; expiryDays: number }) {
  return (
    <div className="w-full rounded-xl border border-brand/40 bg-brand/[0.08] p-4 text-center">
      <PartyPopper className="mx-auto size-7 text-brand" />
      <p className="mt-1.5 text-sm font-bold text-brand-bright">{label}</p>
      <p className="mt-1 text-xs text-ink-muted">
        {rewardType === 'PERCENTAGE' ? `${toPersianDigits(rewardValue)}٪ تخفیف` : `${formatMoney(rewardValue, 'IRT')} تخفیف`}
        {minOrderTotal > 0 ? ` · حداقل سفارش ${formatMoney(minOrderTotal, 'IRT')}` : ''}
      </p>
      <div className="mt-2 flex items-center justify-center gap-2"><span className="text-xs text-ink-subtle">کد تخفیف:</span><Badge tone="brand">{couponCode}</Badge></div>
      <p className="mt-1.5 text-[0.65rem] text-ink-subtle">در سفارش بعدی وارد کن (اعتبار {toPersianDigits(expiryDays)} روز).</p>
    </div>
  );
}

function NoPrize({ label }: { label: string }) {
  return (
    <div className="w-full rounded-xl border border-line bg-surface p-4 text-center">
      <Gift className="mx-auto size-7 text-ink-subtle" />
      <p className="mt-1.5 text-sm font-medium text-ink">{label}</p>
      <p className="mt-1 text-xs text-ink-subtle">دفعهٔ بعد دوباره امتحان کن.</p>
    </div>
  );
}
