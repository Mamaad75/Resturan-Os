import { z } from 'zod';
import { optionalText, uuidSchema } from './primitives';

/** Provider-agnostic credentials bag (merchant id, api key, extra fields). */
const credentialsSchema = z.record(z.string().max(500)).optional();

export const updatePlatformPaymentConfigSchema = z
  .object({
    provider: z.string().trim().max(40),
    credentials: credentialsSchema,
    sandbox: z.boolean().optional(),
    enabled: z.boolean().optional(),
    commissionBps: z.coerce.number().int().min(0).max(5000),
    settleMinHours: z.coerce.number().int().min(0).max(168),
    settleMaxHours: z.coerce.number().int().min(1).max(168),
  })
  .superRefine((v, ctx) => {
    if (v.settleMaxHours < v.settleMinHours) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['settleMaxHours'],
        message: 'حداکثر زمان تسویه نمی‌تواند کمتر از حداقل باشد.',
      });
    }
    if (v.enabled && !v.provider) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['provider'],
        message: 'برای فعال‌کردن درگاه، ابتدا نوع درگاه را انتخاب کنید.',
      });
    }
  });
export type UpdatePlatformPaymentConfigInput = z.infer<
  typeof updatePlatformPaymentConfigSchema
>;

export const updatePlatformSmsConfigSchema = z.object({
  provider: z.enum(['console', 'kavenegar', 'sms_ir']),
  apiKey: optionalText(200, 'کلید API'),
  sender: optionalText(40, 'شمارهٔ فرستنده'),
  enabled: z.boolean().optional(),
});
export type UpdatePlatformSmsConfigInput = z.infer<
  typeof updatePlatformSmsConfigSchema
>;

export const updateTenantPaymentConfigSchema = z
  .object({
    mode: z.enum(['OFF', 'PLATFORM', 'OWN']),
    ownProvider: z.string().trim().max(40).nullable().optional(),
    ownCredentials: credentialsSchema,
    ownSandbox: z.boolean().optional(),
    // In-person methods the owner offers. Online is governed by `mode`.
    cashEnabled: z.boolean().optional(),
    cardOnSiteEnabled: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.mode === 'OWN' && !v.ownProvider) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ownProvider'],
        message: 'برای درگاه شخصی، نوع درگاه را مشخص کنید.',
      });
    }
  });
export type UpdateTenantPaymentConfigInput = z.infer<
  typeof updateTenantPaymentConfigSchema
>;

export const settlementQuerySchema = z.object({
  status: z.enum(['PENDING', 'SETTLED', 'CANCELLED']).optional(),
  tenantId: uuidSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
});
export type SettlementQueryInput = z.infer<typeof settlementQuerySchema>;

export const settleSettlementsSchema = z.object({
  ids: z.array(uuidSchema).min(1).max(500),
  settlementRef: optionalText(120, 'مرجع تسویه'),
  note: optionalText(300, 'یادداشت'),
});
export type SettleSettlementsInput = z.infer<typeof settleSettlementsSchema>;

export const phoneBankQuerySchema = z.object({
  search: optionalText(20, 'جستجو'),
  consentOnly: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
export type PhoneBankQueryInput = z.infer<typeof phoneBankQuerySchema>;
