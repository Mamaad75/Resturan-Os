import { Global, Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { OrderNotificationsListener } from './order-notifications.listener';

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, OrderNotificationsListener],
  exports: [NotificationsService],
})
export class NotificationsModule {}
