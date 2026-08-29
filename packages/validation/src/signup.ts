import { z } from 'zod';
import { passwordSchema } from './auth';
import {
  displayTextSchema,
  iranianMobileSchema,
  slugSchema,
} from './primitives';

/**
 * Self-service restaurant signup.
 *
 * This is the only way a new tenant enters the platform, so it deliberately
 * asks for the minimum needed to produce a working restaurant: who you are,
 * what the place is called, and the public address its QR codes will point at.
 * Everything else is configured afterwards in settings.
 */
export const signupSchema = z
  .object({
    // --- the restaurant ---
    restaurantName: displayTextSchema(2, 120, 'نام رستوران'),
    /** Becomes /r/<slug>; permanent once QR codes are printed. */
    slug: slugSchema,

    // --- the owner ---
    ownerName: displayTextSchema(2, 120, 'نام و نام خانوادگی'),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email('ایمیل معتبر نیست.')
      .max(160, 'ایمیل بیش از حد طولانی است.'),
    phone: iranianMobileSchema,
    password: passwordSchema,
    confirmPassword: z.string(),

    /** Preselects the service modes so the first menu is immediately orderable. */
    businessType: z.enum(['cafe', 'restaurant', 'fastfood']).default('cafe'),

    acceptedTerms: z
      .boolean()
      .refine((v) => v === true, { message: 'پذیرش قوانین الزامی است.' }),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'تکرار رمز عبور مطابقت ندارد.',
  });
export type SignupInput = z.infer<typeof signupSchema>;

export const slugAvailabilitySchema = z.object({ slug: slugSchema });
