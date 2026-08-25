import { z } from 'zod';
import { dateInputSchema, uuidSchema } from './primitives';

export const reportPresetSchema = z.enum([
  'today',
  'yesterday',
  'week',
  'month',
  'custom',
]);

export const reportQuerySchema = z
  .object({
    preset: reportPresetSchema.default('today'),
    from: dateInputSchema.optional(),
    to: dateInputSchema.optional(),
    branchId: uuidSchema.optional(),
    /** Bucket size for the returned time series. */
    granularity: z.enum(['hour', 'day', 'week', 'month']).default('hour'),
  })
  .superRefine((q, ctx) => {
    if (q.preset === 'custom' && (!q.from || !q.to)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['from'],
        message: 'برای بازه دلخواه، تاریخ شروع و پایان الزامی است.',
      });
    }
    if (q.from && q.to && new Date(q.from) > new Date(q.to)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['to'],
        message: 'تاریخ پایان باید بعد از تاریخ شروع باشد.',
      });
    }
  });
export type ReportQueryInput = z.infer<typeof reportQuerySchema>;

export const dashboardQuerySchema = z.object({
  branchId: uuidSchema.optional(),
});

export const markNotificationsReadSchema = z.object({
  ids: z.array(uuidSchema).min(1).max(200).optional(),
  /** When true, marks every unread notification for the caller as read. */
  all: z.boolean().optional(),
});
