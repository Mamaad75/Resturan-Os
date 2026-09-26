import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { slugSchema } from '@restaurant-os/validation';
import { z } from 'zod';
import { Public } from '../../common/decorators/auth.decorators';
import { ZodParam } from '../../common/decorators/validation.decorators';
import { PUBLIC_MENU_THROTTLE } from '../../common/throttle';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { RegularsService } from './regulars.service';

/** 48 hex characters, as produced by generateOpaqueToken(24). */
const trackingTokenSchema = z.string().regex(/^[a-f0-9]{48}$/);

@ApiTags('public-menu')
@Controller('public/restaurants/:slug')
export class RegularsController {
  constructor(
    private readonly regulars: RegularsService,
    private readonly restaurants: RestaurantsService,
  ) {}

  @Public()
  @Get('usual')
  @Throttle(PUBLIC_MENU_THROTTLE)
  @ApiOperation({
    summary: 'What this returning guest usually orders, or null',
    description:
      'Identified by the tracking token of one of their own past orders. ' +
      'Returns product ids and quantities only; the menu the browser already ' +
      'holds supplies the names, the prices and what is available today.',
  })
  async usual(
    @ZodParam('slug', slugSchema) slug: string,
    @Query('token') token?: string,
  ) {
    // A malformed or absent token is "we do not know you", not an error: this
    // endpoint sits on a menu that must render for a first-time visitor.
    const parsed = trackingTokenSchema.safeParse(token ?? '');
    if (!parsed.success) return null;

    const resolved = await this.restaurants.findPublicBySlug(slug);
    return this.regulars.usualOrder(resolved.tenantId, parsed.data);
  }
}
