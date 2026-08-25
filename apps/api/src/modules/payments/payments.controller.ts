import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permission } from '@restaurant-os/types';
import {
  createPaymentSchema,
  refundPaymentSchema,
  uuidSchema,
  type CreatePaymentInput,
  type RefundPaymentInput,
} from '@restaurant-os/validation';
import { Ctx, Public, RequirePermissions } from '../../common/decorators/auth.decorators';
import { ZodBody, ZodParam } from '../../common/decorators/validation.decorators';
import type { RequestContext } from '../../common/types/request-context';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@Controller('orders/:id/payment')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  @RequirePermissions(Permission.PAYMENT_READ)
  @ApiOperation({ summary: 'Payments recorded against an order' })
  list(@Ctx() ctx: RequestContext, @ZodParam('id', uuidSchema) id: string) {
    return this.payments.listForOrder(ctx, id);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.PAYMENT_CREATE)
  @ApiOperation({
    summary: 'Record a payment',
    description:
      'Cash and card settle immediately. Online payments return a redirectUrl and ' +
      'only become PAID once the gateway callback is verified.',
  })
  create(
    @Ctx() ctx: RequestContext,
    @ZodParam('id', uuidSchema) id: string,
    @ZodBody(createPaymentSchema) dto: CreatePaymentInput,
  ) {
    return this.payments.recordPayment(ctx, id, dto);
  }

  @Post('refund')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.PAYMENT_REFUND)
  @ApiOperation({ summary: 'Refund a payment, fully or partially' })
  refund(
    @Ctx() ctx: RequestContext,
    @ZodParam('id', uuidSchema) id: string,
    @ZodBody(refundPaymentSchema) dto: RefundPaymentInput,
  ) {
    return this.payments.refund(ctx, id, dto);
  }
}

/** Anonymous return path from an online gateway. */
@ApiTags('payments')
@Controller('public/payments')
export class PublicPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Public()
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify an online payment after the customer returns from the gateway',
    description:
      'Idempotent: gateways retry callbacks, and verifying an already-paid ' +
      'payment simply reports success again.',
  })
  verify(
    @Body('providerRef') providerRef: string,
    @Body('payload') payload?: Record<string, unknown>,
  ) {
    return this.payments.verifyOnlinePayment(providerRef, payload);
  }
}
