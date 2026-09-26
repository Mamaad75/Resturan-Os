import { Module } from '@nestjs/common';
import { RegularsController } from './regulars.controller';
import { RegularsService } from './regulars.service';

@Module({
  controllers: [RegularsController],
  providers: [RegularsService],
  exports: [RegularsService],
})
export class RegularsModule {}
