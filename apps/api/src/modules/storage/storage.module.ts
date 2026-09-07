import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { StorageService } from './storage.service';

@Module({
  controllers: [UploadsController],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
