import { Module } from '@nestjs/common';
import { QrModule } from '../qr/qr.module';
import { EventsController, PublicEventsController } from './events.controller';
import { EventsService } from './events.service';

// RestaurantsModule and PrismaModule are @Global, so only QrModule (for the
// dedicated-QR data URL) needs importing here.
@Module({
  imports: [QrModule],
  controllers: [EventsController, PublicEventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
