import { Controller, Get, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Permission } from '@restaurant-os/types';
import {
  posTerminalSchema,
  terminalPaymentIntentSchema,
  updatePosTerminalSchema,
  uuidSchema,
  type PosTerminalInput,
} from '@restaurant-os/validation';
import { Ctx, RequirePermissions } from '../../common/decorators/auth.decorators';
import { ZodBody, ZodParam } from '../../common/decorators/validation.decorators';
import type { RequestContext } from '../../common/types/request-context';
import { TerminalsService } from './terminals.service';

@ApiTags('terminals')
@Controller('terminals')
export class TerminalsController {
  constructor(private readonly terminals: TerminalsService) {}

  @Get()
  @RequirePermissions(Permission.PAYMENT_READ)
  list(@Ctx() ctx: RequestContext, @Query('branchId') branchId?: string) {
    return this.terminals.list(ctx, branchId);
  }

  @Post()
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  create(@Ctx() ctx: RequestContext, @ZodBody(posTerminalSchema) dto: PosTerminalInput) {
    return this.terminals.create(ctx, dto);
  }

  @Patch(':id')
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  update(
    @Ctx() ctx: RequestContext,
    @ZodParam('id', uuidSchema) id: string,
    @ZodBody(updatePosTerminalSchema) dto: Partial<PosTerminalInput>,
  ) { return this.terminals.update(ctx, id, dto); }

  @Post('orders/:orderId/intents')
  @RequirePermissions(Permission.PAYMENT_CREATE)
  intent(
    @Ctx() ctx: RequestContext,
    @ZodParam('orderId', uuidSchema) orderId: string,
    @ZodBody(terminalPaymentIntentSchema) dto: { terminalId: string; amount?: number },
  ) { return this.terminals.paymentIntent(ctx, orderId, dto.terminalId, dto.amount); }
}
