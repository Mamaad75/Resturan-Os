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

/**
 * Per-tenant exceptions to a plan.
 *
 * Deliberately a partial: a key that is absent means "follow the plan", which
 * is not the same as a key set to the plan's current value. An admin removing
 * an exception should leave the tenant tracking the plan again, including
 * whatever the plan becomes later.
 *
 * `null` for a limit means unlimited, which is a thing the platform grants, so
 * it is a value rather than an absence.
 */
const limitOverrideSchema = z
  .number()
  .int('محدودیت باید عدد صحیح باشد.')
  .min(0, 'محدودیت نمی‌تواند منفی باشد.')
  .max(1_000_000)
  .nullable();

export const entitlementOverridesSchema = z.object({
  limits: z
    .object({
      maxBranches: limitOverrideSchema.optional(),
      maxStaff: limitOverrideSchema.optional(),
      maxProducts: limitOverrideSchema.optional(),
      maxTables: limitOverrideSchema.optional(),
      maxMonthlyOrders: limitOverrideSchema.optional(),
      smsAllowance: limitOverrideSchema.optional(),
    })
    .default({}),
  features: z
    .object({
      customThemeEnabled: z.boolean().optional(),
      advancedThemeEnabled: z.boolean().optional(),
      customCssEnabled: z.boolean().optional(),
      crmEnabled: z.boolean().optional(),
      campaignsEnabled: z.boolean().optional(),
      takeawayEnabled: z.boolean().optional(),
      dineInEnabled: z.boolean().optional(),
      waiterCallEnabled: z.boolean().optional(),
      reportsEnabled: z.boolean().optional(),
      couponsEnabled: z.boolean().optional(),
      multiBranchEnabled: z.boolean().optional(),
    })
    .default({}),
  /** Why, for whoever reads this in six months. */
  note: optionalText(300, 'دلیل'),
});
export type EntitlementOverridesInput = z.infer<typeof entitlementOverridesSchema>;

/* ------------------------------------------------------------------ */
/* Subscription billing                                                */
/* ------------------------------------------------------------------ */

/**
 * Activate a plan for a period.
 *
 * The operation an operator actually performs, as one call: pick the plan,
 * pick how long, done. Setting four dates by hand and hoping they agree is
 * how a tenant ends up ACTIVE with an expiry in the past.
 */
export const activatePlanSchema = z.object({
  planId: uuidSchema,
  months: z.coerce
    .number()
    .int('تعداد ماه باید عدد صحیح باشد.')
    .min(1, 'حداقل یک ماه.')
    .max(120, 'حداکثر ۱۰ سال.'),
  note: optionalText(300, 'یادداشت'),
});
export type ActivatePlanInput = z.infer<typeof activatePlanSchema>;

/** Digits only, 16 for an Iranian card. Spaces and dashes are stripped. */
const cardNumberSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s-]/g, ''))
  .refine((value) => /^\d{16}$/.test(value), {
    message: 'شماره کارت باید ۱۶ رقم باشد.',
  });

export const bankAccountSchema = z.object({
  bankName: displayTextSchema(2, 60, 'نام بانک'),
  holderName: displayTextSchema(2, 80, 'نام صاحب حساب'),
  cardNumber: cardNumberSchema,
  iban: z
    .union([z.string(), z.null()])
    .transform((value) => {
      if (value == null) return null;
      const cleaned = value.trim().replace(/[\s-]/g, '').toUpperCase();
      return cleaned === '' ? null : cleaned;
    })
    .refine((value) => value === null || /^IR\d{24}$/.test(value), {
      message: 'شماره شبا باید با IR شروع شود و ۲۴ رقم داشته باشد.',
    })
    .optional(),
  note: optionalText(300, 'توضیح'),
  isActive: z.boolean().optional(),
  displayOrder: z.coerce.number().int().min(0).max(999).optional(),
});
export type BankAccountInput = z.infer<typeof bankAccountSchema>;

export const updateBankAccountSchema = bankAccountSchema.partial();
export type UpdateBankAccountInput = z.infer<typeof updateBankAccountSchema>;

/**
 * A tenant reporting a card-to-card transfer.
 *
 * The amount is not taken from the client: it is computed server-side from the
 * plan and the period, or a tenant could report having paid one Toman.
 */
export const submitInvoiceSchema = z.object({
  planId: uuidSchema,
  months: z.coerce
    .number()
    .int('تعداد ماه باید عدد صحیح باشد.')
    .min(1, 'حداقل یک ماه.')
    .max(24, 'حداکثر ۲۴ ماه.'),
  bankAccountId: uuidSchema.optional(),
  payerName: optionalText(80, 'نام واریزکننده'),
  referenceCode: optionalText(60, 'شماره پیگیری'),
  paidAt: z.union([z.string().datetime({ offset: true }), z.string().date()]).optional(),
  receiptUrl: optionalText(500, 'تصویر رسید'),
  note: optionalText(500, 'توضیح'),
});
export type SubmitInvoiceInput = z.infer<typeof submitInvoiceSchema>;

/** The platform's verdict on a receipt. */
export const reviewInvoiceSchema = z.object({
  reviewNote: optionalText(300, 'یادداشت بررسی'),
});
export type ReviewInvoiceInput = z.infer<typeof reviewInvoiceSchema>;

export const rejectInvoiceSchema = z.object({
  reviewNote: displayTextSchema(3, 300, 'دلیل رد'),
});
export type RejectInvoiceInput = z.infer<typeof rejectInvoiceSchema>;

export const invoiceQuerySchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type InvoiceQueryInput = z.infer<typeof invoiceQuerySchema>;
