import { z } from 'zod';
import { optionalText, uuidSchema } from './primitives';

export const posTerminalSchema = z.object({
  branchId: uuidSchema.optional(),
  name: z.string().trim().min(1).max(120),
  provider: z.string().trim().min(1).max(40).default('LOCAL_BRIDGE'),
  terminalKey: optionalText(120, 'شناسه ترمینال'),
  bridgeUrl: z.string().url('آدرس Bridge معتبر نیست.').max(300).nullable().optional(),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
  metadata: z.record(z.unknown()).nullable().optional(),
});
export type PosTerminalInput = z.infer<typeof posTerminalSchema>;
export const updatePosTerminalSchema = posTerminalSchema.partial();

export const terminalPaymentIntentSchema = z.object({
  terminalId: uuidSchema,
  amount: z.coerce.number().int().positive().max(1_000_000_000).optional(),
});
