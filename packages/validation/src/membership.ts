import { z } from 'zod';
import { iranianMobileSchema, optionalText, uuidSchema } from './primitives';

export const membershipPlanSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: optionalText(500, 'توضیحات'),
  price: z.coerce.number().int().min(0).max(1_000_000_000),
  durationDays: z.coerce.number().int().min(1).max(3650).default(30),
  discountBps: z.coerce.number().int().min(0).max(10000).default(0),
  loyaltyMultiplierBps: z.coerce.number().int().min(10000).max(100000).default(10000),
  freeDelivery: z.boolean().default(false),
  monthlyFreeDrinks: z.coerce.number().int().min(0).max(100).default(0),
  isActive: z.boolean().default(true),
});
export type MembershipPlanInput = z.infer<typeof membershipPlanSchema>;
export const updateMembershipPlanSchema = membershipPlanSchema.partial();

export const grantMembershipSchema = z.object({
  planId: uuidSchema,
  phone: iranianMobileSchema,
  name: optionalText(120, 'نام مشتری'),
  gifted: z.boolean().default(false),
  amount: z.coerce.number().int().min(0).max(1_000_000_000).optional(),
  paymentMethod: z.enum(['CASH', 'CARD', 'ONLINE', 'OTHER']).default('OTHER'),
  reference: optionalText(120, 'شماره پیگیری'),
  startsAt: z.string().datetime().optional(),
});
export type GrantMembershipInput = z.infer<typeof grantMembershipSchema>;

export const cancelMembershipSchema = z.object({
  reason: optionalText(300, 'دلیل لغو'),
});
