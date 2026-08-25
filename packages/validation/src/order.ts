import { z } from 'zod';
import {
  dateInputSchema,
  displayTextSchema,
  iranianMobileSchema,
  moneySchema,
  optionalIranianMobileSchema,
  optionalText,
  paginationSchema,
  uuidSchema,
} from './primitives';

export const cartItemSchema = z.object({
  productId: uuidSchema,
  quantity: z.coerce
    .number()
    .int('تعداد باید عدد صحیح باشد.')
    .min(1, 'حداقل تعداد ۱ است.')
    .max(99, 'حداکثر تعداد در هر ردیف ۹۹ است.'),
  notes: optionalText(200, 'توضیحات آیتم'),
  /** Chosen modifier options; prices are resolved server-side, never sent. */
  modifierOptionIds: z.array(uuidSchema).max(20).default([]),
});
export type CartItemInput = z.infer<typeof cartItemSchema>;

/**
 * Customer-submitted order. Deliberately carries no prices or totals - the
 * backend recomputes every amount from the current menu.
 */
export const createPublicOrderSchema = z
  .object({
    type: z.enum(['DINE_IN', 'TAKEAWAY'], {
      errorMap: () => ({ message: 'نوع سفارش معتبر نیست.' }),
    }),
    tableId: uuidSchema.nullable().optional(),
    customerName: optionalText(120, 'نام'),
    customerPhone: optionalIranianMobileSchema,
    notes: optionalText(500, 'توضیحات سفارش'),
    pickupAt: dateInputSchema.nullable().optional(),
    items: z
      .array(cartItemSchema)
      .min(1, 'سبد خرید خالی است.')
      .max(60, 'تعداد ردیف‌های سفارش بیش از حد مجاز است.'),
  })
  .superRefine((order, ctx) => {
    if (order.type === 'DINE_IN' && !order.tableId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['tableId'],
        message: 'برای سرو در محل، انتخاب میز الزامی است.',
      });
    }
    if (order.type === 'TAKEAWAY') {
      if (!order.customerName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['customerName'],
          message: 'برای سفارش بیرون‌بر، نام الزامی است.',
        });
      }
      if (!order.customerPhone) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['customerPhone'],
          message: 'برای سفارش بیرون‌بر، شماره موبایل الزامی است.',
        });
      }
    }
  });
export type CreatePublicOrderInput = z.infer<typeof createPublicOrderSchema>;

/**
 * Staff-created order (POS / waiter). Same rules, plus a manual discount that
 * only permitted roles may apply.
 */
export const createStaffOrderSchema = z
  .object({
    type: z.enum(['DINE_IN', 'TAKEAWAY']),
    tableId: uuidSchema.nullable().optional(),
    customerName: optionalText(120, 'نام'),
    customerPhone: optionalIranianMobileSchema,
    notes: optionalText(500, 'توضیحات سفارش'),
    pickupAt: dateInputSchema.nullable().optional(),
    discountAmount: moneySchema.default(0),
    items: z.array(cartItemSchema).min(1, 'سبد خرید خالی است.').max(60),
    /** Skip PENDING and go straight to the kitchen from the counter. */
    sendToKitchen: z.boolean().default(false),
  })
  .superRefine((order, ctx) => {
    if (order.type === 'DINE_IN' && !order.tableId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['tableId'],
        message: 'برای سرو در محل، انتخاب میز الزامی است.',
      });
    }
    if (order.type === 'TAKEAWAY' && !order.customerName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['customerName'],
        message: 'برای سفارش بیرون‌بر، نام الزامی است.',
      });
    }
  });
export type CreateStaffOrderInput = z.infer<typeof createStaffOrderSchema>;

/** Append items to an order that is already open on a table. */
export const addOrderItemsSchema = z.object({
  items: z.array(cartItemSchema).min(1, 'حداقل یک آیتم لازم است.').max(60),
});
export type AddOrderItemsInput = z.infer<typeof addOrderItemsSchema>;

export const updateOrderStatusSchema = z.object({
  status: z.enum([
    'PENDING',
    'CONFIRMED',
    'SENT_TO_KITCHEN',
    'PREPARING',
    'READY',
    'READY_FOR_PICKUP',
    'SERVED',
    'PICKED_UP',
    'COMPLETED',
    'CANCELLED',
  ]),
  note: optionalText(300, 'یادداشت'),
});
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;

export const updateOrderSchema = z.object({
  notes: optionalText(500, 'توضیحات سفارش'),
  customerName: optionalText(120, 'نام'),
  customerPhone: optionalIranianMobileSchema,
  discountAmount: moneySchema.optional(),
});
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;

export const orderQuerySchema = paginationSchema.extend({
  status: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) =>
      v == null ? undefined : Array.isArray(v) ? v : v.split(','),
    ),
  type: z.enum(['DINE_IN', 'TAKEAWAY', 'DELIVERY']).optional(),
  paymentStatus: z
    .enum(['PENDING', 'AUTHORIZED', 'PAID', 'FAILED', 'REFUNDED', 'CANCELLED'])
    .optional(),
  tableId: uuidSchema.optional(),
  search: optionalText(120, 'جستجو'),
  from: dateInputSchema.optional(),
  to: dateInputSchema.optional(),
  /** `true` restricts to statuses that are still live on the floor. */
  activeOnly: z.coerce.boolean().optional(),
});
export type OrderQueryInput = z.infer<typeof orderQuerySchema>;

/** Used by the customer app to look an order up by phone + order number. */
export const findOrderSchema = z.object({
  orderNumber: displayTextSchema(3, 40, 'شماره سفارش'),
  phone: iranianMobileSchema,
});
