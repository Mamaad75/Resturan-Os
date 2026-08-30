import { z } from 'zod';
import { MENU_TEMPLATES } from '@restaurant-os/types';
import {
  displayTextSchema,
  hexColorSchema,
  nonNegativeIntSchema,
  optionalText,
  slugSchema,
} from './primitives';

export const updateRestaurantSchema = z.object({
  name: displayTextSchema(2, 120, 'نام رستوران').optional(),
  slug: slugSchema.optional(),
  description: optionalText(1000, 'توضیحات'),
});
export type UpdateRestaurantInput = z.infer<typeof updateRestaurantSchema>;

export const updateBrandingSchema = z.object({
  logoUrl: optionalText(500, 'لوگو'),
  coverUrl: optionalText(500, 'تصویر کاور'),
  primaryColor: hexColorSchema.optional(),
  accentColor: hexColorSchema.optional(),
  theme: z.enum(['dark', 'light']).optional(),
  tagline: optionalText(160, 'شعار'),
  menuTemplate: z
    .enum(MENU_TEMPLATES as [string, ...string[]], {
      errorMap: () => ({ message: 'قالب منو معتبر نیست.' }),
    })
    .optional(),
});
export type UpdateBrandingInput = z.infer<typeof updateBrandingSchema>;

export const updateSettingsSchema = z
  .object({
    serviceModes: z
      .array(z.enum(['DINE_IN', 'TAKEAWAY', 'DELIVERY']))
      .min(1, 'حداقل یک حالت سرویس باید فعال باشد.')
      .optional(),
    currency: z.enum(['IRT', 'IRR']).optional(),
    taxEnabled: z.boolean().optional(),
    /** Basis points: 900 = 9.00%. */
    taxRateBps: z.coerce.number().int().min(0).max(10_000).optional(),
    serviceChargeEnabled: z.boolean().optional(),
    serviceChargeBps: z.coerce.number().int().min(0).max(10_000).optional(),
    estimatedPrepMinutes: nonNegativeIntSchema.optional(),
    smsNotificationsEnabled: z.boolean().optional(),
    autoConfirmOrders: z.boolean().optional(),
  })
  .strict();
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

export const updateBranchSchema = z.object({
  name: displayTextSchema(2, 120, 'نام شعبه').optional(),
  slug: slugSchema.optional(),
  address: optionalText(300, 'آدرس'),
  phone: optionalText(30, 'تلفن'),
  isOpen: z.boolean().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;
