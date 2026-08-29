import { Global, Module } from '@nestjs/common';
import { CouponsController, PublicCouponsController } from './coupons.controller';
import { CouponsService } from './coupons.service';

/**
 * Global because the orders module needs `evaluate`/`redeem` inside its own
 * transaction, and importing it there would create a cycle.
 */
@Global()
@Module({
  controllers: [CouponsController, PublicCouponsController],
  providers: [CouponsService],
  exports: [CouponsService],
})
export class CouponsModule {}
