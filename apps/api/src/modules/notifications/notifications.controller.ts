import { Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { markNotificationsReadSchema } from '@restaurant-os/validation';
import { Ctx } from '../../common/decorators/auth.decorators';
import { ZodBody } from '../../common/decorators/validation.decorators';
import type { RequestContext } from '../../common/types/request-context';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

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
