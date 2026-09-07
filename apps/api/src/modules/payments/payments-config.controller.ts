import { Controller, Get, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permission } from '@restaurant-os/types';
import {
  updateTenantPaymentConfigSchema,
  type UpdateTenantPaymentConfigInput,
} from '@restaurant-os/validation';
import { Ctx, RequirePermissions } from '../../common/decorators/auth.decorators';
import { ZodBody } from '../../common/decorators/validation.decorators';
import type { RequestContext } from '../../common/types/request-context';
import { PaymentsConfigService } from './payments-config.service';

@ApiTags('payments')
@Controller('payment-config')
export class PaymentsConfigController {
  constructor(private readonly config: PaymentsConfigService) {}

  @Get()
  @RequirePermissions(Permission.SETTINGS_READ)
  @ApiOperation({ summary: "The restaurant's online-payment mode and own gateway" })
  get(@Ctx() ctx: RequestContext) {
    return this.config.get(ctx);
  }

  @Put()
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Choose the online-payment mode / own gateway' })
  update(
    @Ctx() ctx: RequestContext,
    @ZodBody(updateTenantPaymentConfigSchema) dto: UpdateTenantPaymentConfigInput,
  ) {
    return this.config.update(ctx, dto);
  }
}
