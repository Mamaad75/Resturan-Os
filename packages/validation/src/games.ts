import { z } from 'zod';

export const gameRulesSchema = z
  .object({
    isEnabled: z.boolean(),
    dailyLimit: z.number().int().min(1).max(5),
    pointsPerWin: z.number().int().min(1).max(100),
    couponCost: z.number().int().min(10).max(10000),
    couponMaxDiscount: z.number().int().min(1000).max(500000),
    couponMinOrder: z.number().int().min(0).max(10000000),
  })
  .strict();
export const gameStartSchema = z
  .object({ kind: z.enum(['MEMORY', 'MATH']) })
  .strict();
export const gameMoveSchema = z
  .object({
    revision: z.number().int().min(0).max(100),
    value: z.number().int().min(0).max(200),
  })
  .strict();
export const gameRewardSchema = z
  .object({ requestId: z.string().uuid() })
  .strict();
