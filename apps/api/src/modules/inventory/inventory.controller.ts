import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Permission } from '@restaurant-os/types';
import {
  createInventoryItemSchema,
  createWarehouseSchema,
  purchaseOrderSchema,
  receivePurchaseOrderSchema,
  recipeSchema,
  stockAdjustmentSchema,
  stockTransferSchema,
  supplierSchema,
  updateInventoryItemSchema,
  updateSupplierSchema,
  uuidSchema,
  type CreateInventoryItemInput,
  type CreateWarehouseInput,
  type PurchaseOrderInput,
  type ReceivePurchaseOrderInput,
  type RecipeInput,
  type StockAdjustmentInput,
  type StockTransferInput,
  type SupplierInput,
  type UpdateInventoryItemInput,
} from '@restaurant-os/validation';
import { Ctx, RequirePermissions } from '../../common/decorators/auth.decorators';
import { ZodBody, ZodParam } from '../../common/decorators/validation.decorators';
import type { RequestContext } from '../../common/types/request-context';
import { InventoryService } from './inventory.service';

@ApiTags('inventory')
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('summary') @RequirePermissions(Permission.INVENTORY_READ)
  summary(@Ctx() ctx: RequestContext, @Query('branchId') branchId?: string) { return this.inventory.summary(ctx, branchId); }

  @Get('items') @RequirePermissions(Permission.INVENTORY_READ)
  items(@Ctx() ctx: RequestContext, @Query('branchId') branchId?: string, @Query('warehouseId') warehouseId?: string) { return this.inventory.listItems(ctx, branchId, warehouseId); }

  @Post('items') @RequirePermissions(Permission.INVENTORY_MANAGE)
  createItem(@Ctx() ctx: RequestContext, @ZodBody(createInventoryItemSchema) dto: CreateInventoryItemInput) { return this.inventory.createItem(ctx, dto); }

  @Patch('items/:id') @RequirePermissions(Permission.INVENTORY_MANAGE)
  updateItem(@Ctx() ctx: RequestContext, @ZodParam('id', uuidSchema) id: string, @ZodBody(updateInventoryItemSchema) dto: UpdateInventoryItemInput) { return this.inventory.updateItem(ctx, id, dto); }

  @Get('warehouses') @RequirePermissions(Permission.INVENTORY_READ)
  warehouses(@Ctx() ctx: RequestContext, @Query('branchId') branchId?: string) { return this.inventory.warehouses(ctx, branchId); }

  @Post('warehouses') @RequirePermissions(Permission.INVENTORY_MANAGE)
  createWarehouse(@Ctx() ctx: RequestContext, @ZodBody(createWarehouseSchema) dto: CreateWarehouseInput) { return this.inventory.createWarehouse(ctx, dto); }

  @Post('adjust') @RequirePermissions(Permission.INVENTORY_MANAGE)
  adjust(@Ctx() ctx: RequestContext, @ZodBody(stockAdjustmentSchema) dto: StockAdjustmentInput) { return this.inventory.adjust(ctx, dto); }

  @Post('transfer') @RequirePermissions(Permission.INVENTORY_MANAGE)
  transfer(@Ctx() ctx: RequestContext, @ZodBody(stockTransferSchema) dto: StockTransferInput) { return this.inventory.transfer(ctx, dto); }

  @Get('movements') @RequirePermissions(Permission.INVENTORY_READ)
  movements(@Ctx() ctx: RequestContext, @Query('branchId') branchId?: string, @Query('itemId') itemId?: string) { return this.inventory.movements(ctx, branchId, itemId); }

  @Get('products/:id/recipe') @RequirePermissions(Permission.INVENTORY_READ)
  recipe(@Ctx() ctx: RequestContext, @ZodParam('id', uuidSchema) id: string) { return this.inventory.getRecipe(ctx, id); }

  @Put('products/:id/recipe') @RequirePermissions(Permission.INVENTORY_MANAGE)
  setRecipe(@Ctx() ctx: RequestContext, @ZodParam('id', uuidSchema) id: string, @ZodBody(recipeSchema) dto: RecipeInput) { return this.inventory.setRecipe(ctx, id, dto); }

  @Get('suppliers') @RequirePermissions(Permission.INVENTORY_READ)
  suppliers(@Ctx() ctx: RequestContext) { return this.inventory.suppliers(ctx); }

  @Post('suppliers') @RequirePermissions(Permission.INVENTORY_MANAGE)
  createSupplier(@Ctx() ctx: RequestContext, @ZodBody(supplierSchema) dto: SupplierInput) { return this.inventory.createSupplier(ctx, dto); }

  @Patch('suppliers/:id') @RequirePermissions(Permission.INVENTORY_MANAGE)
  updateSupplier(@Ctx() ctx: RequestContext, @ZodParam('id', uuidSchema) id: string, @Body() body: unknown) {
    const dto = updateSupplierSchema.parse(body);
    return this.inventory.updateSupplier(ctx, id, dto);
  }

  @Get('purchase-orders') @RequirePermissions(Permission.INVENTORY_READ)
  purchaseOrders(@Ctx() ctx: RequestContext, @Query('branchId') branchId?: string) { return this.inventory.purchaseOrders(ctx, branchId); }

  @Post('purchase-orders') @RequirePermissions(Permission.INVENTORY_MANAGE)
  createPurchaseOrder(@Ctx() ctx: RequestContext, @ZodBody(purchaseOrderSchema) dto: PurchaseOrderInput) { return this.inventory.createPurchaseOrder(ctx, dto); }

  @Post('purchase-orders/:id/receive') @RequirePermissions(Permission.INVENTORY_MANAGE)
  receive(@Ctx() ctx: RequestContext, @ZodParam('id', uuidSchema) id: string, @ZodBody(receivePurchaseOrderSchema) dto: ReceivePurchaseOrderInput) { return this.inventory.receivePurchaseOrder(ctx, id, dto); }
}
