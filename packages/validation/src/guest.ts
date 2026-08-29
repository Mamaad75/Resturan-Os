import { z } from 'zod';
import { optionalText, uuidSchema } from './primitives';

/** A guest tapping the call button from their table. */
export const createWaiterCallSchema = z.object({
  tableId: uuidSchema,
  reason: z.enum(['ASSISTANCE', 'BILL', 'SUPPLIES']).default('ASSISTANCE'),
  note: optionalText(200, 'توضیح'),
});
export type CreateWaiterCallInput = z.infer<typeof createWaiterCallSchema>;

export const resolveWaiterCallSchema = z.object({
  status: z.enum(['ACKNOWLEDGED', 'RESOLVED']),
});

/** Post-order rating, submitted from the tracking page. */
export const createFeedbackSchema = z.object({
  rating: z.coerce
    .number()
    .int('امتیاز باید عدد صحیح باشد.')
    .min(1, 'امتیاز باید بین ۱ تا ۵ باشد.')
    .max(5, 'امتیاز باید بین ۱ تا ۵ باشد.'),
  comment: optionalText(500, 'نظر'),
});
export type CreateFeedbackInput = z.infer<typeof createFeedbackSchema>;
