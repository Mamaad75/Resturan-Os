import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryListener } from './inventory.listener';
import { InventoryService } from './inventory.service';

@Module({
  controllers: [InventoryController],
  providers: [InventoryService, InventoryListener],
  exports: [InventoryService],
})
export class InventoryModule {}
