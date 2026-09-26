import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { AccountingController } from './accounting.controller';
import { AccountingService } from './accounting.service';
import { InvoiceScanService } from './invoice-scan.service';

@Module({
  // Purchases raise stock, so the inventory domain owns that half.
  imports: [InventoryModule],
  controllers: [AccountingController],
  providers: [AccountingService, InvoiceScanService],
  exports: [AccountingService, InvoiceScanService],
})
export class AccountingModule {}
