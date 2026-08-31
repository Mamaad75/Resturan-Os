import { z } from 'zod';
import { PLAN_FEATURE_KEYS, PLAN_LIMIT_KEYS } from '@restaurant-os/types';
import { displayTextSchema, moneySchema, optionalText, uuidSchema } from './primitives';

/** Platform sign-in. Separate from tenant auth: a different table, a different token. */
export const platformLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email('ایمیل معتبر نیست.'),
  password: z.string().min(1, 'رمز عبور را وارد کنید.'),
});
export type PlatformLoginInput = z.infer<typeof platformLoginSchema>;

const nullableLimit = z
  .union([z.coerce.number().int().min(0).max(1_000_000), z.null()])
  .optional();

const limitShape = Object.fromEntries(
  PLAN_LIMIT_KEYS.map((key) => [key, nullableLimit]),
) as Record<(typeof PLAN_LIMIT_KEYS)[number], typeof nullableLimit>;

const featureShape = Object.fromEntries(
  PLAN_FEATURE_KEYS.map((key) => [key, z.boolean().optional()]),
) as Record<(typeof PLAN_FEATURE_KEYS)[number], z.ZodOptional<z.ZodBoolean>>;

export const createPlanSchema = z.object({
  key: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, 'کلید پلن حداقل ۲ کاراکتر است.')
    .max(40)
    .regex(/^[a-z0-9_-]+$/, 'کلید پلن فقط حروف انگلیسی، عدد، خط تیره و زیرخط.'),
  name: displayTextSchema(2, 80, 'نام پلن'),
  nameFa: displayTextSchema(2, 80, 'نام فارسی پلن'),
  description: optionalText(500, 'توضیح پلن'),
  monthlyPrice: moneySchema,
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  displayOrder: z.coerce.number().int().min(0).max(999).optional(),
  ...limitShape,
  ...featureShape,
});
export type CreatePlanInput = z.infer<typeof createPlanSchema>;

export const updatePlanSchema = createPlanSchema.partial().omit({ key: true });
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;

/**
 * Subscription edits.
 *
 * Dates arrive as ISO strings and are stored as instants; a null clears the
 * field, an absent key leaves it untouched.
 */
const nullableDate = z
  .union([z.string().datetime({ offset: true }), z.string().date(), z.null()])
  .optional();

export const updateSubscriptionSchema = z
  .object({
    planId: uuidSchema.optional(),
    status: z
      .enum(['TRIAL', 'ACTIVE', 'GRACE_PERIOD', 'EXPIRED', 'SUSPENDED'])
      .optional(),
    startedAt: nullableDate,
    expiresAt: nullableDate,
    trialEndsAt: nullableDate,
    graceUntil: nullableDate,
    suspendedReason: optionalText(300, 'دلیل تعلیق'),
  })
  .strict();
export type UpdateSubscriptionInput = z.infer<typeof updateSubscriptionSchema>;

/** "Give them another N days", the operation an operator actually performs. */
export const extendSubscriptionSchema = z.object({
  days: z.coerce
    .number()
    .int('تعداد روز باید عدد صحیح باشد.')
    .min(1, 'حداقل یک روز.')
    .max(3650, 'حداکثر ۱۰ سال.'),
  note: optionalText(300, 'یادداشت'),
});
export type ExtendSubscriptionInput = z.infer<typeof extendSubscriptionSchema>;

export const suspendTenantSchema = z.object({
  reason: displayTextSchema(3, 300, 'دلیل'),
});
export type SuspendTenantInput = z.infer<typeof suspendTenantSchema>;

export const tenantNotesSchema = z.object({
  adminNotes: optionalText(2000, 'یادداشت مدیر'),
});
export type TenantNotesInput = z.infer<typeof tenantNotesSchema>;
