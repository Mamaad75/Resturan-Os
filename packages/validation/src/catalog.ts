import { z } from 'zod';
import {
  displayTextSchema,
  moneySchema,
  nonNegativeIntSchema,
  optionalText,
  uuidSchema,
} from './primitives';

export const createCategorySchema = z.object({
  name: displayTextSchema(1, 80, 'نام دسته'),
  nameFa: displayTextSchema(1, 80, 'نام فارسی دسته'),
  description: optionalText(500, 'توضیحات'),
  imageUrl: optionalText(500, 'تصویر'),
  displayOrder: nonNegativeIntSchema.optional(),
  isActive: z.boolean().optional(),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = createCategorySchema.partial();
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const modifierOptionSchema = z.object({
  id: uuidSchema.optional(),
  name: displayTextSchema(1, 80, 'نام گزینه'),
  nameFa: displayTextSchema(1, 80, 'نام فارسی گزینه'),
  priceDelta: moneySchema,
  isAvailable: z.boolean().default(true),
  displayOrder: nonNegativeIntSchema.default(0),
});

export const modifierGroupSchema = z
  .object({
    id: uuidSchema.optional(),
    name: displayTextSchema(1, 80, 'نام گروه'),
    nameFa: displayTextSchema(1, 80, 'نام فارسی گروه'),
    type: z.enum(['SINGLE', 'MULTIPLE']),
    isRequired: z.boolean().default(false),
    minSelect: nonNegativeIntSchema.default(0),
    maxSelect: nonNegativeIntSchema.default(1),
    displayOrder: nonNegativeIntSchema.default(0),
    options: z.array(modifierOptionSchema).min(1, 'حداقل یک گزینه لازم است.').max(30),
  })
  .superRefine((group, ctx) => {
    if (group.maxSelect < group.minSelect) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['maxSelect'],
        message: 'حداکثر انتخاب نمی‌تواند کمتر از حداقل انتخاب باشد.',
      });
    }
    if (group.type === 'SINGLE' && group.maxSelect > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['maxSelect'],
        message: 'در گروه تک‌انتخابی حداکثر انتخاب باید ۱ باشد.',
      });
    }
    if (group.isRequired && group.minSelect < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['minSelect'],
        message: 'گروه اجباری باید حداقل یک انتخاب داشته باشد.',
      });
    }
    if (group.maxSelect > group.options.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['maxSelect'],
        message: 'حداکثر انتخاب از تعداد گزینه‌ها بیشتر است.',
      });
    }
  });

export const createProductSchema = z
  .object({
    categoryId: uuidSchema,
    name: displayTextSchema(1, 120, 'نام محصول'),
    nameFa: displayTextSchema(1, 120, 'نام فارسی محصول'),
    description: optionalText(1000, 'توضیحات'),
    descriptionFa: optionalText(1000, 'توضیحات فارسی'),
    imageUrl: optionalText(500, 'تصویر'),
    price: moneySchema,
    discountPrice: z.union([moneySchema, z.null()]).optional(),
    isAvailable: z.boolean().default(true),
    isFeatured: z.boolean().default(false),
    displayOrder: nonNegativeIntSchema.default(0),
    preparationMinutes: z.union([nonNegativeIntSchema, z.null()]).optional(),
    calories: z.union([nonNegativeIntSchema, z.null()]).optional(),
    modifierGroups: z.array(modifierGroupSchema).max(10).optional(),
  })
  .superRefine((product, ctx) => {
    if (
      product.discountPrice != null &&
      product.discountPrice >= product.price
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['discountPrice'],
        message: 'قیمت با تخفیف باید کمتر از قیمت اصلی باشد.',
      });
    }
  });
export type CreateProductInput = z.infer<typeof createProductSchema>;

/**
 * `partial()` cannot be called on the refined schema above, so the update
 * shape is declared from the same field set and re-refined.
 */
export const updateProductSchema = z
  .object({
    categoryId: uuidSchema.optional(),
    name: displayTextSchema(1, 120, 'نام محصول').optional(),
    nameFa: displayTextSchema(1, 120, 'نام فارسی محصول').optional(),
    description: optionalText(1000, 'توضیحات'),
    descriptionFa: optionalText(1000, 'توضیحات فارسی'),
    imageUrl: optionalText(500, 'تصویر'),
    price: moneySchema.optional(),
    discountPrice: z.union([moneySchema, z.null()]).optional(),
    isAvailable: z.boolean().optional(),
    isFeatured: z.boolean().optional(),
    displayOrder: nonNegativeIntSchema.optional(),
    preparationMinutes: z.union([nonNegativeIntSchema, z.null()]).optional(),
    calories: z.union([nonNegativeIntSchema, z.null()]).optional(),
    modifierGroups: z.array(modifierGroupSchema).max(10).optional(),
  })
  .superRefine((product, ctx) => {
    if (
      product.price != null &&
      product.discountPrice != null &&
      product.discountPrice >= product.price
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['discountPrice'],
        message: 'قیمت با تخفیف باید کمتر از قیمت اصلی باشد.',
      });
    }
  });
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const reorderSchema = z.object({
  items: z
    .array(z.object({ id: uuidSchema, displayOrder: nonNegativeIntSchema }))
    .min(1),
});

