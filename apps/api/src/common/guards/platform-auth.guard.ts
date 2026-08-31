import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ApiErrorCode } from '@restaurant-os/types';
import type { Request } from 'express';
import { APP_CONFIG, type AppConfig } from '../../config/configuration';
import { IS_PLATFORM_KEY, IS_PUBLIC_KEY } from '../decorators/auth.decorators';
import { AppException } from '../exceptions/app.exception';
import type { PlatformTokenPayload } from '../types/request-context';

/** Cookie carrying the platform access token. Distinct name from `ros_access`. */
export const PLATFORM_ACCESS_COOKIE = 'foodos_platform_access';
export const PLATFORM_REFRESH_COOKIE = 'foodos_platform_refresh';

/**
 * Authenticates FoodOS platform administrators.
 *
 * Runs before the tenant guard and, on a `@PlatformOnly()` route, satisfies it:
 * the two identities never mix, so a tenant token can never reach a platform
 * route and a platform token can never be mistaken for a tenant session.
 *
 * The token is signed with a separate secret. That is the part that matters -
 * even a forged tenant token with `scope: "platform"` fails signature
 * verification here.
 */
@Injectable()
export class PlatformAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPlatform = this.reflector.getAllAndOverride<boolean>(IS_PLATFORM_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!isPlatform) return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = extractPlatformToken(request);
    if (!token) throw AppException.unauthenticated();

    let payload: PlatformTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<PlatformTokenPayload>(token, {
        secret: this.config.auth.platformSecret,
      });
    } catch (error) {
      const expired = (error as Error)?.name === 'TokenExpiredError';
      throw new AppException(
        expired ? ApiErrorCode.TOKEN_EXPIRED : ApiErrorCode.TOKEN_INVALID,
        expired ? 'نشست شما منقضی شده است.' : 'توکن دسترسی معتبر نیست.',
        401,
      );
    }

    // Belt and braces: a token signed with the platform secret must also say
    // it is a platform token.
    if (payload.scope !== 'platform') throw AppException.unauthenticated();

    request.platformCtx = {
      adminId: payload.sub,
      email: payload.email,
      fullName: payload.name,
    };
    return true;
  }
}

export function extractPlatformToken(request: Request): string | null {
  const header = request.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim() || null;
  const cookies = (request as Request & { cookies?: Record<string, string> }).cookies;
  return cookies?.[PLATFORM_ACCESS_COOKIE] ?? null;
}
