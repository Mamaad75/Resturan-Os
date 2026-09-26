import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from '../auth/auth.module';
import { BillingService } from '../billing/billing.service';
import { PlatformAuditService } from './platform-audit.service';
import { PlatformAuthController } from './platform-auth.controller';
import { PlatformAuthService } from './platform-auth.service';
import { PlatformBootstrapService } from './platform-bootstrap.service';
import { PlatformController } from './platform.controller';
import { PlatformDashboardService } from './platform-dashboard.service';
import { PlatformPlansService } from './platform-plans.service';
import { PlatformSettingsService } from './platform-settings.service';
import { PlatformTenantsService } from './platform-tenants.service';

/**
 * FoodOS platform administration.
 *
 * Imports AuthModule only for PasswordService: the two authentication flows
 * share hashing parameters and nothing else.
 */
@Module({
  imports: [JwtModule.register({}), AuthModule],
  controllers: [PlatformAuthController, PlatformController],
  providers: [
    PlatformAuthService,
    PlatformBootstrapService,
    PlatformAuditService,
    PlatformDashboardService,
    PlatformTenantsService,
    PlatformPlansService,
    PlatformSettingsService,
    // Lives here rather than in BillingModule so the platform controller can
    // inject it without the two modules importing each other.
    BillingService,
  ],
  exports: [PlatformAuditService, BillingService],
})
export class PlatformModule {}
