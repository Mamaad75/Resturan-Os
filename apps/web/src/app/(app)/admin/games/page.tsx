'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dices, Flame, Plus, Save, Trash2, Trophy, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  Input,
  Select,
  Skeleton,
  Switch,
  useToast,
} from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { ApiError } from '@/lib/api-client';
import { formatDateFa, toPersianDigits } from '@/lib/format';
import {
  gameService,
  type ArcadeConfig,
  type KitchenRushConfig,
  type SpinConfig,
} from '@/services';

const REWARD_OPTIONS = [
  { value: 'PERCENTAGE', label: 'تخفیف درصدی' },
  { value: 'FIXED', label: 'تخفیف مبلغی (تومان)' },
];
const SPIN_REWARD_OPTIONS = [{ value: 'NONE', label: 'بدون جایزه (پوچ)' }, ...REWARD_OPTIONS];

const DEFAULT_ARCADE: ArcadeConfig = {
  spinEnabled: true,
  spin: {
    segments: [
      { label: '۱۰٪ تخفیف', weight: 3, rewardType: 'PERCENTAGE', rewardValue: 10, minOrderTotal: 0, expiryDays: 14 },
      { label: 'پوچ!', weight: 5, rewardType: 'NONE', rewardValue: 0, minOrderTotal: 0, expiryDays: 14 },
      { label: '۲۰٪ تخفیف', weight: 1, rewardType: 'PERCENTAGE', rewardValue: 20, minOrderTotal: 0, expiryDays: 14 },
      { label: 'نوشیدنی رایگان', weight: 1, rewardType: 'FIXED', rewardValue: 50000, minOrderTotal: 100000, expiryDays: 14 },
    ],
    cooldownHours: 24,
    scorePerPlay: 10,
  },
  leaderboardEnabled: false,
  leaderboard: {
    scorePerPlay: 10,
    cooldownHours: 24,
    periodDays: 30,
    topN: 10,
    rewards: [
      { rank: 1, label: 'نفر اول ماه', rewardType: 'PERCENTAGE', rewardValue: 30, minOrderTotal: 0, expiryDays: 14 },
      { rank: 2, label: 'نفر دوم ماه', rewardType: 'PERCENTAGE', rewardValue: 20, minOrderTotal: 0, expiryDays: 14 },
      { rank: 3, label: 'نفر سوم ماه', rewardType: 'PERCENTAGE', rewardValue: 10, minOrderTotal: 0, expiryDays: 14 },
    ],
    seasonStartedAt: null,
  },
  memoryDuelEnabled: false,
  memoryDuel: {
    pairs: 6,
    cooldownHours: 24,
    scorePerPlay: 20,
    itemLabels: ['برگر', 'پیتزا', 'قهوه', 'سیب‌زمینی', 'سالاد', 'نوشیدنی'],
    reward: {
      label: '۱۰٪ تخفیف برندهٔ دوئل',
      rewardType: 'PERCENTAGE',
      rewardValue: 10,
      minOrderTotal: 0,
      expiryDays: 7,
    },
    rewardOnDraw: false,
  },
  kitchenRushEnabled: true,
  kitchenRush: {
    durationSeconds: 120,
    lives: 4,
    scorePerCorrect: 25,
    comboStep: 4,
    feverThreshold: 8,
    cooldownHours: 24,
    scorePerPlay: 25,
    itemLabels: ['برگر', 'پیتزا', 'قهوه', 'سیب‌زمینی', 'سالاد', 'نوشیدنی', 'کیک', 'ساندویچ'],
    rewards: [
      { label: '۵٪ تخفیف', minScore: 900, rewardType: 'PERCENTAGE', rewardValue: 5, minOrderTotal: 0, expiryDays: 14 },
      { label: '۱۰٪ تخفیف', minScore: 1800, rewardType: 'PERCENTAGE', rewardValue: 10, minOrderTotal: 0, expiryDays: 14 },
      { label: '۲۰٪ تخفیف', minScore: 3200, rewardType: 'PERCENTAGE', rewardValue: 20, minOrderTotal: 0, expiryDays: 14 },
    ],
  },
};

