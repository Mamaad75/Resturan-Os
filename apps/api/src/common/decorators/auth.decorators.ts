import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { Permission } from '@restaurant-os/types';
import type { Request } from 'express';
import { AppException } from '../exceptions/app.exception';
import type {
  CustomerContext,
  PlatformContext,
  RequestContext,
} from '../types/request-context';

export const IS_PUBLIC_KEY = 'auth:isPublic';
/** Marks a route as reachable without an access token (customer surface). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const IS_PLATFORM_KEY = 'auth:isPlatform';
/**
 * Marks a route as belonging to the FoodOS platform surface. Platform routes
 * authenticate against `PlatformAdmin` and carry no tenant scope, so the
 * tenant guards stand down and the platform guard takes over.
 */
export const PlatformOnly = () => SetMetadata(IS_PLATFORM_KEY, true);

export const ALLOW_INACTIVE_SUBSCRIPTION_KEY = 'auth:allowInactiveSubscription';
/**
 * Lets a route run even when the tenant's subscription has lapsed.
 *
 * Reserved for the handful of endpoints an owner must still reach to fix the
 * situation - reading their own subscription, signing out - and for reads that
 * would otherwise strand them outside their own data.
 */
export const AllowInactiveSubscription = () =>
  SetMetadata(ALLOW_INACTIVE_SUBSCRIPTION_KEY, true);

export const PERMISSIONS_KEY = 'auth:permissions';
/**
 * Declares the permissions a route needs. The caller must hold at least one.
 * Routes never name roles directly - the role/permission matrix lives in
 * `@restaurant-os/types`.
 */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/** Injects the authenticated caller's context. */
export const Ctx = createParamDecorator(
  (_data: unknown, executionContext: ExecutionContext): RequestContext => {
    const request = executionContext.switchToHttp().getRequest<Request>();
    if (!request.ctx) {
      throw AppException.unauthenticated();
    }
    return request.ctx;
  },
);

/** Injects the authenticated platform administrator. */
export const PlatformCtx = createParamDecorator(
  (_data: unknown, executionContext: ExecutionContext): PlatformContext => {
    const request = executionContext.switchToHttp().getRequest<Request>();
    if (!request.platformCtx) {
      throw AppException.unauthenticated();
    }
    return request.platformCtx;
  },
);

/** Injects the customer context resolved from an order tracking token. */
export const CustomerCtx = createParamDecorator(
  (_data: unknown, executionContext: ExecutionContext): CustomerContext => {
    const request = executionContext.switchToHttp().getRequest<Request>();
    if (!request.customerCtx) {
      throw AppException.unauthenticated('لینک پیگیری معتبر نیست.');
    }
    return request.customerCtx;
  },
);

/** Client IP + user agent, used for audit logs and refresh-token binding. */
export const ClientInfo = createParamDecorator(
  (_data: unknown, executionContext: ExecutionContext) => {
    const request = executionContext.switchToHttp().getRequest<Request>();
    const forwarded = request.headers['x-forwarded-for'];
    const ip =
      (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim() ??
      request.socket?.remoteAddress ??
      null;
    return {
      ipAddress: ip,
      userAgent: (request.headers['user-agent'] ?? null)?.toString().slice(0, 300) ?? null,
    };
  },
);
