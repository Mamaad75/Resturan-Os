import type { Permission, UserRole } from '@restaurant-os/types';

/**
 * The authenticated caller's identity, derived exclusively from the verified
 * access token. Nothing here is ever read from a request body, query string or
 * header supplied by the client - that is what makes tenant isolation hold.
 */
export interface RequestContext {
  userId: string;
  tenantId: string;
  /** The branch the session is pinned to; null means "all branches in tenant". */
  branchId: string | null;
  role: UserRole;
  permissions: Permission[];
  email: string;
  fullName: string;
}

/** JWT access-token payload. Kept small; permissions are re-derived from role. */
export interface AccessTokenPayload {
  sub: string;
  tid: string;
  bid: string | null;
  role: UserRole;
  email: string;
  name: string;
}

/**
 * A FoodOS platform administrator.
 *
 * Deliberately has no `tenantId`: platform routes work across tenants, and
 * giving this shape a tenant field would invite code to use it as if it were a
 * `RequestContext` and silently scope a platform query to one tenant.
 */
export interface PlatformContext {
  adminId: string;
  email: string;
  fullName: string;
}

/** Platform access-token payload. `scope` is what separates it from a tenant token. */
export interface PlatformTokenPayload {
  sub: string;
  scope: 'platform';
  email: string;
  name: string;
}

/** Identity of a customer reaching a tracking endpoint with an order token. */
export interface CustomerContext {
  orderId: string;
  tenantId: string;
}

declare module 'express' {
  interface Request {
    ctx?: RequestContext;
    platformCtx?: PlatformContext;
    customerCtx?: CustomerContext;
  }
}
