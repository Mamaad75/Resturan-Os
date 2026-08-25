import type { CookieOptions, Response } from 'express';
import type { AppConfig } from '../../config/configuration';

export const ACCESS_COOKIE = 'ros_access';
export const REFRESH_COOKIE = 'ros_refresh';

/**
 * Both tokens live in httpOnly cookies so page loads are authenticated without
 * the frontend ever putting a token in localStorage (where any XSS could read
 * it). The access token is additionally returned in the login response body,
 * because the WebSocket handshake needs to send it explicitly.
 */
function baseOptions(config: AppConfig): CookieOptions {
  return {
    httpOnly: true,
    secure: config.auth.cookieSecure,
    // Lax is sufficient: the API and the app are served from the same site in
    // both development (localhost) and the documented production layout.
    sameSite: 'lax',
    domain: config.auth.cookieDomain,
    path: '/',
  };
}

export function setAuthCookies(
  response: Response,
  config: AppConfig,
  accessToken: string,
  refreshToken: string,
): void {
  response.cookie(ACCESS_COOKIE, accessToken, {
    ...baseOptions(config),
    maxAge: config.auth.accessTtlSeconds * 1000,
  });
  response.cookie(REFRESH_COOKIE, refreshToken, {
    ...baseOptions(config),
    // Scoped to the auth routes: no other endpoint ever needs to see it.
    path: `/${config.apiPrefix}/auth`,
    maxAge: config.auth.refreshTtlDays * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookies(response: Response, config: AppConfig): void {
  response.clearCookie(ACCESS_COOKIE, baseOptions(config));
  response.clearCookie(REFRESH_COOKIE, {
    ...baseOptions(config),
    path: `/${config.apiPrefix}/auth`,
  });
}
