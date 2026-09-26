import type { PrismaService } from '../../prisma/prisma.service';
import { runAsSystem } from '../../prisma/tenant-scope';

/**
 * Who a guest is, on the screens where there is no session.
 *
 * The tracking token of one of their own orders is the credential: 48 random
 * characters that already authorise viewing exactly that order, so using it to
 * identify the customer behind it grants nothing new. A phone number is
 * deliberately not accepted anywhere for this - it is guessable, and these
 * screens show a person's habits and their unspent rewards.
 *
 * The token must belong to the restaurant being asked. The same person may eat
 * at two restaurants on this platform, and one of them holding their token must
 * not let it identify them inside the other.
 */
export async function customerFromTrackingToken(
  prisma: PrismaService,
  tenantId: string,
  trackingToken: string,
): Promise<string | null> {
  const order = await runAsSystem('guest identity: resolve tracking token', () =>
    prisma.order.findFirst({
      where: { trackingToken, tenantId },
      select: { customerId: true },
    }),
  );
  return order?.customerId ?? null;
}
