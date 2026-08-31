import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiErrorCode, SubscriptionStatus } from '@restaurant-os/types';
import type { Request } from 'express';
import { PlansService } from '../../modules/plans/plans.service';
import {
  ALLOW_INACTIVE_SUBSCRIPTION_KEY,
  IS_PLATFORM_KEY,
  IS_PUBLIC_KEY,
} from '../decorators/auth.decorators';
import { AppException } from '../exceptions/app.exception';

const WRITE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

const STATUS_MESSAGE_FA: Partial<Record<SubscriptionStatus, string>> = {
  [SubscriptionStatus.EXPIRED]:
    'اشتراک این مجموعه به پایان رسیده است. برای ادامه کار، اشتراک را تمدید کنید.',
  [SubscriptionStatus.SUSPENDED]:
    'این حساب توسط پشتیبانی معلق شده است. برای رفع محدودیت با پشتیبانی تماس بگیرید.',
};

/**
 * Stops a tenant whose subscription has lapsed from changing anything.
 *
 * Reads keep working on purpose: a restaurant whose invoice is late should be
 * able to see its own orders and its own subscription page while it sorts the
 * payment out. Only writes are refused, and only for tenant sessions -
 * platform routes and the public customer surface are handled elsewhere.
 *
 * Public order creation is refused inside the orders service instead, because
 * the guard has no tenant context on an anonymous request.
 */
@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly plans: PlansService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const [isPublic, isPlatform, allowInactive] = [
      IS_PUBLIC_KEY,
      IS_PLATFORM_KEY,
      ALLOW_INACTIVE_SUBSCRIPTION_KEY,
    ].map((key) =>
      this.reflector.getAllAndOverride<boolean>(key, [
        context.getHandler(),
        context.getClass(),
      ]),
    );
    if (isPublic || isPlatform || allowInactive) return true;

    const request = context.switchToHttp().getRequest<Request>();
    // No tenant session: nothing for this guard to decide.
    if (!request.ctx) return true;
    if (!WRITE_METHODS.has(request.method)) return true;

    const { status, writable, planNameFa } = await this.plans.entitlements(
      request.ctx.tenantId,
    );
    if (writable) return true;

    throw new AppException(
      ApiErrorCode.SUBSCRIPTION_INACTIVE,
      STATUS_MESSAGE_FA[status] ??
        `اشتراک ${planNameFa} این مجموعه فعال نیست و امکان ثبت تغییرات وجود ندارد.`,
      402,
      { subscription: [status] },
    );
  }
}
