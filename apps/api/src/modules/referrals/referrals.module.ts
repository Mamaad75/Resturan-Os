import { Global, Module } from '@nestjs/common';
import {
  PublicReferralsController,
  ReferralsController,
} from './referrals.controller';
import { ReferralsService } from './referrals.service';

/**
 * Global because order creation prices and consumes rewards inside its own
 * transaction, and importing this module there would create a cycle.
 */
@Global()
@Module({
  controllers: [ReferralsController, PublicReferralsController],
  providers: [ReferralsService],
  exports: [ReferralsService],
})
export class ReferralsModule {}
