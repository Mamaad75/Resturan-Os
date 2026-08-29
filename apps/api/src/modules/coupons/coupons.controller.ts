import { Controller, Delete, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permission } from '@restaurant-os/types';
import {
  createCouponSchema,
  previewCouponSchema,
  slugSchema,
  updateCouponSchema,
  uuidSchema,
  type CreateCouponInput,
  type PreviewCouponInput,
  type UpdateCouponInput,
} from '@restaurant-os/validation';
import { Ctx, Public, RequirePermissions } from '../../common/decorators/auth.decorators';
import { ZodBody, ZodParam } from '../../common/decorators/validation.decorators';
import type { RequestContext } from '../../common/types/request-context';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { CouponsService } from './coupons.service';

@ApiTags('coupons')
@Controller('coupons')
export class CouponsController {
  constructor(private readonly coupons: CouponsService) {}

  @Get()
  // Campaign spend is commercial information, so it sits behind reporting.
  @RequirePermissions(Permission.REPORT_READ, Permission.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'List discount codes with usage and campaign cost' })
  list(@Ctx() ctx: RequestContext) {
    return this.coupons.list(ctx);
  }

  @Post()
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Create a discount code' })
  create(@Ctx() ctx: RequestContext, @ZodBody(createCouponSchema) dto: CreateCouponInput) {
    return this.coupons.create(ctx, dto);
  }

  @Patch(':id')
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  @ApiOperation({
    summary: 'Update a discount code',
    description: 'The code itself is immutable once issued; everything else can change.',
  })
  update(
    @Ctx() ctx: RequestContext,
    @ZodParam('id', uuidSchema) id: string,
    @ZodBody(updateCouponSchema) dto: UpdateCouponInput,
  ) {
    return this.coupons.update(ctx, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  @ApiOperation({
    summary: 'Delete a discount code',
    description:
      'A code that has already been redeemed is deactivated instead of deleted, ' +
      'so past orders keep a valid reference.',
  })
  remove(@Ctx() ctx: RequestContext, @ZodParam('id', uuidSchema) id: string) {
    return this.coupons.remove(ctx, id);
  }
}

/** Lets the customer check a code before committing to the order. */
@ApiTags('coupons')
@Controller('public/restaurants/:slug/coupons')
export class PublicCouponsController {
  constructor(
    private readonly coupons: CouponsService,
    private readonly restaurants: RestaurantsService,
  ) {}

  @Public()
  @Post('preview')
  @HttpCode(HttpStatus.OK)
  // Guessing codes is the obvious abuse here, so the bucket is tight.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Preview a discount code against a cart subtotal',
    description:
      'Returns the discount that would apply. The real discount is recomputed ' +
      'when the order is submitted, so this is a convenience, not a promise.',
  })
  async preview(
    @ZodParam('slug', slugSchema) slug: string,
    @ZodBody(previewCouponSchema) dto: PreviewCouponInput,
  ) {
    const resolved = await this.restaurants.findPublicBySlug(slug);
    return this.coupons.preview(resolved.tenantId, dto.code, dto.subtotal, dto.phone);
  }
}
