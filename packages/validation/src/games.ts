import { z } from 'zod';
import { iranianMobileSchema, optionalText } from './primitives';

/** NONE = a "no prize" segment; PERCENTAGE/FIXED mint a discount coupon. */
export const gameRewardTypeSchema = z.enum(['NONE', 'PERCENTAGE', 'FIXED']);

/**
 * One wheel segment. `rewardValue` is a percent (1–90) for PERCENTAGE and a
 * Toman amount for FIXED; the server converts a percentage to basis points
 * when it mints the coupon.
 */
export const spinSegmentSchema = z
  .object({
    label: z.string().trim().min(1, 'عنوان لازم است').max(80),
    weight: z.coerce.number().int().min(1).max(1000).default(1),
    rewardType: gameRewardTypeSchema,
    rewardValue: z.coerce.number().int().min(0).max(1_000_000_000).default(0),
    minOrderTotal: z.coerce.number().int().min(0).default(0),
    expiryDays: z.coerce.number().int().min(1).max(365).default(14),
  })
  .superRefine((v, ctx) => {
    if (v.rewardType === 'PERCENTAGE' && (v.rewardValue < 1 || v.rewardValue > 90)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rewardValue'],
        message: 'درصد تخفیف باید بین ۱ تا ۹۰ باشد.',
      });
    }
    if (v.rewardType === 'FIXED' && v.rewardValue < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rewardValue'],
        message: 'مبلغ تخفیف باید بزرگ‌تر از صفر باشد.',
      });
    }
  });
export type SpinSegmentInput = z.infer<typeof spinSegmentSchema>;

export const spinConfigSchema = z.object({
  segments: z.array(spinSegmentSchema).min(2, 'حداقل ۲ بخش لازم است').max(12),
  cooldownHours: z.coerce.number().int().min(0).max(168).default(24),
  scorePerPlay: z.coerce.number().int().min(0).max(1000).default(10),
});
export type SpinConfigInput = z.infer<typeof spinConfigSchema>;

/** A reward with a required label + PERCENTAGE/FIXED value. Used by tiers/ranks. */
function refineReward(
  v: { rewardType: 'NONE' | 'PERCENTAGE' | 'FIXED'; rewardValue: number },
  ctx: z.RefinementCtx,
) {
  if (v.rewardType === 'PERCENTAGE' && (v.rewardValue < 1 || v.rewardValue > 90)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rewardValue'], message: 'درصد باید ۱ تا ۹۰ باشد.' });
  }
  if (v.rewardType === 'FIXED' && v.rewardValue < 1) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rewardValue'], message: 'مبلغ باید بزرگ‌تر از صفر باشد.' });
  }
}

/** THRESHOLD: reach `points` cumulative score to earn this reward, once. */
export const thresholdTierSchema = z
  .object({
    label: z.string().trim().min(1, 'عنوان لازم است').max(80),
    points: z.coerce.number().int().min(1).max(1_000_000),
    rewardType: z.enum(['PERCENTAGE', 'FIXED']),
    rewardValue: z.coerce.number().int().min(1).max(1_000_000_000),
    minOrderTotal: z.coerce.number().int().min(0).default(0),
    expiryDays: z.coerce.number().int().min(1).max(365).default(14),
  })
  .superRefine(refineReward);
export type ThresholdTierInput = z.infer<typeof thresholdTierSchema>;

export const thresholdConfigSchema = z.object({
  scorePerPlay: z.coerce.number().int().min(1).max(1000).default(10),
  cooldownHours: z.coerce.number().int().min(0).max(168).default(24),
  tiers: z.array(thresholdTierSchema).min(1, 'حداقل ۱ پله لازم است').max(10),
});
export type ThresholdConfigInput = z.infer<typeof thresholdConfigSchema>;

/** LEADERBOARD: players in the top ranks over a period earn a reward. */
export const leaderboardRewardSchema = z
  .object({
    rank: z.coerce.number().int().min(1).max(100),
    label: z.string().trim().min(1, 'عنوان لازم است').max(80),
    rewardType: z.enum(['PERCENTAGE', 'FIXED']),
    rewardValue: z.coerce.number().int().min(1).max(1_000_000_000),
    minOrderTotal: z.coerce.number().int().min(0).default(0),
    expiryDays: z.coerce.number().int().min(1).max(365).default(14),
  })
  .superRefine(refineReward);
