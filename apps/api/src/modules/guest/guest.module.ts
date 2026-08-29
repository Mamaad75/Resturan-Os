import { Module } from '@nestjs/common';
import { PublicGuestController, StaffGuestController } from './guest.controller';
import { GuestService } from './guest.service';

@Module({
  controllers: [PublicGuestController, StaffGuestController],
  providers: [GuestService],
  exports: [GuestService],
})
export class GuestModule {}
