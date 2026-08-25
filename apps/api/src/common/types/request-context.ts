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

/** Identity of a customer reaching a tracking endpoint with an order token. */
export interface CustomerContext {
  orderId: string;
  tenantId: string;
}

declare module 'express' {
  interface Request {
    ctx?: RequestContext;
    customerCtx?: CustomerContext;
  }
}