export type LeaderboardRewardInput = z.infer<typeof leaderboardRewardSchema>;

export const leaderboardConfigSchema = z.object({
  scorePerPlay: z.coerce.number().int().min(1).max(1000).default(10),
  cooldownHours: z.coerce.number().int().min(0).max(168).default(24),
  periodDays: z.coerce.number().int().min(1).max(365).default(30),
  topN: z.coerce.number().int().min(1).max(100).default(10),
  rewards: z
    .array(leaderboardRewardSchema)
    .min(1, 'حداقل ۱ جایزه لازم است')
    .max(20)
    .default([
      {
        rank: 1,
        label: 'نفر اول ماه',
        rewardType: 'PERCENTAGE',
        rewardValue: 30,
        minOrderTotal: 0,
        expiryDays: 14,
      },
      {
        rank: 2,
        label: 'نفر دوم ماه',
        rewardType: 'PERCENTAGE',
        rewardValue: 20,
        minOrderTotal: 0,
        expiryDays: 14,
      },
      {
        rank: 3,
        label: 'نفر سوم ماه',
        rewardType: 'PERCENTAGE',
        rewardValue: 10,
        minOrderTotal: 0,
        expiryDays: 14,
      },
    ]),
  /**
   * When the current season began. Absent means "when the game row was
   * created", which is what a competition that has never been closed uses.
   */
  seasonStartedAt: z.string().datetime({ offset: true }).nullable().default(null),
});
export type LeaderboardConfigInput = z.infer<typeof leaderboardConfigSchema>;


/** KITCHEN_RUSH: a 60-180 second skill game with lives, combos and Fever mode. */
export const kitchenRushRewardSchema = z
  .object({
    label: z.string().trim().min(1, 'عنوان لازم است').max(80),
    minScore: z.coerce.number().int().min(0).max(1_000_000),
    rewardType: z.enum(['PERCENTAGE', 'FIXED']),
    rewardValue: z.coerce.number().int().min(1).max(1_000_000_000),
    minOrderTotal: z.coerce.number().int().min(0).default(0),
    expiryDays: z.coerce.number().int().min(1).max(365).default(14),
  })
  .superRefine(refineReward);
export type KitchenRushRewardInput = z.infer<typeof kitchenRushRewardSchema>;

export const kitchenRushConfigSchema = z.object({
  durationSeconds: z.coerce.number().int().min(60).max(180).default(120),
  lives: z.coerce.number().int().min(2).max(6).default(3),
  scorePerCorrect: z.coerce.number().int().min(5).max(500).default(25),
  comboStep: z.coerce.number().int().min(2).max(20).default(4),
  feverThreshold: z.coerce.number().int().min(4).max(30).default(8),
  cooldownHours: z.coerce.number().int().min(0).max(168).default(24),
  /** Progress points added to the persistent player level after a completed run. */
  scorePerPlay: z.coerce.number().int().min(1).max(1000).default(25),
  itemLabels: z.array(z.string().trim().min(1).max(40)).min(4).max(16),
  rewards: z.array(kitchenRushRewardSchema).min(1).max(10),
});
export type KitchenRushConfigInput = z.infer<typeof kitchenRushConfigSchema>;

export const finishKitchenRushSchema = z.object({
  sessionToken: z.string().regex(/^[a-f0-9]{48}$/i, 'نشست بازی معتبر نیست.'),
  score: z.coerce.number().int().min(0).max(1_000_000),
  correct: z.coerce.number().int().min(0).max(1000),
  mistakes: z.coerce.number().int().min(0).max(1000),
  comboMax: z.coerce.number().int().min(0).max(1000),
  durationMs: z.coerce.number().int().min(0).max(600_000),
});
export type FinishKitchenRushInput = z.infer<typeof finishKitchenRushSchema>;


/** MEMORY DUEL: two guests, one phone, one prize for whoever wins. */
export const memoryDuelRewardSchema = z
  .object({
    label: z.string().trim().min(1, 'عنوان لازم است').max(80),
    rewardType: z.enum(['PERCENTAGE', 'FIXED']),
    rewardValue: z.coerce.number().int().min(1).max(1_000_000_000),
    minOrderTotal: z.coerce.number().int().min(0).default(0),
    expiryDays: z.coerce.number().int().min(1).max(365).default(7),
  })
  .superRefine(refineReward);
