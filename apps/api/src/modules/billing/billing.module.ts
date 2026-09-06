import { Module } from '@nestjs/common';
import { PlatformModule } from '../platform/platform.module';
import { BillingController } from './billing.controller';

/**
 * Subscription billing, for both audiences.
 *
 * The tenant-facing controller lives here; the platform's review routes hang
 * off the platform controller so the whole console stays behind one
 * `@PlatformOnly()` class.
 */
@Module({
  imports: [PlatformModule],
  controllers: [BillingController],
})
export class BillingModule {}
