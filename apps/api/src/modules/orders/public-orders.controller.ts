import { Controller, Get, Inject, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createPublicOrderSchema,
  slugSchema,
  type CreatePublicOrderInput,
} from '@restaurant-os/validation';
import { z } from 'zod';
import { Public } from '../../common/decorators/auth.decorators';
import { ZodBody, ZodParam } from '../../common/decorators/validation.decorators';
import { APP_CONFIG, type AppConfig } from '../../config/configuration';
import { NotificationsService } from '../notifications/notifications.service';
import { OrdersService } from './orders.service';

/** 48 hex characters, as produced by generateOpaqueToken(24). */
const trackingTokenSchema = z
  .string()
  .regex(/^[a-f0-9]{48}$/, 'لینک پیگیری معتبر نیست.');

@ApiTags('public-orders')
@Controller('public')
export class PublicOrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly notifications: NotificationsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @Post('restaurants/:slug/orders')
  // Anonymous write endpoint: keep the bucket tight.
  @Throttle({ auth: { limit: 12, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Submit an order from the QR menu',
    description:
      'Prices, discounts, tax and totals are all computed server-side from the ' +
      'live menu; any amounts sent by the client are ignored.',
  })
  async create(
    @ZodParam('slug', slugSchema) slug: string,
    @ZodBody(createPublicOrderSchema) dto: CreatePublicOrderInput,
  ) {
    const { order, trackingToken } = await this.orders.createPublicOrder(slug, dto);
    return {
      order,
      trackingToken,
      trackingUrl: `${this.config.appUrl.replace(/\/$/, '')}/order/track/${trackingToken}`,
    };
  }

  @Public()
  @Get('orders/track/:token')
  @ApiOperation({
    summary: 'Track one order by its secure token',
    description:
      'The token is the entire authorisation check - it grants access to exactly ' +
      'one order and cannot be used to enumerate others.',
  })
  track(@ZodParam('token', trackingTokenSchema) token: string) {
    return this.orders.track(token);
  }

  @Public()
  @Get('orders/track/:token/notifications')
  @ApiOperation({ summary: 'In-app notifications raised for this order' })
  async notificationsFor(@ZodParam('token', trackingTokenSchema) token: string) {
    const resolved = await this.orders.resolveTrackingToken(token);
    if (!resolved) return [];
    return this.notifications.listForOrder(resolved.tenantId, resolved.orderId);
  }
}
