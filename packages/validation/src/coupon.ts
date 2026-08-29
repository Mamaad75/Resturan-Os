import { z } from 'zod';
import {
  dateInputSchema,
  moneySchema,
  nonNegativeIntSchema,
  optionalText,
} from './primitives';

/**
 * Coupon codes are uppercased and stripped of spaces on the way in, so a
 * customer typing "welcome 10" redeems WELCOME10.
 */
export const couponCodeSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/\s+/g, '').toUpperCase())
  .refine((v) => v.length >= 3 && v.length <= 32, {
    message: 'کد تخفیف باید بین ۳ تا ۳۲ کاراکتر باشد.',
  })
  .refine((v) => /^[A-Z0-9-]+$/.test(v), {
    message: 'کد تخفیف فقط می‌تواند شامل حروف انگلیسی، عدد و خط تیره باشد.',
  });

export const createCouponSchema = z
  .object({
    code: couponCodeSchema,
    type: z.enum(['PERCENTAGE', 'FIXED'], {
      errorMap: () => ({ message: 'نوع تخفیف معتبر نیست.' }),
    }),
    /** Basis points for PERCENTAGE (1500 = 15%), a flat amount for FIXED. */
    value: nonNegativeIntSchema,
    description: optionalText(200, 'توضیحات'),
    minOrderTotal: moneySchema.default(0),
    maxDiscount: z.union([moneySchema, z.null()]).optional(),
    startsAt: dateInputSchema.nullable().optional(),
    endsAt: dateInputSchema.nullable().optional(),
    usageLimit: z.union([nonNegativeIntSchema, z.null()]).optional(),
    perCustomerLimit: z.union([nonNegativeIntSchema, z.null()]).optional(),
    isActive: z.boolean().default(true),
  })
  .superRefine((coupon, ctx) => {
    if (coupon.type === 'PERCENTAGE') {
      if (coupon.value <= 0 || coupon.value > 10_000) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['value'],
          message: 'درصد تخفیف باید بین ۰ تا ۱۰۰ باشد.',
        });
      }
    } else if (coupon.value <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'مبلغ تخفیف باید بزرگ‌تر از صفر باشد.',
      });
    }

    if (
      coupon.startsAt &&
      coupon.endsAt &&
      new Date(coupon.startsAt) >= new Date(coupon.endsAt)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endsAt'],
        message: 'تاریخ پایان باید بعد از تاریخ شروع باشد.',
      });
    }
  });
export type CreateCouponInput = z.infer<typeof createCouponSchema>;

/** Same fields, all optional; the code itself is immutable once issued. */
export const updateCouponSchema = z.object({
  description: optionalText(200, 'توضیحات'),
  minOrderTotal: moneySchema.optional(),
  maxDiscount: z.union([moneySchema, z.null()]).optional(),
  startsAt: dateInputSchema.nullable().optional(),
  endsAt: dateInputSchema.nullable().optional(),
  usageLimit: z.union([nonNegativeIntSchema, z.null()]).optional(),
  perCustomerLimit: z.union([nonNegativeIntSchema, z.null()]).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateCouponInput = z.infer<typeof updateCouponSchema>;

/** Preview a code against a cart subtotal before the order is submitted. */
export const previewCouponSchema = z.object({
  code: couponCodeSchema,
  subtotal: moneySchema,
  phone: optionalText(20, 'شماره موبایل'),
});
export type PreviewCouponInput = z.infer<typeof previewCouponSchema>;
