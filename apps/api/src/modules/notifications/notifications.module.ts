import { Global, Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { OrderNotificationsListener } from './order-notifications.listener';
import { PushService } from './push.service';

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, PushService, OrderNotificationsListener],
  exports: [NotificationsService, PushService],
})
export class NotificationsModule {}
