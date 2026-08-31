import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission } from '@restaurant-os/types';
import type { Request } from 'express';
import {
  IS_PLATFORM_KEY,
  IS_PUBLIC_KEY,
  PERMISSIONS_KEY,
} from '../decorators/auth.decorators';
import { AppException } from '../exceptions/app.exception';

/**
 * Enforces `@RequirePermissions(...)`. Runs after JwtAuthGuard, so the request
 * context is guaranteed present for non-public routes.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // Platform routes are gated by PlatformAuthGuard; the tenant role matrix
    // does not apply to them.
    const isPlatform = this.reflector.getAllAndOverride<boolean>(IS_PLATFORM_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPlatform) return true;

    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const ctx = request.ctx;
    if (!ctx) throw AppException.unauthenticated();

    const granted = required.some((permission) => ctx.permissions.includes(permission));
    if (!granted) {
      throw AppException.forbidden(
        'نقش کاربری شما اجازه انجام این عملیات را ندارد.',
      );
    }
    return true;
  }
}
