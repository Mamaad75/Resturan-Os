import { z } from 'zod';
import { moneySchema, optionalText, uuidSchema } from './primitives';

export const createPaymentSchema = z.object({
  method: z.enum(['ONLINE', 'CASH', 'CARD', 'OTHER'], {
    errorMap: () => ({ message: 'روش پرداخت معتبر نیست.' }),
  }),
  /** Omit to charge the full outstanding balance of the order. */
  amount: moneySchema.optional(),
  /** Terminal trace number, gateway reference, cheque number, ... */
  reference: optionalText(120, 'شماره پیگیری'),
  note: optionalText(300, 'یادداشت'),
});
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

export const refundPaymentSchema = z.object({
  paymentId: uuidSchema,
  amount: moneySchema.optional(),
  reason: optionalText(300, 'دلیل استرداد'),
});
export type RefundPaymentInput = z.infer<typeof refundPaymentSchema>;

/** Callback posted back by an online gateway after the customer returns. */
export const verifyPaymentSchema = z.object({
  provider: z.string().min(1).max(60),
  providerRef: z.string().min(1).max(200),
  payload: z.record(z.unknown()).optional(),
});
