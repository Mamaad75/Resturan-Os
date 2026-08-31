import type { CookieOptions, Response } from 'express';
import {
  PLATFORM_ACCESS_COOKIE,
  PLATFORM_REFRESH_COOKIE,
} from '../../common/guards/platform-auth.guard';
import type { AppConfig } from '../../config/configuration';

/**
 * Platform cookies, kept entirely separate from the tenant ones.
 *
 * Different names, and the refresh cookie is scoped to the platform auth path,
 * so a browser signed into both a restaurant and the platform sends each token
 * only where it belongs.
 */
function baseOptions(config: AppConfig): CookieOptions {
  return {
    httpOnly: true,
    secure: config.auth.cookieSecure,
    sameSite: 'lax',
    domain: config.auth.cookieDomain,
    path: '/',
  };
}

export function setPlatformCookies(
  response: Response,
  config: AppConfig,
  accessToken: string,
  refreshToken: string,
): void {
  response.cookie(PLATFORM_ACCESS_COOKIE, accessToken, {
    ...baseOptions(config),
    maxAge: config.auth.accessTtlSeconds * 1000,
  });
  response.cookie(PLATFORM_REFRESH_COOKIE, refreshToken, {
    ...baseOptions(config),
    path: `/${config.apiPrefix}/platform/auth`,
    maxAge: config.auth.refreshTtlDays * 24 * 60 * 60 * 1000,
  });
}

export function clearPlatformCookies(response: Response, config: AppConfig): void {
  response.clearCookie(PLATFORM_ACCESS_COOKIE, baseOptions(config));
  response.clearCookie(PLATFORM_REFRESH_COOKIE, {
    ...baseOptions(config),
    path: `/${config.apiPrefix}/platform/auth`,
  });
}

export { PLATFORM_ACCESS_COOKIE, PLATFORM_REFRESH_COOKIE };
