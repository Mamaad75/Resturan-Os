/**
 * The handle a returning guest is recognised by.
 *
 * The tracking token of their last order, kept per restaurant in this browser.
 * It is the same secret the order-tracking page already uses, so remembering it
 * grants nothing new - it only lets the menu ask "what does this person usually
 * order?" without anyone having to type a phone number, and without the server
 * accepting a phone number as proof of identity.
 *
 * Every access is guarded: private browsing rejects writes, and a guest who
 * clears their storage is simply a first-time visitor again.
 */
const key = (slug: string) => `ros_last_order_${slug}`;

export function rememberLastOrder(slug: string, trackingToken: string): void {
  try {
    window.localStorage.setItem(key(slug), trackingToken);
  } catch {
    // A menu that cannot remember is still a working menu.
  }
}

export function lastOrderToken(slug: string): string | null {
  try {
    const value = window.localStorage.getItem(key(slug));
    // Anything that is not a token is treated as no token at all.
    return value && /^[a-f0-9]{48}$/.test(value) ? value : null;
  } catch {
    return null;
  }
}
