import { Controller, Delete, Get, Patch, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permission } from '@restaurant-os/types';
import {
  checkoutOfferSchema,
  slugSchema,
  updateCheckoutOfferSchema,
  uuidSchema,
  type CheckoutOfferInput,
  type UpdateCheckoutOfferInput,
} from '@restaurant-os/validation';
import {
  Ctx,
  Public,
  RequirePermissions,
} from '../../common/decorators/auth.decorators';
import { ZodBody, ZodParam } from '../../common/decorators/validation.decorators';
import { PUBLIC_MENU_THROTTLE } from '../../common/throttle';
import type { RequestContext } from '../../common/types/request-context';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { OffersService } from './offers.service';

/**
 * The owner's side of the checkout offer.
 *
 * Gated exactly like discount codes: an offer is a discount campaign with a
 * cost, so the same authority that issues a coupon runs one, and the list -
 * which carries how much of the campaign was taken up - sits behind reporting
 * as well.
 */
@ApiTags('offers')
@Controller('offers')
export class OffersController {
  constructor(private readonly offers: OffersService) {}

  @Get()
  @RequirePermissions(Permission.REPORT_READ, Permission.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Checkout offers, with how often each was taken' })
  list(@Ctx() ctx: RequestContext) {
    return this.offers.list(ctx);
  }

  @Post()
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Offer a product at a discount for N days' })
  create(
    @Ctx() ctx: RequestContext,
    @ZodBody(checkoutOfferSchema) dto: CheckoutOfferInput,
  ) {
    return this.offers.create(ctx, dto);
  }

  @Patch(':id')
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Change the discount, the window or pause it' })
  update(
    @Ctx() ctx: RequestContext,
    @ZodParam('id', uuidSchema) id: string,
    @ZodBody(updateCheckoutOfferSchema) dto: UpdateCheckoutOfferInput,
  ) {
    return this.offers.update(ctx, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Remove an offer' })
  remove(@Ctx() ctx: RequestContext, @ZodParam('id', uuidSchema) id: string) {
    return this.offers.remove(ctx, id);
  }
}

/** Ids arrive in a query string, so they are filtered before they reach SQL. */
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * What the guest is shown on the last screen before paying.
 *
 * Returns `null` rather than 404 when nothing is running: "no offer today" is
 * the normal case, and a checkout screen should not have to treat it as an
 * error. Products already in the cart are excluded by the caller, because an
 * offer for something the guest has ordered anyway is a discount the
 * restaurant gives away for nothing.
 */
@ApiTags('public-offers')
@Controller('public/restaurants/:slug')
export class PublicCheckoutOfferController {
  constructor(
    private readonly offers: OffersService,
    private readonly restaurants: RestaurantsService,
  ) {}

  @Public()
  @Get('checkout-offer')
  @Throttle(PUBLIC_MENU_THROTTLE)
  @ApiOperation({
    summary: 'The offer to show a guest before payment, or null',
    description:
      'The price shown here is recomputed when the order is submitted, so it ' +
      'is a promise about the discount, not about the total.',
  })
  async liveOffer(
    @ZodParam('slug', slugSchema) slug: string,
    @Query('exclude') exclude?: string,
  ) {
    const resolved = await this.restaurants.findPublicBySlug(slug);
    // A cart of 60 lines is the schema's own limit; anything longer is noise.
    const excluded = (exclude ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter((id) => UUID.test(id))
      .slice(0, 60);
    return this.offers.liveOffer(resolved.tenantId, excluded);
  }
}
