import { Global, Module } from '@nestjs/common';
import { RestaurantsController } from './restaurants.controller';
import { RestaurantsService } from './restaurants.service';

/**
 * Global because nearly every other module needs `resolveBranchId()` to turn a
 * request context into the branch it operates on.
 */
@Global()
@Module({
  controllers: [RestaurantsController],
  providers: [RestaurantsService],
  exports: [RestaurantsService],
})
export class RestaurantsModule {}
