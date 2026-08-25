import { Module } from '@nestjs/common';
import { TablesModule } from '../tables/tables.module';
import { OrderPricingService } from './order-pricing.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { PublicOrdersController } from './public-orders.controller';

@Module({
  imports: [TablesModule],
  controllers: [OrdersController, PublicOrdersController],
  providers: [OrdersService, OrderPricingService],
  exports: [OrdersService],
})
export class OrdersModule {}
