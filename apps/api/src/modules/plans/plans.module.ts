import { Global, Module } from '@nestjs/common';
import { PlansService } from './plans.service';
import { SubscriptionController } from './subscription.controller';

/**
 * Global because almost every write path has to ask "is this allowed on their
 * plan?" - threading it through a dozen module imports would add noise without
 * adding safety.
 */
@Global()
@Module({
  controllers: [SubscriptionController],
  providers: [PlansService],
  exports: [PlansService],
})
export class PlansModule {}
