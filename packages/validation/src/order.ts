import { z } from 'zod';
import { OrderStatus } from '@restaurant-os/types';
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
    type: z.enum(['DINE_IN', 'TAKEAWAY', 'DELIVERY'], {
      errorMap: () => ({ message: 'نوع سفارش معتبر نیست.' }),
    }),
    tableId: uuidSchema.nullable().optional(),
    /** Delivery only. The zone decides the fee, which the server applies. */
    deliveryZoneId: uuidSchema.nullable().optional(),
    deliveryAddress: optionalText(400, 'نشانی'),
    deliveryNotes: optionalText(300, 'توضیح نشانی'),

    customerName: optionalText(120, 'نام'),
    customerPhone: optionalIranianMobileSchema,
    notes: optionalText(500, 'توضیحات سفارش'),
    pickupAt: dateInputSchema.nullable().optional(),
    /** Discount code; the server re-evaluates it and ignores any client total. */
    couponCode: optionalText(32, 'کد تخفیف'),
    /**
     * A checkout offer the guest accepted in the popup. Carries the offer, not
     * the price: the server re-reads the offer and decides what it is worth.
     */
    offerId: uuidSchema.nullable().optional(),
    /** A friend's invitation code, credited after the order is written. */
    referralCode: optionalText(16, 'کد معرفی'),
    /** A referral reward the guest is spending. The server prices it. */
    referralRewardId: uuidSchema.nullable().optional(),
    /**
     * Points to spend on this order. The server decides what they are worth;
     * a request never states the discount.
     */
    redeemPoints: z.coerce.number().int().min(0).max(1_000_000).optional(),

    /**
     * Opt-in to marketing messages, offered at checkout when the restaurant
     * has enabled it. Absent means "not asked"; false means "declined", and
     * neither ever turns an existing consent off by accident.
     */
    marketingConsent: z.boolean().optional(),
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
    if (order.type === 'DELIVERY') {
      // Everything a courier needs to arrive, and everything the restaurant
      // needs to price the trip.
      if (!order.customerName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['customerName'],
          message: 'برای ارسال با پیک، نام الزامی است.',
        });
      }
      if (!order.customerPhone) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['customerPhone'],
          message: 'برای ارسال با پیک، شماره موبایل الزامی است.',
        });
      }
      if (!order.deliveryAddress) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['deliveryAddress'],
          message: 'نشانی تحویل را وارد کنید.',
        });
      }
      if (!order.deliveryZoneId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['deliveryZoneId'],
          message: 'منطقه ارسال را انتخاب کنید.',
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
    type: z.enum(['DINE_IN', 'TAKEAWAY', 'DELIVERY']),
    tableId: uuidSchema.nullable().optional(),
    /** Delivery only. The zone decides the fee, which the server applies. */
    deliveryZoneId: uuidSchema.nullable().optional(),
    deliveryAddress: optionalText(400, 'نشانی'),
    deliveryNotes: optionalText(300, 'توضیح نشانی'),

    customerName: optionalText(120, 'نام'),
    customerPhone: optionalIranianMobileSchema,
    notes: optionalText(500, 'توضیحات سفارش'),
    pickupAt: dateInputSchema.nullable().optional(),
    discountAmount: moneySchema.default(0),
    /** Discount code applied at the counter, on top of any manual discount. */
    couponCode: optionalText(32, 'کد تخفیف'),
    /**
     * Points to spend on this order. The server decides what they are worth;
     * a request never states the discount.
     */
    redeemPoints: z.coerce.number().int().min(0).max(1_000_000).optional(),

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
    if (order.type === 'DELIVERY') {
      // Everything a courier needs to arrive, and everything the restaurant
      // needs to price the trip.
      if (!order.customerName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['customerName'],
          message: 'برای ارسال با پیک، نام الزامی است.',
        });
      }
      if (!order.customerPhone) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['customerPhone'],
          message: 'برای ارسال با پیک، شماره موبایل الزامی است.',
        });
      }
      if (!order.deliveryAddress) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['deliveryAddress'],
          message: 'نشانی تحویل را وارد کنید.',
        });
      }
      if (!order.deliveryZoneId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['deliveryZoneId'],
          message: 'منطقه ارسال را انتخاب کنید.',
        });
      }
    }
  });
export type CreateStaffOrderInput = z.infer<typeof createStaffOrderSchema>;

/** Append items to an order that is already open on a table. */
export const addOrderItemsSchema = z.object({
  items: z.array(cartItemSchema).min(1, 'حداقل یک آیتم لازم است.').max(60),
});
export type AddOrderItemsInput = z.infer<typeof addOrderItemsSchema>;

/*
 * Derived from the shared enum rather than retyped.
 *
 * A hand-written copy drifts: adding OUT_FOR_DELIVERY to the domain left this
 * list behind, and the API rejected a legal transition before the state
 * machine ever saw it.
 */
const orderStatusEnum = z.nativeEnum(OrderStatus, {
  errorMap: () => ({ message: 'وضعیت سفارش معتبر نیست.' }),
});

export const updateOrderStatusSchema = z.object({
  status: orderStatusEnum,
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
