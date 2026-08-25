import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { permissionsForRole } from '@restaurant-os/types';
import type { Request } from 'express';
import { APP_CONFIG, type AppConfig } from '../../config/configuration';
import { IS_PUBLIC_KEY } from '../decorators/auth.decorators';
import { AppException } from '../exceptions/app.exception';
import type { AccessTokenPayload } from '../types/request-context';
import { ApiErrorCode } from '@restaurant-os/types';

/**
 * Verifies the access token and builds the request context.
 *
 * Registered globally, so a route is protected unless it opts out with
 * `@Public()`. That default-deny posture is deliberate: forgetting a guard
 * should fail closed.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = extractAccessToken(request);
    if (!token) throw AppException.unauthenticated();

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.auth.accessSecret,
      });
    } catch (error) {
      const expired = (error as Error)?.name === 'TokenExpiredError';
      throw new AppException(
        expired ? ApiErrorCode.TOKEN_EXPIRED : ApiErrorCode.TOKEN_INVALID,
        expired ? 'نشست شما منقضی شده است.' : 'توکن دسترسی معتبر نیست.',
        401,
      );
    }

    // The tenant is taken from the signed token and nowhere else.
    request.ctx = {
      userId: payload.sub,
      tenantId: payload.tid,
      branchId: payload.bid ?? null,
      role: payload.role,
      permissions: permissionsForRole(payload.role),
      email: payload.email,
      fullName: payload.name,
    };
    return true;
  }
}

/** Accepts `Authorization: Bearer <token>` or the `ros_access` cookie. */
export function extractAccessToken(request: Request): string | null {
  const header = request.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim() || null;
  const cookies = (request as Request & { cookies?: Record<string, string> }).cookies;
  return cookies?.['ros_access'] ?? null;
}