export type MemoryDuelRewardInput = z.infer<typeof memoryDuelRewardSchema>;

export const memoryDuelConfigSchema = z.object({
  /** Six pairs is twelve cards, which fits a phone without scrolling. */
  pairs: z.coerce.number().int().min(3).max(10).default(6),
  cooldownHours: z.coerce.number().int().min(0).max(168).default(24),
  scorePerPlay: z.coerce.number().int().min(1).max(1000).default(20),
  itemLabels: z
    .array(z.string().trim().min(1).max(40))
    .min(3)
    .max(12)
    .default(['برگر', 'پیتزا', 'قهوه', 'سیب‌زمینی', 'سالاد', 'نوشیدنی']),
  /** What the winner gets. Null for a game played for its own sake. */
  reward: memoryDuelRewardSchema.nullable().default(null),
  /** A draw is possible with an even board; this says whether it pays. */
  rewardOnDraw: z.boolean().default(false),
});
export type MemoryDuelConfigInput = z.infer<typeof memoryDuelConfigSchema>;

export const finishMemoryDuelSchema = z.object({
  sessionToken: z.string().regex(/^[a-f0-9]{48}$/i, 'نشست بازی معتبر نیست.'),
  scoreOne: z.coerce.number().int().min(0).max(12),
  scoreTwo: z.coerce.number().int().min(0).max(12),
  turns: z.coerce.number().int().min(0).max(500),
  durationMs: z.coerce.number().int().min(0).max(1_800_000),
});
export type FinishMemoryDuelInput = z.infer<typeof finishMemoryDuelSchema>;

/**
 * ARCADE: Wheel of Fortune, Kitchen Rush and Memory Duel are independent games
 * that can be enabled together. The database still keeps one JSON row per
 * tenant, so this ships without a schema migration while avoiding the old
 * single-model switch.
 */
export const arcadeConfigSchema = z.object({
  spinEnabled: z.boolean().default(true),
  spin: spinConfigSchema,
  kitchenRushEnabled: z.boolean().default(true),
  kitchenRush: kitchenRushConfigSchema,
  /*
   * Off by default, including for tenants whose stored config predates it:
   * a game that appears on a restaurant's menu without the owner switching it
   * on is a surprise, and this one hands out discounts.
   */
  /*
   * The season-long competition. Off by default for the same reason as the
   * duel: it publishes a board of a restaurant's customers and hands out
   * prizes, neither of which should start because the platform deployed.
   */
  leaderboardEnabled: z.boolean().default(false),
  leaderboard: leaderboardConfigSchema.default({}),
  memoryDuelEnabled: z.boolean().default(false),
  /*
   * Defaulted, so a config saved before this game existed still parses. Without
   * it the whole arcade config would fail to validate and fall back to
   * defaults, quietly resetting every restaurant's wheel segments and Kitchen
   * Rush settings the first time they were read.
   */
  memoryDuel: memoryDuelConfigSchema.default({}),
});
export type ArcadeConfigInput = z.infer<typeof arcadeConfigSchema>;

export const updateGameConfigSchema = z
  .object({
    isEnabled: z.boolean(),
    model: z.enum(['ARCADE', 'SPIN', 'KITCHEN_RUSH', 'THRESHOLD', 'LEADERBOARD']),
    config: z.any(),
  })
  .superRefine((v, ctx) => {
    const ok =
      v.model === 'ARCADE'
        ? arcadeConfigSchema.safeParse(v.config).success
        : v.model === 'SPIN'
          ? spinConfigSchema.safeParse(v.config).success
          : v.model === 'KITCHEN_RUSH'
            ? kitchenRushConfigSchema.safeParse(v.config).success
            : v.model === 'THRESHOLD'
              ? thresholdConfigSchema.safeParse(v.config).success
              : leaderboardConfigSchema.safeParse(v.config).success;
    if (!ok) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['config'],
        message: 'تنظیمات بازی نامعتبر است.',
      });
    }
  });
export type UpdateGameConfigInput = z.infer<typeof updateGameConfigSchema>;

export const playGameSchema = z.object({
  phone: iranianMobileSchema,
  name: optionalText(120, 'نام'),
});
export type PlayGameInput = z.infer<typeof playGameSchema>;
