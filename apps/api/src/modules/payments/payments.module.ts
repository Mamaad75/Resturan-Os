import { Module } from '@nestjs/common';
import { PaymentsConfigController } from './payments-config.controller';
import { PaymentsConfigService } from './payments-config.service';
import { PaymentsController, PublicPaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  controllers: [PaymentsController, PublicPaymentsController, PaymentsConfigController],
  providers: [PaymentsService, PaymentsConfigService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
