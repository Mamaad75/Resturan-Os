/**
 * Rate-limit tiers.
 *
 * A named throttler in @nestjs/throttler applies to *every* route unless it is
 * explicitly skipped, so configuring a strict "auth" throttler globally would
 * rate limit the whole API at the login rate. Instead there is a single global
 * throttler, and sensitive routes override it per-handler with a tighter
 * budget using this constant.
 *
 * Read from the environment at class-definition time because decorator
 * arguments are evaluated before the DI container exists.
 */
const AUTH_LIMIT = Number(process.env.THROTTLE_AUTH_LIMIT ?? 10);
const PUBLIC_ORDER_LIMIT = Number(process.env.THROTTLE_PUBLIC_ORDER_LIMIT ?? 12);

/** Login and other credential-checking endpoints. */
export const AUTH_THROTTLE = {
  default: { limit: Number.isFinite(AUTH_LIMIT) ? AUTH_LIMIT : 10, ttl: 60_000 },
};

/** Anonymous order submission from the QR menu. */
export const PUBLIC_ORDER_THROTTLE = {
  default: {
    limit: Number.isFinite(PUBLIC_ORDER_LIMIT) ? PUBLIC_ORDER_LIMIT : 12,
    ttl: 60_000,
  },
};

/** The public menu is read-heavy by design; only abusive scraping is blocked. */
export const PUBLIC_MENU_THROTTLE = {
  default: { limit: 240, ttl: 60_000 },
};
