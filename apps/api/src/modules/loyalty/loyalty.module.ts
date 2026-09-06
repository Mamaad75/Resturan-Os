import { Global, Module } from '@nestjs/common';
import { LoyaltyController } from './loyalty.controller';
import { LoyaltyService } from './loyalty.service';

/**
 * Global because the order pipeline needs it on every write path, the same
 * reason PlansModule is.
 */
@Global()
@Module({
  controllers: [LoyaltyController],
  providers: [LoyaltyService],
  exports: [LoyaltyService],
})
export class LoyaltyModule {}
