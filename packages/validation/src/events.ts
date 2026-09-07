import { z } from 'zod';
import {
  displayTextSchema,
  hexColorSchema,
  iranianMobileSchema,
  optionalText,
  slugSchema,
  uuidSchema,
} from './primitives';

/** A URL our own upload endpoint produced (absolute) or an existing asset. */
const imageUrlSchema = z.string().trim().max(500).url('آدرس تصویر معتبر نیست.');

/** Accepts `2026-09-20` or a full ISO timestamp. */
const eventDateSchema = z
  .string()
  .trim()
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: 'تاریخ معتبر نیست.' });

export const createEventSchema = z
  .object({
    title: displayTextSchema(2, 160, 'عنوان رویداد'),
    slug: slugSchema,
    description: optionalText(2000, 'توضیحات رویداد'),
    coverUrl: imageUrlSchema.nullable().optional(),
    branchId: uuidSchema.nullable().optional(),
    startsAt: eventDateSchema,
    endsAt: eventDateSchema.nullable().optional(),
    // Optional per-event look; null inherits the restaurant's look.
    accentColor: hexColorSchema.nullable().optional(),
    theme: z.enum(['dark', 'light']).nullable().optional(),
    menuTemplate: z.string().trim().max(24).nullable().optional(),
    menuId: uuidSchema.nullable().optional(),
    capacity: z.coerce.number().int().min(1).max(100_000).nullable().optional(),
    rsvpEnabled: z.boolean().optional(),
    isActive: z.boolean().optional(),
    displayOrder: z.coerce.number().int().min(0).max(10_000).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.endsAt && Date.parse(v.endsAt) < Date.parse(v.startsAt)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endsAt'],
        message: 'پایان رویداد نمی‌تواند قبل از شروع آن باشد.',
      });
    }
  });
export type CreateEventInput = z.infer<typeof createEventSchema>;

// Same fields, all optional, for a PATCH. Rebuilt (not .partial() on the
// refined schema, which Zod does not allow) and refined again.
export const updateEventSchema = z
  .object({
    title: displayTextSchema(2, 160, 'عنوان رویداد').optional(),
    slug: slugSchema.optional(),
    description: optionalText(2000, 'توضیحات رویداد'),
    coverUrl: imageUrlSchema.nullable().optional(),
    branchId: uuidSchema.nullable().optional(),
    startsAt: eventDateSchema.optional(),
    endsAt: eventDateSchema.nullable().optional(),
    accentColor: hexColorSchema.nullable().optional(),
    theme: z.enum(['dark', 'light']).nullable().optional(),
    menuTemplate: z.string().trim().max(24).nullable().optional(),
    menuId: uuidSchema.nullable().optional(),
    capacity: z.coerce.number().int().min(1).max(100_000).nullable().optional(),
    rsvpEnabled: z.boolean().optional(),
    isActive: z.boolean().optional(),
    displayOrder: z.coerce.number().int().min(0).max(10_000).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.startsAt && v.endsAt && Date.parse(v.endsAt) < Date.parse(v.startsAt)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endsAt'],
        message: 'پایان رویداد نمی‌تواند قبل از شروع آن باشد.',
      });
    }
  });
export type UpdateEventInput = z.infer<typeof updateEventSchema>;

/** A guest reserving a spot at an event (public). */
export const eventRsvpSchema = z.object({
  name: displayTextSchema(2, 120, 'نام'),
  phone: iranianMobileSchema,
  guests: z.coerce.number().int().min(1).max(20).default(1),
  note: optionalText(300, 'توضیح'),
});
export type EventRsvpInput = z.infer<typeof eventRsvpSchema>;
