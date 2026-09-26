import { Global, Module } from '@nestjs/common';
import {
  OffersController,
  PublicCheckoutOfferController,
} from './offers.controller';
import { OffersService } from './offers.service';

/** Global: order creation prices an accepted offer on every checkout. */
@Global()
@Module({
  controllers: [OffersController, PublicCheckoutOfferController],
  providers: [OffersService],
  exports: [OffersService],
})
export class OffersModule {}
