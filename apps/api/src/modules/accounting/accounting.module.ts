import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { AccountingController } from './accounting.controller';
import { AccountingService } from './accounting.service';

@Module({
  // Purchases raise stock, so the inventory domain owns that half.
  imports: [InventoryModule],
  controllers: [AccountingController],
  providers: [AccountingService],
  exports: [AccountingService],
})
export class AccountingModule {}
