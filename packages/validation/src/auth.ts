import { z } from 'zod';
import {
  displayTextSchema,
  optionalIranianMobileSchema,
  slugSchema,
  uuidSchema,
} from './primitives';

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('ایمیل معتبر نیست.')
    .max(160, 'ایمیل بیش از حد طولانی است.'),
  password: z
    .string()
    .min(1, 'رمز عبور را وارد کنید.')
    .max(200, 'رمز عبور بیش از حد طولانی است.'),
  /** Optional: pin the session to a specific branch at login time. */
  branchId: uuidSchema.optional(),
  /**
   * Email is unique per tenant, not globally, so the same person can work at
   * two restaurants on the platform. This disambiguates when it happens; it can
   * be omitted whenever the email matches exactly one account.
   */
  tenantSlug: slugSchema.optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Passwords must survive a real dictionary attack: 10+ chars with at least one
 * letter and one digit. Persian keyboards make symbol requirements hostile, so
 * length is weighted more heavily than character-class variety.
 */
export const passwordSchema = z
  .string()
  .min(10, 'رمز عبور حداقل ۱۰ کاراکتر باشد.')
  .max(200, 'رمز عبور حداکثر ۲۰۰ کاراکتر است.')
  .regex(/[A-Za-z]/, 'رمز عبور باید شامل حداقل یک حرف باشد.')
  .regex(/[0-9]/, 'رمز عبور باید شامل حداقل یک عدد باشد.');

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'رمز عبور فعلی را وارد کنید.'),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'تکرار رمز عبور مطابقت ندارد.',
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    path: ['newPassword'],
    message: 'رمز عبور جدید باید با رمز فعلی متفاوت باشد.',
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const createStaffSchema = z.object({
  email: z.string().trim().toLowerCase().email('ایمیل معتبر نیست.').max(160),
  fullName: displayTextSchema(2, 120, 'نام'),
  phone: optionalIranianMobileSchema,
  password: passwordSchema,
  role: z.enum(['OWNER', 'MANAGER', 'CASHIER', 'KITCHEN', 'WAITER', 'ACCOUNTANT'], {
    errorMap: () => ({ message: 'نقش انتخاب‌شده معتبر نیست.' }),
  }),
  branchId: uuidSchema.nullable().optional(),
});
export type CreateStaffInput = z.infer<typeof createStaffSchema>;

export const updateStaffSchema = createStaffSchema
  .partial()
  .omit({ password: true })
  .extend({ isActive: z.boolean().optional() });
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;

export const resetStaffPasswordSchema = z.object({
  newPassword: passwordSchema,
});
