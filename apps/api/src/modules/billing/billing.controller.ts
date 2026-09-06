import { Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permission } from '@restaurant-os/types';
import {
  submitInvoiceSchema,
  uuidSchema,
  type SubmitInvoiceInput,
} from '@restaurant-os/validation';
import {
  AllowInactiveSubscription,
  Ctx,
  RequirePermissions,
} from '../../common/decorators/auth.decorators';
import { ZodBody, ZodParam } from '../../common/decorators/validation.decorators';
import type { RequestContext } from '../../common/types/request-context';
import { BillingService } from './billing.service';

/**
 * The tenant's side of paying for a subscription.
 *
 * Every route is `@AllowInactiveSubscription()`: a restaurant whose plan has
 * lapsed is exactly who needs to reach this page, and locking them out of the
 * only screen that takes their money would be self-defeating.
 *
 * Nothing here activates anything. A tenant reports a transfer; the platform
 * decides whether it happened.
 */
@ApiTags('billing')
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('bank-accounts')
  @AllowInactiveSubscription()
  @RequirePermissions(Permission.SETTINGS_READ)
  @ApiOperation({ summary: 'Where to transfer the money' })
  bankAccounts() {
    return this.billing.activeBankAccounts();
  }

  @Get('invoices')
  @AllowInactiveSubscription()
  @RequirePermissions(Permission.SETTINGS_READ)
  @ApiOperation({ summary: "This tenant's payment requests" })
  invoices(@Ctx() ctx: RequestContext) {
    return this.billing.myInvoices(ctx);
  }

  @Post('invoices')
  @AllowInactiveSubscription()
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Report a card-to-card transfer for a plan' })
  submit(
    @Ctx() ctx: RequestContext,
    @ZodBody(submitInvoiceSchema) dto: SubmitInvoiceInput,
  ) {
    return this.billing.submitInvoice(ctx, dto);
  }

  @Post('invoices/:id/cancel')
  @AllowInactiveSubscription()
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Withdraw a request submitted by mistake' })
  cancel(@Ctx() ctx: RequestContext, @ZodParam('id', uuidSchema) id: string) {
    return this.billing.cancelInvoice(ctx, id);
  }
}
