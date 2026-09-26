import { Module } from '@nestjs/common';
import { PublicGuestController, StaffGuestController } from './guest.controller';
import { GuestService } from './guest.service';
import { WaiterEscalationService } from './waiter-escalation.service';

@Module({
  controllers: [PublicGuestController, StaffGuestController],
  providers: [GuestService, WaiterEscalationService],
  exports: [GuestService],
})
export class GuestModule {}