export const toggleAvailabilitySchema = z.object({
  isAvailable: z.boolean(),
});

/* ------------------------------------------------------------------ */
/* Checkout offers                                                     */
/* ------------------------------------------------------------------ */

export const checkoutOfferSchema = z.object({
  productId: uuidSchema,
  title: optionalText(120, 'عنوان'),
  /** Percentage off, entered as a percentage and stored as basis points. */
  discountBps: z.coerce
    .number()
    .int('درصد تخفیف باید عدد صحیح باشد.')
    .min(100, 'حداقل ۱٪ تخفیف.')
    .max(9_000, 'حداکثر ۹۰٪ تخفیف.'),
  startsAt: z
    .union([z.string().datetime({ offset: true }), z.string().date()])
    .optional(),
  /** How many days it runs. An owner thinks in days, not end dates. */
  days: z.coerce
    .number()
    .int('تعداد روز باید عدد صحیح باشد.')
    .min(1, 'حداقل یک روز.')
    .max(365, 'حداکثر یک سال.'),
  isActive: z.boolean().optional(),
});
export type CheckoutOfferInput = z.infer<typeof checkoutOfferSchema>;

export const updateCheckoutOfferSchema = checkoutOfferSchema.partial().omit({
  productId: true,
});
export type UpdateCheckoutOfferInput = z.infer<typeof updateCheckoutOfferSchema>;

/* ------------------------------------------------------------------ */
/* Referral programme                                                  */
/* ------------------------------------------------------------------ */

const referralRewardTypeSchema = z.enum(['PERCENTAGE', 'FIXED', 'FREE_PRODUCT'], {
  errorMap: () => ({ message: 'نوع پاداش معتبر نیست.' }),
});

/**
 * The terms of "invite a friend".
 *
 * A reward's shape decides which of its fields matter, so the cross-field
 * checks live here rather than in the service: a percentage needs a percentage,
 * a free drink needs a drink, and an owner who leaves the wrong one blank is
 * told which field to fill in.
 */
export const referralProgramSchema = z
  .object({
    isActive: z.boolean(),

    rewardType: referralRewardTypeSchema,
    /** Basis points for PERCENTAGE, an amount for FIXED. */
    rewardValue: z.coerce.number().int().min(0).max(100_000_000).optional(),
    rewardProductId: uuidSchema.nullable().optional(),
    /** Friends who must order before the inviter is paid. */
    invitesRequired: z.coerce
      .number()
      .int('تعداد دعوت باید عدد صحیح باشد.')
      .min(1, 'حداقل یک دعوت.')
      .max(50, 'حداکثر ۵۰ دعوت.'),

    /** Null means the invitation is worth nothing to the friend. */
    friendRewardType: referralRewardTypeSchema.nullable().optional(),
    friendRewardValue: z.coerce.number().int().min(0).max(100_000_000).optional(),
    friendRewardProductId: uuidSchema.nullable().optional(),

    rewardValidDays: z.coerce
      .number()
      .int('مدت اعتبار باید عدد صحیح باشد.')
      .min(1, 'حداقل یک روز.')
      .max(365, 'حداکثر یک سال.'),

    termsFa: optionalText(300, 'شرایط'),
  })
  .superRefine((program, ctx) => {
    const check = (
      type: 'PERCENTAGE' | 'FIXED' | 'FREE_PRODUCT' | null | undefined,
      value: number | undefined,
      productId: string | null | undefined,
      valueKey: string,
      productKey: string,
    ) => {
      if (!type) return;
      if (type === 'FREE_PRODUCT') {
        if (!productId) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [productKey],
            message: 'برای پاداش «محصول رایگان» یک آیتم انتخاب کنید.',
          });
        }
        return;
      }
      if (!value || value <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [valueKey],
          message: 'مقدار پاداش باید بیشتر از صفر باشد.',
        });
        return;
      }
      if (type === 'PERCENTAGE' && value > 9_000) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [valueKey],
          message: 'حداکثر ۹۰٪ تخفیف.',
        });
      }
    };

    check(
      program.rewardType,
      program.rewardValue,
      program.rewardProductId,
      'rewardValue',
      'rewardProductId',
    );
    check(
      program.friendRewardType,
      program.friendRewardValue,
      program.friendRewardProductId,
      'friendRewardValue',
      'friendRewardProductId',
    );
  });
export type ReferralProgramInput = z.infer<typeof referralProgramSchema>;

/**
 * An invitation code as a friend types it.
 *
 * Deliberately lenient about case and spacing - it is read aloud across a
 * table - and strict about length, so it cannot be used to probe.
 */
export const referralCodeSchema = z
  .string()
  .trim()
  .min(4, 'کد معرفی معتبر نیست.')
  .max(16, 'کد معرفی معتبر نیست.')
  .transform((code) => code.toUpperCase());
