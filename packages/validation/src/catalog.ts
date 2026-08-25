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
