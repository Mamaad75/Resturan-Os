import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';
import { AppConfigModule } from './config/config.module';
import { APP_CONFIG, type AppConfig } from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthController } from './health.controller';

/**
 * Modular monolith: one deployable, hard module boundaries.
 *
 * Every module owns its data access and exposes a service other modules
 * consume, so any of them (reports, sms, payments) could later be extracted
 * into its own process without touching call sites.
 */
@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    EventEmitterModule.forRoot({ maxListeners: 20, verboseMemoryLeak: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        throttlers: [
          { name: 'default', ttl: config.throttle.ttl * 1000, limit: config.throttle.limit },
          { name: 'auth', ttl: 60_000, limit: config.throttle.authLimit },
        ],
      }),
    }),
    AuditModule,
    AuthModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    // Order matters: rate limit, then authenticate, then authorise.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
