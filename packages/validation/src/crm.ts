import { z } from 'zod';
import { displayTextSchema, optionalText } from './primitives';

const SEGMENTS = [
  'ALL',
  'NEW',
  'RETURNING',
  'VIP',
  'HIGH_VALUE',
  'INACTIVE_30',
  'INACTIVE_60',
  'DINE_IN',
  'TAKEAWAY',
] as const;

export const customerSegmentSchema = z.enum(SEGMENTS, {
  errorMap: () => ({ message: 'دسته مشتری معتبر نیست.' }),
});

export const updateCustomerSchema = z
  .object({
    name: optionalText(120, 'نام مشتری'),
    notes: optionalText(2000, 'یادداشت'),
    tags: z.array(displayTextSchema(1, 30, 'برچسب')).max(12).optional(),
    marketingConsent: z.boolean().optional(),
  })
  .strict();
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

export const createCampaignSchema = z.object({
  name: displayTextSchema(2, 120, 'نام کمپین'),
  segment: customerSegmentSchema,
  /**
   * Marketing bodies are plain text. `{name}` is the only placeholder, so a
   * body cannot smuggle other customers' data into a message.
   */
  body: displayTextSchema(10, 480, 'متن پیام'),
});
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

/* ------------------------------------------------------------------ */
/* Loyalty                                                             */
/* ------------------------------------------------------------------ */

export const loyaltyProgramSchema = z.object({
  isEnabled: z.boolean(),
  pointsPerThousand: z.coerce
    .number()
    .int('نرخ امتیاز باید عدد صحیح باشد.')
    .min(0, 'نرخ نمی‌تواند منفی باشد.')
    .max(1000, 'نرخ بیش از حد بزرگ است.'),
  tomanPerPoint: z.coerce
    .number()
    .int('ارزش امتیاز باید عدد صحیح باشد.')
    .min(1, 'ارزش هر امتیاز حداقل ۱ تومان است.')
    .max(1_000_000, 'ارزش امتیاز بیش از حد بزرگ است.'),
  minRedeemPoints: z.coerce.number().int().min(0).max(1_000_000),
  /** 10000 = the whole order may be paid with points. */
  maxRedeemBps: z.coerce.number().int().min(0).max(10_000),
  welcomePoints: z.coerce.number().int().min(0).max(1_000_000),
  expiryDays: z
    .union([z.coerce.number().int().min(1).max(3650), z.null()])
    .optional(),
});
export type LoyaltyProgramInput = z.infer<typeof loyaltyProgramSchema>;

/** Manual correction. A reason is required: an unexplained balance is a dispute. */
export const adjustPointsSchema = z.object({
  points: z.coerce
    .number()
    .int('امتیاز باید عدد صحیح باشد.')
    .refine((value) => value !== 0, { message: 'مقدار نمی‌تواند صفر باشد.' })
    .refine((value) => Math.abs(value) <= 1_000_000, {
      message: 'مقدار بیش از حد بزرگ است.',
    }),
  note: displayTextSchema(3, 300, 'دلیل'),
});
export type AdjustPointsInput = z.infer<typeof adjustPointsSchema>;
