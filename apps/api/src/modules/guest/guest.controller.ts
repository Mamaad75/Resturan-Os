import { Controller, Get, HttpCode, HttpStatus, Patch, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permission } from '@restaurant-os/types';
import {
  createFeedbackSchema,
  createWaiterCallSchema,
  resolveWaiterCallSchema,
  slugSchema,
  uuidSchema,
  type CreateFeedbackInput,
  type CreateWaiterCallInput,
} from '@restaurant-os/validation';
import { z } from 'zod';
import { Ctx, Public, RequirePermissions } from '../../common/decorators/auth.decorators';
import { ZodBody, ZodParam } from '../../common/decorators/validation.decorators';
import type { RequestContext } from '../../common/types/request-context';
import { GuestService } from './guest.service';

const trackingTokenSchema = z
  .string()
  .regex(/^[a-f0-9]{48}$/, 'لینک پیگیری معتبر نیست.');

/** Anonymous guest actions, reachable straight from the QR menu. */
@ApiTags('guest')
@Controller('public')
export class PublicGuestController {
  constructor(private readonly guest: GuestService) {}

  @Public()
  @Post('restaurants/:slug/waiter-call')
  @HttpCode(HttpStatus.OK)
  // Anonymous and physical-world triggered: enough for real use, not enough
  // to spam the floor.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Call a waiter to a table',
    description:
      'Repeat taps collapse into the existing open call rather than flooding ' +
      'the counter with duplicates.',
  })
  callWaiter(
    @ZodParam('slug', slugSchema) slug: string,
    @ZodBody(createWaiterCallSchema) dto: CreateWaiterCallInput,
  ) {
    return this.guest.callWaiter(slug, dto);
  }

  @Public()
  @Post('orders/track/:token/feedback')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Rate a completed order',
    description:
      'The tracking token is the credential; one rating per order is enforced ' +
      'by a unique index.',
  })
  submitFeedback(
    @ZodParam('token', trackingTokenSchema) token: string,
    @ZodBody(createFeedbackSchema) dto: CreateFeedbackInput,
  ) {
    return this.guest.submitFeedback(token, dto);
  }
}

/** Staff-facing view of guest requests. */
@ApiTags('guest')
@Controller()
export class StaffGuestController {
  constructor(private readonly guest: GuestService) {}

  @Get('waiter-calls')
  @RequirePermissions(Permission.TABLE_READ, Permission.ORDER_READ)
  @ApiOperation({ summary: 'Open waiter calls for the branch, oldest first' })
  list(@Ctx() ctx: RequestContext, @Query('branchId') branchId?: string) {
    return this.guest.listOpenCalls(ctx, branchId);
  }

  @Patch('waiter-calls/:id')
  @RequirePermissions(Permission.TABLE_MANAGE, Permission.ORDER_UPDATE)
  @ApiOperation({ summary: 'Acknowledge or resolve a waiter call' })
  update(
    @Ctx() ctx: RequestContext,
    @ZodParam('id', uuidSchema) id: string,
    @ZodBody(resolveWaiterCallSchema) dto: { status: 'ACKNOWLEDGED' | 'RESOLVED' },
  ) {
    return this.guest.updateCall(ctx, id, dto.status);
  }

  @Get('feedback')
  @RequirePermissions(Permission.REPORT_READ)
  @ApiOperation({ summary: 'Rating distribution and recent comments' })
  feedback(@Ctx() ctx: RequestContext, @Query('branchId') branchId?: string) {
    return this.guest.feedbackSummary(ctx, branchId);
  }
}
