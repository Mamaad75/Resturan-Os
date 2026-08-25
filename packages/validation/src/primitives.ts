import { z } from 'zod';
import { normalizeIranianMobile, toLatinDigits } from '@restaurant-os/types';

/** UUID identifiers, as produced by the database defaults. */
export const uuidSchema = z.string().uuid({ message: 'شناسه نامعتبر است.' });

/**
 * Rejects angle brackets and control characters so stored names can never
 * smuggle markup into receipts, SMS bodies or the admin UI.
 */
const SAFE_TEXT = /^[^<>\u0000-\u001F]*$/;

/**
 * Money is always a non-negative integer in the branch currency unit (Toman by
 * default). Persian digits typed into a form are converted before validation.
 */
export const moneySchema = z.preprocess(
  (v) =>
    typeof v === 'string'
      ? Number(toLatinDigits(v).replace(/[^\d-]/g, ''))
      : v,
  z
    .number({ invalid_type_error: 'مبلغ باید عدد باشد.' })
    .int('مبلغ باید عدد صحیح باشد.')
    .min(0, 'مبلغ نمی‌تواند منفی باشد.')
    .max(2_000_000_000, 'مبلغ وارد شده بیش از حد مجاز است.'),
);

export const positiveIntSchema = z.preprocess(
  (v) => (typeof v === 'string' ? Number(toLatinDigits(v)) : v),
  z.number().int('باید عدد صحیح باشد.').min(1, 'حداقل مقدار ۱ است.'),
);

export const nonNegativeIntSchema = z.preprocess(
  (v) => (typeof v === 'string' ? Number(toLatinDigits(v)) : v),
  z.number().int('باید عدد صحیح باشد.').min(0, 'نمی‌تواند منفی باشد.'),
);

/** Iranian mobile number; stored normalised as `09xxxxxxxxx`. */
export const iranianMobileSchema = z
  .string()
  .transform((v) => normalizeIranianMobile(v))
  .refine((v): v is string => v !== null, {
    message: 'شماره موبایل معتبر نیست. نمونه: ۰۹۱۲۱۲۳۴۵۶۷',
  });

/**
 * Same, but an empty value is allowed and normalises to `null`. An invalid
 * non-empty number is a hard validation error rather than being dropped.
 */
export const optionalIranianMobileSchema = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v, ctx) => {
    if (v == null || v.trim() === '') return null;
    const normalized = normalizeIranianMobile(v);
    if (!normalized) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'شماره موبایل معتبر نیست. نمونه: ۰۹۱۲۱۲۳۴۵۶۷',
      });
      return z.NEVER;
    }
    return normalized;
  });

/** Persian or Latin display text with a required length range. */
export const displayTextSchema = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .min(min, `${label} حداقل ${min} کاراکتر است.`)
    .max(max, `${label} حداکثر ${max} کاراکتر است.`)
    .regex(SAFE_TEXT, `${label} شامل کاراکتر غیرمجاز است.`);

/** Optional free text that normalises empty strings to `null`. */
export const optionalText = (max: number, label: string) =>
  z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => {
      if (v == null) return null;
      const trimmed = v.trim();
      return trimmed === '' ? null : trimmed;
    })
    .refine((v) => v === null || v.length <= max, {
      message: `${label} حداکثر ${max} کاراکتر است.`,
    })
    .refine((v) => v === null || SAFE_TEXT.test(v), {
      message: `${label} شامل کاراکتر غیرمجاز است.`,
    });

/** URL-safe slug: lowercase latin letters, digits and single hyphens. */
export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, 'نشانی حداقل ۲ کاراکتر است.')
  .max(64, 'نشانی حداکثر ۶۴ کاراکتر است.')
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'نشانی فقط می‌تواند شامل حروف انگلیسی، عدد و خط تیره باشد.',
  );

export const hexColorSchema = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'کد رنگ معتبر نیست.');

export const isoDateSchema = z
  .string()
  .datetime({ offset: true, message: 'تاریخ معتبر نیست.' });

/** Accepts `2026-08-25` or a full ISO timestamp; used by report filters. */
export const dateInputSchema = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: 'تاریخ معتبر نیست.' });

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationInput = z.infer<typeof paginationSchema>;
