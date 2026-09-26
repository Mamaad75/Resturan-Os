import { z } from 'zod';
import {
  displayTextSchema,
  moneySchema,
  optionalText,
  uuidSchema,
} from './primitives';
import { reportPresetSchema } from './report';

/* ------------------------------------------------------------------ */
/* Expense categories                                                  */
/* ------------------------------------------------------------------ */

export const expenseCategorySchema = z.object({
  name: displayTextSchema(2, 80, 'نام دسته'),
  icon: optionalText(40, 'آیکون'),
  displayOrder: z.coerce.number().int().min(0).max(999).optional(),
  isActive: z.boolean().optional(),
});
export type ExpenseCategoryInput = z.infer<typeof expenseCategorySchema>;

export const updateExpenseCategorySchema = expenseCategorySchema.partial();
export type UpdateExpenseCategoryInput = z.infer<typeof updateExpenseCategorySchema>;

/* ------------------------------------------------------------------ */
/* Expenses                                                            */
/* ------------------------------------------------------------------ */

const paymentMethodSchema = z.enum([
  'CASH',
  'CARD',
  'TRANSFER',
  'CHEQUE',
  'OTHER',
]);

const recurrenceSchema = z.enum([
  'ONCE',
  'WEEKLY',
  'MONTHLY',
  'QUARTERLY',
  'YEARLY',
]);

export const createExpenseSchema = z.object({
  categoryId: uuidSchema,
  branchId: uuidSchema.nullable().optional(),
  supplierId: uuidSchema.nullable().optional(),
  title: displayTextSchema(2, 160, 'عنوان'),
  amount: moneySchema.refine((value) => value > 0, {
    message: 'مبلغ باید بیشتر از صفر باشد.',
  }),
  /** The day the money left. Defaults to now when absent. */
  spentAt: z
    .union([z.string().datetime({ offset: true }), z.string().date()])
    .optional(),
  method: paymentMethodSchema.default('CASH'),
  reference: optionalText(80, 'شماره پیگیری'),
  note: optionalText(500, 'توضیح'),
  attachmentUrl: optionalText(500, 'تصویر رسید'),
  recurrence: recurrenceSchema.default('ONCE'),
});
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

export const updateExpenseSchema = createExpenseSchema.partial();
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;

export const expenseQuerySchema = z.object({
  preset: reportPresetSchema.default('month'),
  from: z.string().optional(),
  to: z.string().optional(),
  categoryId: uuidSchema.optional(),
  branchId: uuidSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type ExpenseQueryInput = z.infer<typeof expenseQuerySchema>;

/* ------------------------------------------------------------------ */
/* Quick purchase                                                      */
/* ------------------------------------------------------------------ */

/**
 * A purchase recorded and stocked in one step.
 *
 * The full purchase-order flow (draft, order, receive) is right for a supplier
 * relationship, and wrong for an owner who just came back from the market with
 * a receipt. This records the money and raises the stock together.
 */
export const quickPurchaseSchema = z.object({
  supplierId: uuidSchema.nullable().optional(),
  /** Free text when the shop is not a saved supplier. */
  supplierName: optionalText(140, 'نام فروشنده'),
  warehouseId: uuidSchema.optional(),
  branchId: uuidSchema.optional(),
  invoiceNumber: optionalText(40, 'شماره فاکتور'),
  purchasedAt: z
    .union([z.string().datetime({ offset: true }), z.string().date()])
    .optional(),
  note: optionalText(500, 'توضیح'),
  attachmentUrl: optionalText(500, 'تصویر فاکتور'),
  lines: z
    .array(
      z.object({
        /** An existing item, or a name to create one from. */
        itemId: uuidSchema.optional(),
        name: optionalText(140, 'نام کالا'),
        unit: optionalText(24, 'واحد'),
        quantity: z.coerce
          .number()
          .positive('مقدار باید بیشتر از صفر باشد.')
          .max(1_000_000),
        /** Price for one unit, in Toman. */
        unitCost: moneySchema,
      }),
    )
    .min(1, 'حداقل یک ردیف لازم است.')
    .max(100, 'تعداد ردیف‌ها بیش از حد مجاز است.'),
});
export type QuickPurchaseInput = z.infer<typeof quickPurchaseSchema>;

export const accountingSummaryQuerySchema = z.object({
  preset: reportPresetSchema.default('month'),
  from: z.string().optional(),
  to: z.string().optional(),
  branchId: uuidSchema.optional(),
});
export type AccountingSummaryQueryInput = z.infer<
  typeof accountingSummaryQuerySchema
>;
