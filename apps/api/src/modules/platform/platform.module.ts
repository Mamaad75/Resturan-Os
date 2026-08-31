import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from '../auth/auth.module';
import { PlatformAuditService } from './platform-audit.service';
import { PlatformAuthController } from './platform-auth.controller';
import { PlatformAuthService } from './platform-auth.service';
import { PlatformController } from './platform.controller';
import { PlatformDashboardService } from './platform-dashboard.service';
import { PlatformPlansService } from './platform-plans.service';
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
    PlatformAuditService,
    PlatformDashboardService,
    PlatformTenantsService,
    PlatformPlansService,
  ],
  exports: [PlatformAuditService],
})
export class PlatformModule {}
