import { Module } from '@nestjs/common';
import { SmsModule } from '../sms/sms.module';
import { CampaignsService } from './campaigns.service';
import { CampaignsController, CustomersController } from './crm.controller';
import { CustomersService } from './customers.service';

/** Customer relationship management: the customer book and its campaigns. */
@Module({
  imports: [SmsModule],
  controllers: [CustomersController, CampaignsController],
  providers: [CustomersService, CampaignsService],
  exports: [CustomersService],
})
export class CrmModule {}
