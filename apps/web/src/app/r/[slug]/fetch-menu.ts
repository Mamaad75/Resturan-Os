import type { ApiResponse, PublicMenu } from '@restaurant-os/types';
import { API_BASE } from '@/lib/api-client';

/**
 * Server-side menu fetch.
 *
 * Deliberately uncached: a price change or a sold-out item must be visible on
 * the very next scan, which is the whole promise of a dynamic QR code.
 */
export async function fetchPublicMenu(
  slug: string,
  table?: number,
): Promise<PublicMenu | null> {
  const url = new URL(`${API_BASE}/public/restaurants/${slug}/menu`);
  if (table !== undefined) url.searchParams.set('table', String(table));

  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return null;
    const payload = (await response.json()) as ApiResponse<PublicMenu>;
    return payload.success ? payload.data : null;
  } catch {
    // The API being unreachable renders the not-found page rather than a crash.
    return null;
  }
}
