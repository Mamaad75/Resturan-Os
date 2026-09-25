import { z } from 'zod';
import { optionalText, uuidSchema } from './primitives';

const quantity = z.coerce.number().finite().min(0).max(1_000_000_000);
const positiveQuantity = z.coerce.number().finite().gt(0).max(1_000_000_000);

export const createInventoryItemSchema = z.object({
  sku: optionalText(64, 'SKU'),
  name: z.string().trim().min(1, 'نام کالا لازم است.').max(140),
  unit: z.string().trim().min(1).max(24).default('UNIT'),
  unitCost: z.coerce.number().int().min(0).max(1_000_000_000).default(0),
  lowStockThreshold: quantity.default(0),
  trackStock: z.boolean().default(true),
  initialQuantity: quantity.default(0),
  branchId: uuidSchema.optional(),
  warehouseId: uuidSchema.optional(),
});
export type CreateInventoryItemInput = z.infer<typeof createInventoryItemSchema>;

export const updateInventoryItemSchema = createInventoryItemSchema
  .omit({ initialQuantity: true, branchId: true, warehouseId: true })
  .partial()
  .extend({ isActive: z.boolean().optional() });
export type UpdateInventoryItemInput = z.infer<typeof updateInventoryItemSchema>;

export const createWarehouseSchema = z.object({
  branchId: uuidSchema.optional(),
  name: z.string().trim().min(1).max(120),
  isDefault: z.boolean().default(false),
});
export type CreateWarehouseInput = z.infer<typeof createWarehouseSchema>;

export const stockAdjustmentSchema = z.object({
  itemId: uuidSchema,
  warehouseId: uuidSchema.optional(),
  branchId: uuidSchema.optional(),
  quantityDelta: z.coerce.number().finite().min(-1_000_000_000).max(1_000_000_000).refine((v) => v !== 0, 'مقدار تغییر نمی‌تواند صفر باشد.'),
  unitCost: z.coerce.number().int().min(0).max(1_000_000_000).optional(),
  reason: z.enum(['ADJUSTMENT', 'WASTE', 'DAMAGE', 'COUNT_CORRECTION']).default('ADJUSTMENT'),
  note: optionalText(300, 'یادداشت'),
});
export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>;

export const stockTransferSchema = z.object({
  itemId: uuidSchema,
  fromWarehouseId: uuidSchema,
  toWarehouseId: uuidSchema,
  quantity: positiveQuantity,
  note: optionalText(300, 'یادداشت'),
});
export type StockTransferInput = z.infer<typeof stockTransferSchema>;

export const recipeSchema = z.object({
  items: z.array(z.object({ itemId: uuidSchema, quantity: positiveQuantity })).max(100),
});
export type RecipeInput = z.infer<typeof recipeSchema>;

export const supplierSchema = z.object({
  name: z.string().trim().min(1).max(140),
  phone: optionalText(30, 'شماره تماس'),
  email: z.string().email('ایمیل معتبر نیست.').max(160).nullable().optional().or(z.literal('').transform(() => null)),
  address: optionalText(300, 'نشانی'),
  notes: optionalText(500, 'یادداشت'),
});
export type SupplierInput = z.infer<typeof supplierSchema>;
export const updateSupplierSchema = supplierSchema.partial().extend({ isActive: z.boolean().optional() });

export const purchaseOrderSchema = z.object({
  branchId: uuidSchema.optional(),
  warehouseId: uuidSchema.optional(),
  supplierId: uuidSchema.nullable().optional(),
  notes: optionalText(500, 'یادداشت'),
  expectedAt: z.string().datetime().nullable().optional(),
  items: z.array(z.object({
    itemId: uuidSchema,
    quantity: positiveQuantity,
    unitCost: z.coerce.number().int().min(0).max(1_000_000_000).default(0),
  })).min(1).max(200),
});
export type PurchaseOrderInput = z.infer<typeof purchaseOrderSchema>;

export const receivePurchaseOrderSchema = z.object({
  items: z.array(z.object({
    itemId: uuidSchema,
    quantity: positiveQuantity,
    unitCost: z.coerce.number().int().min(0).max(1_000_000_000).optional(),
  })).min(1).max(200),
  note: optionalText(300, 'یادداشت'),
});
export type ReceivePurchaseOrderInput = z.infer<typeof receivePurchaseOrderSchema>;