export default function GamesPage() {
  const { can } = useAuth();
  const editable = can('settings:manage');
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['game'], queryFn: () => gameService.get() });
  const playsQuery = useQuery({ queryKey: ['game-plays'], queryFn: () => gameService.plays() });

  const [isEnabled, setIsEnabled] = useState(false);
  const [config, setConfig] = useState<ArcadeConfig>(DEFAULT_ARCADE);

  useEffect(() => {
    if (!query.data) return;
    setIsEnabled(query.data.isEnabled);
    if (query.data.model === 'ARCADE') setConfig(query.data.config as ArcadeConfig);
  }, [query.data]);

  const save = useMutation({
    mutationFn: () => gameService.update({ isEnabled, model: 'ARCADE', config }),
    onSuccess: () => {
      toast.success('تنظیمات بازی‌ها ذخیره شد');
      void queryClient.invalidateQueries({ queryKey: ['game'] });
    },
    onError: (error) => toast.error('ذخیره نشد', error instanceof ApiError ? error.message : undefined),
  });

  const closeSeason = useMutation({
    mutationFn: () => gameService.closeSeason(),
    onSuccess: (result) => {
      const winners = result.winners.length;
      toast.success(
        'دوره بسته شد',
        winners > 0
          ? `${toPersianDigits(winners)} جایزه صادر شد. کدها در «بازی‌های اخیر» دیده می‌شوند.`
          : 'کسی در این دوره امتیازی نگرفته بود، پس جایزه‌ای صادر نشد.',
      );
      void queryClient.invalidateQueries({ queryKey: ['game'] });
      void queryClient.invalidateQueries({ queryKey: ['game-plays'] });
    },
    onError: (error) =>
      toast.error('پایان دوره انجام نشد', error instanceof ApiError ? error.message : undefined),
  });

  if (query.isPending) return <Skeleton className="h-96 rounded-2xl" />;
  if (query.isError) return <ErrorState onRetry={() => query.refetch()} />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-bold text-ink">
          <Dices className="size-5 text-brand" />
          بازی‌های باشگاه مشتریان
        </h1>
        <p className="mt-0.5 text-sm text-ink-subtle">
          گردونهٔ شانس و Kitchen Rush مستقل‌اند؛ روشن‌کردن یکی، دیگری را خاموش نمی‌کند.
        </p>
      </div>

      <Card>
        <CardHeader
          title="مرکز بازی‌ها"
          description="اگر این بخش روشن باشد، هر بازی را می‌توانید جداگانه فعال یا غیرفعال کنید."
          action={<Switch checked={isEnabled} disabled={!editable} onChange={setIsEnabled} label={isEnabled ? 'فعال' : 'غیرفعال'} />}
        />
        <CardBody className="space-y-6">
          <section className="rounded-2xl border border-line bg-surface-sunken/40 p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-2xl bg-brand/10 text-brand"><Dices className="size-5" /></span>
                <div>
                  <p className="font-semibold text-ink">گردونهٔ شانس</p>
                  <p className="text-xs text-ink-subtle">نتیجه سمت سرور تعیین می‌شود و جایزه مستقیم به کد تخفیف تبدیل می‌شود.</p>
                </div>
              </div>
              <Switch checked={config.spinEnabled} disabled={!editable || !isEnabled} onChange={(checked) => setConfig({ ...config, spinEnabled: checked })} label={config.spinEnabled ? 'روشن' : 'خاموش'} />
            </div>
            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <Input label="فاصله هر بار گردونه (ساعت)" hint="۰ یعنی بدون محدودیت" dir="ltr" inputMode="numeric" disabled={!editable} value={String(config.spin.cooldownHours)} onChange={(e) => setConfig({ ...config, spin: { ...config.spin, cooldownHours: num(e.target.value) } })} />
              <Input label="امتیاز باشگاه بعد از هر چرخش" dir="ltr" inputMode="numeric" disabled={!editable} value={String(config.spin.scorePerPlay)} onChange={(e) => setConfig({ ...config, spin: { ...config.spin, scorePerPlay: Math.max(0, num(e.target.value)) } })} />
            </div>
            <SpinEditor config={config.spin} setConfig={(spin) => setConfig({ ...config, spin })} editable={editable} />
          </section>

          <section className="rounded-2xl border border-line bg-surface-sunken/40 p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-2xl bg-brand/10 text-brand"><Flame className="size-5" /></span>
                <div>
                  <p className="font-semibold text-ink">Kitchen Rush</p>
                  <p className="text-xs text-ink-subtle">بازی حافظه و سرعت چندمرحله‌ای با سفارش‌های چندآیتمی، Combo و Fever.</p>
                </div>
              </div>
              <Switch checked={config.kitchenRushEnabled} disabled={!editable || !isEnabled} onChange={(checked) => setConfig({ ...config, kitchenRushEnabled: checked })} label={config.kitchenRushEnabled ? 'روشن' : 'خاموش'} />
            </div>
            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <Input label="فاصله هر بار Kitchen Rush (ساعت)" hint="۰ یعنی بدون محدودیت" dir="ltr" inputMode="numeric" disabled={!editable} value={String(config.kitchenRush.cooldownHours)} onChange={(e) => setConfig({ ...config, kitchenRush: { ...config.kitchenRush, cooldownHours: num(e.target.value) } })} />
              <Input label="امتیاز باشگاه بعد از هر اجرا" dir="ltr" inputMode="numeric" disabled={!editable} value={String(config.kitchenRush.scorePerPlay)} onChange={(e) => setConfig({ ...config, kitchenRush: { ...config.kitchenRush, scorePerPlay: Math.max(1, num(e.target.value) || 1) } })} />
            </div>
            <KitchenRushEditor config={config.kitchenRush} setConfig={(kitchenRush) => setConfig({ ...config, kitchenRush })} editable={editable} />
          </section>

          <section className="rounded-2xl border border-line p-4">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-2xl bg-brand/10 text-brand">
                  <Users className="size-5" />
                </span>
                <div>
                  <p className="font-semibold text-ink">دوئل حافظه</p>
                  <p className="text-xs text-ink-subtle">
                    دو نفره روی یک گوشی: به نوبت کارت برمی‌گردانند و برنده جایزه
                    می‌گیرد.
                  </p>
                </div>
              </div>
              <Switch
                checked={config.memoryDuelEnabled}
                disabled={!editable || !isEnabled}
                onChange={(checked) => setConfig({ ...config, memoryDuelEnabled: checked })}
                label={config.memoryDuelEnabled ? 'روشن' : 'خاموش'}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="تعداد جفت کارت"
                hint="بین ۳ تا ۱۰؛ ۶ جفت روی موبایل بدون اسکرول جا می‌شود."
                dir="ltr"
                inputMode="numeric"
                disabled={!editable}
                value={String(config.memoryDuel.pairs)}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    memoryDuel: {
                      ...config.memoryDuel,
                      pairs: Math.min(10, Math.max(3, num(e.target.value) || 3)),
                    },
                  })
                }
              />
              <Input
                label="فاصله هر دوئل (ساعت)"
                hint="۰ یعنی بدون محدودیت"
                dir="ltr"
                inputMode="numeric"
                disabled={!editable}
                value={String(config.memoryDuel.cooldownHours)}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    memoryDuel: { ...config.memoryDuel, cooldownHours: num(e.target.value) },
                  })
                }
              />
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Input
                label="عنوان جایزهٔ برنده"
                disabled={!editable}
                value={config.memoryDuel.reward?.label ?? ''}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    memoryDuel: {
                      ...config.memoryDuel,
                      reward: {
                        label: e.target.value,
                        rewardType: config.memoryDuel.reward?.rewardType ?? 'PERCENTAGE',
                        rewardValue: config.memoryDuel.reward?.rewardValue ?? 10,
                        minOrderTotal: config.memoryDuel.reward?.minOrderTotal ?? 0,
                        expiryDays: config.memoryDuel.reward?.expiryDays ?? 7,
                      },
                    },
                  })
                }
              />
              <Input
                label={
                  config.memoryDuel.reward?.rewardType === 'FIXED'
                    ? 'مبلغ تخفیف (تومان)'
                    : 'درصد تخفیف'
                }
                dir="ltr"
                inputMode="numeric"
                disabled={!editable}
                value={String(config.memoryDuel.reward?.rewardValue ?? 10)}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    memoryDuel: {
                      ...config.memoryDuel,
                      reward: {
                        label: config.memoryDuel.reward?.label ?? 'جایزهٔ دوئل',
                        rewardType: config.memoryDuel.reward?.rewardType ?? 'PERCENTAGE',
                        rewardValue: Math.max(1, num(e.target.value) || 1),
                        minOrderTotal: config.memoryDuel.reward?.minOrderTotal ?? 0,
                        expiryDays: config.memoryDuel.reward?.expiryDays ?? 7,
                      },
                    },
                  })
                }
              />
            </div>

            <div className="mt-3">
              <Switch
                checked={config.memoryDuel.rewardOnDraw}
                disabled={!editable}
                onChange={(checked) =>
                  setConfig({
                    ...config,
                    memoryDuel: { ...config.memoryDuel, rewardOnDraw: checked },
                  })
                }
                label="در صورت مساوی هم جایزه بده"
              />
            </div>

            <p className="mt-3 text-xs text-ink-subtle">
              کارت‌ها از همین آیتم‌ها ساخته می‌شوند:{' '}
              {config.memoryDuel.itemLabels.join('، ')}
            </p>
          </section>

          <section className="rounded-2xl border border-line p-4">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-2xl bg-brand/10 text-brand">
                  <Trophy className="size-5" />
                </span>
                <div>
                  <p className="font-semibold text-ink">مسابقهٔ فصلی</p>
                  <p className="text-xs text-ink-subtle">
                    امتیاز همهٔ بازی‌ها در یک جدول جمع می‌شود و نفرات برتر دوره
                    جایزه می‌گیرند. جدول برای مشتری‌ها دیده می‌شود.
                  </p>
                </div>
              </div>
              <Switch
                checked={config.leaderboardEnabled}
                disabled={!editable || !isEnabled}
                onChange={(checked) =>
                  setConfig({ ...config, leaderboardEnabled: checked })
                }
                label={config.leaderboardEnabled ? 'روشن' : 'خاموش'}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="طول هر دوره (روز)"
                dir="ltr"
                inputMode="numeric"
                disabled={!editable}
                value={String(config.leaderboard.periodDays)}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    leaderboard: {
                      ...config.leaderboard,
                      periodDays: Math.min(365, Math.max(1, num(e.target.value) || 1)),
                    },
                  })
                }
              />
              <Input
                label="چند نفر در جدول دیده شوند"
                dir="ltr"
                inputMode="numeric"
                disabled={!editable}
                value={String(config.leaderboard.topN)}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    leaderboard: {
                      ...config.leaderboard,
                      topN: Math.min(100, Math.max(1, num(e.target.value) || 1)),
                    },
                  })
                }
              />
            </div>

            <div className="mt-4 space-y-2">
              <p className="text-sm font-medium text-ink-muted">جایزهٔ نفرات برتر</p>
              {config.leaderboard.rewards.map((reward, index) => (
                <div
                  key={reward.rank}
                  className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-[4rem_1fr_7rem]"
                >
                  <span className="self-center text-sm text-ink-muted">
                    نفر {toPersianDigits(reward.rank)}
                  </span>
                  <Input
                    aria-label={`عنوان جایزه نفر ${reward.rank}`}
                    disabled={!editable}
                    value={reward.label}
                    onChange={(e) => {
                      const rewards = [...config.leaderboard.rewards];
                      rewards[index] = { ...reward, label: e.target.value };
                      setConfig({
                        ...config,
                        leaderboard: { ...config.leaderboard, rewards },
                      });
                    }}
                  />
                  <Input
                    aria-label={`مقدار جایزه نفر ${reward.rank}`}
                    dir="ltr"
                    inputMode="numeric"
                    rightAddon={reward.rewardType === 'FIXED' ? 'ت' : '٪'}
                    disabled={!editable}
                    value={String(reward.rewardValue)}
                    onChange={(e) => {
                      const rewards = [...config.leaderboard.rewards];
                      rewards[index] = {
                        ...reward,
                        rewardValue: Math.max(1, num(e.target.value) || 1),
                      };
                      setConfig({
                        ...config,
                        leaderboard: { ...config.leaderboard, rewards },
                      });
                    }}
                  />
                </div>
              ))}
            </div>

            {config.leaderboardEnabled ? (
              <div className="mt-4 rounded-xl border border-caution/30 bg-caution/[0.08] p-3">
                <p className="text-xs leading-relaxed text-ink-muted">
                  با پایان دادن به دوره، کد تخفیف نفرات برتر همین حالا صادر
                  می‌شود و دورهٔ جدید از امروز شروع می‌شود. این کار برگشت‌پذیر
                  نیست.
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-2"
                  disabled={!editable}
                  loading={closeSeason.isPending}
                  onClick={() => closeSeason.mutate()}
                >
                  پایان دوره و اهدای جوایز
                </Button>
              </div>
            ) : null}
          </section>

          <div className="flex justify-end">
            <Button variant="primary" leftIcon={<Save className="size-4" />} loading={save.isPending} disabled={!editable} onClick={() => save.mutate()}>
              ذخیره تنظیمات بازی‌ها
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="بازی‌های اخیر" description="۵۰ اجرای آخر مشتری‌ها" />
        <CardBody>
          {playsQuery.isPending ? (
            <Skeleton className="h-24 rounded-xl" />
          ) : !playsQuery.data || playsQuery.data.length === 0 ? (
            <EmptyState icon={<Dices className="size-6" />} title="هنوز بازی‌ای انجام نشده" description="وقتی مشتری‌ها بازی کنند، اینجا نمایش داده می‌شود." />
          ) : (
            <div className="space-y-2">
              {playsQuery.data.map((play) => (
                <div key={play.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-line px-3 py-2 text-sm">
                  <Badge tone={play.model === 'SPIN' ? 'brand' : 'neutral'}>{play.model === 'SPIN' ? 'گردونه' : 'Kitchen Rush'}</Badge>
                  <span dir="ltr" className="font-mono tabular-nums text-ink-muted">{play.phone}</span>
                  <span className="text-ink">{play.label ?? '—'}</span>
                  {play.couponCode ? <Badge tone="brand">{play.couponCode}</Badge> : null}
                  <span className="ms-auto text-xs text-ink-subtle">{formatDateFa(play.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function num(value: string): number {
  return Number(value.replace(/\D/g, '')) || 0;
}

function SpinEditor({ config, setConfig, editable }: { config: SpinConfig; setConfig: (config: SpinConfig) => void; editable: boolean }) {
  const setSegment = (index: number, patch: Partial<SpinConfig['segments'][number]>) =>
    setConfig({ ...config, segments: config.segments.map((segment, i) => (i === index ? { ...segment, ...patch } : segment)) });

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-ink-muted">بخش‌های گردونه</p>
        <span className="text-xs text-ink-subtle">وزن بیشتر = احتمال بیشتر</span>
      </div>
      <div className="space-y-3">
        {config.segments.map((segment, index) => (
          <div key={index} className="rounded-xl border border-line bg-surface p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <Input label="عنوان روی گردونه" disabled={!editable} value={segment.label} onChange={(e) => setSegment(index, { label: e.target.value })} />
              <Input label="وزن / شانس" dir="ltr" inputMode="numeric" disabled={!editable} value={String(segment.weight)} onChange={(e) => setSegment(index, { weight: Math.max(1, num(e.target.value) || 1) })} />
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <Select label="نوع جایزه" disabled={!editable} value={segment.rewardType} options={SPIN_REWARD_OPTIONS} onChange={(e) => setSegment(index, { rewardType: e.target.value as SpinConfig['segments'][number]['rewardType'] })} />
              {segment.rewardType !== 'NONE' ? <Input label={segment.rewardType === 'PERCENTAGE' ? 'درصد تخفیف' : 'مبلغ تخفیف (تومان)'} dir="ltr" inputMode="numeric" disabled={!editable} value={String(segment.rewardValue)} onChange={(e) => setSegment(index, { rewardValue: num(e.target.value) })} /> : <div />}
            </div>
            {segment.rewardType !== 'NONE' ? (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <Input label="حداقل سفارش (تومان)" dir="ltr" inputMode="numeric" disabled={!editable} value={String(segment.minOrderTotal)} onChange={(e) => setSegment(index, { minOrderTotal: num(e.target.value) })} />
                <Input label="اعتبار کد (روز)" dir="ltr" inputMode="numeric" disabled={!editable} value={String(segment.expiryDays)} onChange={(e) => setSegment(index, { expiryDays: Math.max(1, num(e.target.value) || 1) })} />
              </div>
            ) : null}
            {editable && config.segments.length > 2 ? <div className="mt-2 flex justify-end"><Button variant="ghost" size="sm" leftIcon={<Trash2 className="size-4" />} onClick={() => setConfig({ ...config, segments: config.segments.filter((_, i) => i !== index) })}>حذف</Button></div> : null}
          </div>
        ))}
      </div>
      {editable && config.segments.length < 12 ? <Button variant="ghost" size="sm" className="mt-2" leftIcon={<Plus className="size-4" />} onClick={() => setConfig({ ...config, segments: [...config.segments, { label: 'جایزه جدید', weight: 1, rewardType: 'NONE', rewardValue: 0, minOrderTotal: 0, expiryDays: 14 }] })}>افزودن بخش</Button> : null}
    </div>
  );
}

function KitchenRushEditor({ config, setConfig, editable }: { config: KitchenRushConfig; setConfig: (config: KitchenRushConfig) => void; editable: boolean }) {
  const setReward = (index: number, patch: Partial<KitchenRushConfig['rewards'][number]>) =>
    setConfig({ ...config, rewards: config.rewards.map((reward, i) => (i === index ? { ...reward, ...patch } : reward)) });

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Input label="مدت بازی (ثانیه)" hint="۶۰ تا ۱۸۰" dir="ltr" inputMode="numeric" disabled={!editable} value={String(config.durationSeconds)} onChange={(e) => setConfig({ ...config, durationSeconds: Math.min(180, Math.max(60, num(e.target.value) || 60)) })} />
        <Input label="تعداد جان" dir="ltr" inputMode="numeric" disabled={!editable} value={String(config.lives)} onChange={(e) => setConfig({ ...config, lives: Math.min(6, Math.max(2, num(e.target.value) || 2)) })} />
        <Input label="امتیاز هر آیتم درست" dir="ltr" inputMode="numeric" disabled={!editable} value={String(config.scorePerCorrect)} onChange={(e) => setConfig({ ...config, scorePerCorrect: Math.max(5, num(e.target.value) || 5) })} />
        <Input label="پله افزایش Combo" dir="ltr" inputMode="numeric" disabled={!editable} value={String(config.comboStep)} onChange={(e) => setConfig({ ...config, comboStep: Math.max(2, num(e.target.value) || 2) })} />
        <Input label="Combo لازم برای Fever" dir="ltr" inputMode="numeric" disabled={!editable} value={String(config.feverThreshold)} onChange={(e) => setConfig({ ...config, feverThreshold: Math.max(4, num(e.target.value) || 4) })} />
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-ink-muted">آیتم‌هایی که در سفارش‌های بازی ظاهر می‌شوند</p>
        <div className="flex flex-wrap gap-2">
          {config.itemLabels.map((item, index) => (
            <div key={`${index}-${item}`} className="flex items-center gap-1 rounded-xl border border-line bg-surface px-2 py-1">
              <Input className="!h-8 !border-0 !bg-transparent !p-1" disabled={!editable} value={item} onChange={(e) => setConfig({ ...config, itemLabels: config.itemLabels.map((value, i) => (i === index ? e.target.value : value)) })} />
              {editable && config.itemLabels.length > 4 ? <button type="button" className="text-ink-subtle hover:text-critical" onClick={() => setConfig({ ...config, itemLabels: config.itemLabels.filter((_, i) => i !== index) })}><Trash2 className="size-3.5" /></button> : null}
            </div>
          ))}
        </div>
        {editable && config.itemLabels.length < 16 ? <Button variant="ghost" size="sm" className="mt-2" leftIcon={<Plus className="size-4" />} onClick={() => setConfig({ ...config, itemLabels: [...config.itemLabels, 'آیتم جدید'] })}>افزودن آیتم</Button> : null}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-3"><p className="text-sm font-medium text-ink-muted">جوایز بر اساس امتیاز یک اجرا</p><span className="text-xs text-ink-subtle">بالاترین پله‌ای که رد شود برنده می‌شود</span></div>
        <div className="space-y-3">
          {config.rewards.map((reward, index) => (
            <div key={index} className="rounded-xl border border-line bg-surface p-3">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <Input label="عنوان جایزه" disabled={!editable} value={reward.label} onChange={(e) => setReward(index, { label: e.target.value })} />
                <Input label="حداقل امتیاز" dir="ltr" inputMode="numeric" disabled={!editable} value={String(reward.minScore)} onChange={(e) => setReward(index, { minScore: num(e.target.value) })} />
                <Select label="نوع جایزه" disabled={!editable} value={reward.rewardType} options={REWARD_OPTIONS} onChange={(e) => setReward(index, { rewardType: e.target.value as KitchenRushConfig['rewards'][number]['rewardType'] })} />
                <Input label={reward.rewardType === 'PERCENTAGE' ? 'درصد تخفیف' : 'مبلغ تخفیف (تومان)'} dir="ltr" inputMode="numeric" disabled={!editable} value={String(reward.rewardValue)} onChange={(e) => setReward(index, { rewardValue: num(e.target.value) })} />
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <Input label="حداقل سفارش (تومان)" dir="ltr" inputMode="numeric" disabled={!editable} value={String(reward.minOrderTotal)} onChange={(e) => setReward(index, { minOrderTotal: num(e.target.value) })} />
                <Input label="اعتبار کد (روز)" dir="ltr" inputMode="numeric" disabled={!editable} value={String(reward.expiryDays)} onChange={(e) => setReward(index, { expiryDays: Math.max(1, num(e.target.value) || 1) })} />
              </div>
              {editable && config.rewards.length > 1 ? <div className="mt-2 flex justify-end"><Button variant="ghost" size="sm" leftIcon={<Trash2 className="size-4" />} onClick={() => setConfig({ ...config, rewards: config.rewards.filter((_, i) => i !== index) })}>حذف</Button></div> : null}
            </div>
          ))}
        </div>
        {editable && config.rewards.length < 10 ? <Button variant="ghost" size="sm" className="mt-2" leftIcon={<Plus className="size-4" />} onClick={() => setConfig({ ...config, rewards: [...config.rewards, { label: 'جایزه جدید', minScore: 1500, rewardType: 'PERCENTAGE', rewardValue: 5, minOrderTotal: 0, expiryDays: 14 }] })}>افزودن جایزه</Button> : null}
      </div>
    </div>
  );
}
