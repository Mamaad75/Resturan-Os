import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { PlatformAuthGuard } from './common/guards/platform-auth.guard';
import { SubscriptionGuard } from './common/guards/subscription.guard';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';
import { AppConfigModule } from './config/config.module';
import { APP_CONFIG, type AppConfig } from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { CouponsModule } from './modules/coupons/coupons.module';
import { CrmModule } from './modules/crm/crm.module';
import { GuestModule } from './modules/guest/guest.module';
import { MenuModule } from './modules/menu/menu.module';
import { QrModule } from './modules/qr/qr.module';
import { RestaurantsModule } from './modules/restaurants/restaurants.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { PlansModule } from './modules/plans/plans.module';
import { PlatformModule } from './modules/platform/platform.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { ReportsModule } from './modules/reports/reports.module';
import { SignupModule } from './modules/signup/signup.module';
import { SmsModule } from './modules/sms/sms.module';
import { StaffModule } from './modules/staff/staff.module';
import { StorageModule } from './modules/storage/storage.module';
import { TablesModule } from './modules/tables/tables.module';
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
    PlansModule,
    EventEmitterModule.forRoot({ maxListeners: 20, verboseMemoryLeak: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        // Exactly one global throttler. Named throttlers apply to every route
        // unless skipped, so a second strict tier here would rate limit the
        // whole API at the login rate. Sensitive routes tighten the budget
        // per-handler with @Throttle(AUTH_THROTTLE) instead.
        throttlers: [
          { name: 'default', ttl: config.throttle.ttl * 1000, limit: config.throttle.limit },
        ],
      }),
    }),
    AuditModule,
    AuthModule,
    StorageModule,
    RestaurantsModule,
    MenuModule,
    CouponsModule,
    GuestModule,
    QrModule,
    SmsModule,
    SignupModule,
    PlatformModule,
    CrmModule,
    NotificationsModule,
    TablesModule,
    OrdersModule,
    PaymentsModule,
    ReportsModule,
    StaffModule,
    RealtimeModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    // Order matters: rate limit, then authenticate, then authorise.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    /*
     * Guard order matters and is the whole security model:
     *   PlatformAuthGuard  - claims @PlatformOnly routes for platform admins
     *   JwtAuthGuard       - builds the tenant context, or rejects
     *   PermissionsGuard   - checks the route's declared permissions
     *   SubscriptionGuard  - refuses writes once a subscription has lapsed
     * The billing gate runs last so it can never be the thing that lets an
     * unauthenticated or unauthorised request through.
     */
    { provide: APP_GUARD, useClass: PlatformAuthGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: SubscriptionGuard },
  ],
})
export class AppModule {}
