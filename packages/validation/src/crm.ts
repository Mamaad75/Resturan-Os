import { z } from 'zod';
import { displayTextSchema, optionalText } from './primitives';

const SEGMENTS = [
  'ALL',
  'NEW',
  'RETURNING',
  'VIP',
  'HIGH_VALUE',
  'INACTIVE_30',
  'INACTIVE_60',
  'DINE_IN',
  'TAKEAWAY',
] as const;

export const customerSegmentSchema = z.enum(SEGMENTS, {
  errorMap: () => ({ message: 'دسته مشتری معتبر نیست.' }),
});

export const updateCustomerSchema = z
  .object({
    name: optionalText(120, 'نام مشتری'),
    notes: optionalText(2000, 'یادداشت'),
    tags: z.array(displayTextSchema(1, 30, 'برچسب')).max(12).optional(),
    marketingConsent: z.boolean().optional(),
  })
  .strict();
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

export const createCampaignSchema = z.object({
  name: displayTextSchema(2, 120, 'نام کمپین'),
  segment: customerSegmentSchema,
  /**
   * Marketing bodies are plain text. `{name}` is the only placeholder, so a
   * body cannot smuggle other customers' data into a message.
   */
  body: displayTextSchema(10, 480, 'متن پیام'),
});
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
