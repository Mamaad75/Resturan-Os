import { z } from 'zod';

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({
    p256dh: z.string().min(10).max(255),
    auth: z.string().min(4).max(255),
  }),
  userAgent: z.string().max(300).nullable().optional(),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;
