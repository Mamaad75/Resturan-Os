import { Controller, Delete, Get, Headers, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { markNotificationsReadSchema, pushSubscriptionSchema, type PushSubscriptionInput } from '@restaurant-os/validation';
import { Ctx } from '../../common/decorators/auth.decorators';
import { ZodBody } from '../../common/decorators/validation.decorators';
import type { RequestContext } from '../../common/types/request-context';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService, private readonly push: PushService) {}

  @Get()
  @ApiOperation({ summary: 'Notification inbox for the signed-in user' })
  list(
    @Ctx() ctx: RequestContext,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    return this.notifications.listForUser(ctx, {
      page: Math.max(1, Number(page) || 1),
      pageSize: Math.min(100, Math.max(1, Number(pageSize) || 20)),
      unreadOnly: unreadOnly === 'true',
    });
  }

  @Get('push/config')
  @ApiOperation({ summary: 'Web Push availability and public VAPID key' })
  pushConfig() { return this.push.configForClient(); }

  @Post('push/subscribe')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Register this browser/device for staff push notifications' })
  subscribe(
    @Ctx() ctx: RequestContext,
    @ZodBody(pushSubscriptionSchema) dto: PushSubscriptionInput,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.push.subscribe(ctx, { ...dto, userAgent: dto.userAgent ?? userAgent ?? null });
  }

  @Delete('push/subscribe')
  @ApiOperation({ summary: 'Disable a browser push subscription' })
  unsubscribe(@Ctx() ctx: RequestContext, @Query('endpoint') endpoint: string) {
    return this.push.unsubscribe(ctx, endpoint);
  }

  @Post('read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark specific notifications, or all of them, as read' })
  markRead(
    @Ctx() ctx: RequestContext,
    @ZodBody(markNotificationsReadSchema) dto: { ids?: string[]; all?: boolean },
  ) {
    return this.notifications.markRead(ctx, dto);
  }
}
