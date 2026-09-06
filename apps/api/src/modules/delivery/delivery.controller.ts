import { Controller, Delete, Get, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permission } from '@restaurant-os/types';
import {
  deliveryZoneSchema,
  dispatchOrderSchema,
  updateDeliveryZoneSchema,
  uuidSchema,
  type DeliveryZoneInput,
  type DispatchOrderInput,
  type UpdateDeliveryZoneInput,
} from '@restaurant-os/validation';
import { Ctx, RequirePermissions } from '../../common/decorators/auth.decorators';
import { ZodBody, ZodParam } from '../../common/decorators/validation.decorators';
import type { RequestContext } from '../../common/types/request-context';
import { DeliveryService } from './delivery.service';

/**
 * Delivery zones and the dispatch board.
 *
 * Zone edits need DELIVERY_MANAGE (owner and manager); handing an order to a
 * courier needs only DELIVERY_DISPATCH, which the counter and the couriers
 * themselves hold.
 */
@ApiTags('delivery')
@Controller('delivery')
export class DeliveryController {
  constructor(private readonly delivery: DeliveryService) {}

  /* ------------------------------------------------------------- zones */

  @Get('zones')
  @RequirePermissions(Permission.DELIVERY_READ)
  @ApiOperation({ summary: 'Delivery zones, optionally for one branch' })
  listZones(
    @Ctx() ctx: RequestContext,
    @Query('branchId') branchId?: string,
    @Query('activeOnly') activeOnly?: string,
  ) {
    return this.delivery.listZones(ctx, branchId, activeOnly === 'true');
  }

  @Post('zones/:branchId')
  @RequirePermissions(Permission.DELIVERY_MANAGE)
  @ApiOperation({ summary: 'Add a zone to a branch' })
  createZone(
    @Ctx() ctx: RequestContext,
    @ZodParam('branchId', uuidSchema) branchId: string,
    @ZodBody(deliveryZoneSchema) dto: DeliveryZoneInput,
  ) {
    return this.delivery.createZone(ctx, branchId, dto);
  }

  @Patch('zones/:id')
  @RequirePermissions(Permission.DELIVERY_MANAGE)
  @ApiOperation({ summary: 'Change a zone s fee, minimum or estimate' })
  updateZone(
    @Ctx() ctx: RequestContext,
    @ZodParam('id', uuidSchema) id: string,
    @ZodBody(updateDeliveryZoneSchema) dto: UpdateDeliveryZoneInput,
  ) {
    return this.delivery.updateZone(ctx, id, dto);
  }

  @Delete('zones/:id')
  @RequirePermissions(Permission.DELIVERY_MANAGE)
  @ApiOperation({ summary: 'Remove a zone, or retire it if orders reference it' })
  deleteZone(@Ctx() ctx: RequestContext, @ZodParam('id', uuidSchema) id: string) {
    return this.delivery.deleteZone(ctx, id);
  }

  /* ---------------------------------------------------------- dispatch */

  @Get('couriers')
  @RequirePermissions(Permission.DELIVERY_READ)
  @ApiOperation({ summary: 'Staff who can carry an order' })
  couriers(@Ctx() ctx: RequestContext) {
    return this.delivery.listCouriers(ctx);
  }

  @Get('board')
  @RequirePermissions(Permission.DELIVERY_READ)
  @ApiOperation({ summary: 'Delivery orders in flight; a courier sees only theirs' })
  board(@Ctx() ctx: RequestContext, @Query('branchId') branchId?: string) {
    return this.delivery.board(ctx, branchId);
  }

  @Patch('orders/:id/courier')
  @RequirePermissions(Permission.DELIVERY_DISPATCH)
  @ApiOperation({ summary: 'Assign or clear the courier on a delivery order' })
  assign(
    @Ctx() ctx: RequestContext,
    @ZodParam('id', uuidSchema) id: string,
    @ZodBody(dispatchOrderSchema) dto: DispatchOrderInput,
  ) {
    return this.delivery.assign(ctx, id, dto);
  }
}
