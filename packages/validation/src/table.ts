import { z } from 'zod';
import {
  displayTextSchema,
  nonNegativeIntSchema,
  optionalText,
  positiveIntSchema,
} from './primitives';

export const createTableSchema = z.object({
  number: positiveIntSchema,
  name: optionalText(60, 'نام میز'),
  capacity: z.coerce.number().int().min(1, 'ظرفیت حداقل ۱ نفر است.').max(50).default(4),
  zone: optionalText(60, 'محدوده'),
});
export type CreateTableInput = z.infer<typeof createTableSchema>;

export const updateTableSchema = z.object({
  number: positiveIntSchema.optional(),
  name: optionalText(60, 'نام میز'),
  capacity: z.coerce.number().int().min(1).max(50).optional(),
  zone: optionalText(60, 'محدوده'),
  status: z
    .enum(['AVAILABLE', 'OCCUPIED', 'WAITING_PAYMENT', 'RESERVED', 'DISABLED'])
    .optional(),
});
export type UpdateTableInput = z.infer<typeof updateTableSchema>;

/** Bulk-create a floor plan, e.g. tables 1..36 in one call. */
export const bulkCreateTablesSchema = z
  .object({
    from: positiveIntSchema,
    to: positiveIntSchema,
    capacity: z.coerce.number().int().min(1).max(50).default(4),
    zone: optionalText(60, 'محدوده'),
  })
  .refine((v) => v.to >= v.from, {
    path: ['to'],
    message: 'شماره پایان باید بزرگ‌تر یا مساوی شماره شروع باشد.',
  })
  .refine((v) => v.to - v.from < 200, {
    path: ['to'],
    message: 'حداکثر ۲۰۰ میز در هر عملیات قابل ایجاد است.',
  });

export const createQrCodeSchema = z.object({
  type: z.enum(['RESTAURANT', 'BRANCH', 'TABLE']),
  label: displayTextSchema(1, 80, 'برچسب'),
  tableId: z.string().uuid().nullable().optional(),
  displayOrder: nonNegativeIntSchema.optional(),
});
