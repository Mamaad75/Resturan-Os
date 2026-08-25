import { Global, Module } from '@nestjs/common';
import { SmsController } from './sms.controller';
import { SmsService } from './sms.service';
import { SmsWorker } from './sms.worker';

@Global()
@Module({
  controllers: [SmsController],
  providers: [SmsService, SmsWorker],
  exports: [SmsService],
})
export class SmsModule {}
