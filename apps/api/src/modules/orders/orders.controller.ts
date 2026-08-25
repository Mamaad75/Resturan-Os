import { Controller, Get, HttpCode, HttpStatus, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrderStatus, Permission } from '@restaurant-os/types';
import {
  addOrderItemsSchema,
  createStaffOrderSchema,
  orderQuerySchema,
  updateOrderSchema,
  updateOrderStatusSchema,
  uuidSchema,
  type AddOrderItemsInput,
  type CreateStaffOrderInput,
  type OrderQueryInput,
  type UpdateOrderInput,
  type UpdateOrderStatusInput,
} from '@restaurant-os/validation';
import { Ctx, RequirePermissions } from '../../common/decorators/auth.decorators';
import {
  ZodBody,
  ZodParam,
  ZodQuery,
} from '../../common/decorators/validation.decorators';
import type { RequestContext } from '../../common/types/request-context';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @RequirePermissions(Permission.ORDER_READ)
  @ApiOperation({ summary: 'Search, filter and page through orders' })
  list(
    @Ctx() ctx: RequestContext,
    @ZodQuery(orderQuerySchema) query: OrderQueryInput,
    @Query('branchId') branchId?: string,
  ) {
    return this.orders.list(ctx, query, branchId);
  }

  @Get('kitchen/queue')
  @RequirePermissions(Permission.KITCHEN_READ)
  @ApiOperation({ summary: 'Live kitchen queue for the branch' })
  kitchenQueue(@Ctx() ctx: RequestContext, @Query('branchId') branchId?: string) {
    return this.orders.kitchenQueue(ctx, branchId);
  }

  @Post()
  @RequirePermissions(Permission.ORDER_CREATE)
  @ApiOperation({ summary: 'Create an order from the counter or a waiter device' })
  create(
    @Ctx() ctx: RequestContext,
    @ZodBody(createStaffOrderSchema) dto: CreateStaffOrderInput,
    @Query('branchId') branchId?: string,
  ) {
    return this.orders.createStaffOrder(ctx, dto, branchId);
  }

  @Get(':id')
  @RequirePermissions(Permission.ORDER_READ)
  @ApiOperation({ summary: 'Full order detail including history and payments' })
  get(@Ctx() ctx: RequestContext, @ZodParam('id', uuidSchema) id: string) {
    return this.orders.get(ctx, id);
  }

  @Patch(':id')
  @RequirePermissions(Permission.ORDER_UPDATE)
  @ApiOperation({ summary: 'Update notes, customer details or discount' })
  update(
    @Ctx() ctx: RequestContext,
    @ZodParam('id', uuidSchema) id: string,
    @ZodBody(updateOrderSchema) dto: UpdateOrderInput,
  ) {
    return this.orders.updateDetails(ctx, id, dto);
  }

  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  // Cancelling needs its own permission; the service re-checks the transition.
  @RequirePermissions(
    Permission.ORDER_STATUS_UPDATE,
    Permission.KITCHEN_UPDATE,
    Permission.ORDER_CANCEL,
  )
  @ApiOperation({
    summary: 'Advance an order through the state machine',
    description:
      'Rejects any transition not permitted for the order type with ORDER_INVALID_STATE.',
  })
  updateStatus(
    @Ctx() ctx: RequestContext,
    @ZodParam('id', uuidSchema) id: string,
    @ZodBody(updateOrderStatusSchema) dto: UpdateOrderStatusInput,
  ) {
    return this.orders.updateStatus(ctx, id, dto.status as OrderStatus, dto.note);
  }

  @Post(':id/items')
  @RequirePermissions(Permission.ORDER_UPDATE)
  @ApiOperation({ summary: 'Append items to an open order' })
  addItems(
    @Ctx() ctx: RequestContext,
    @ZodParam('id', uuidSchema) id: string,
    @ZodBody(addOrderItemsSchema) dto: AddOrderItemsInput,
  ) {
    return this.orders.addItems(ctx, id, dto);
  }
}
