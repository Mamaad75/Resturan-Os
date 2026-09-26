import { Inject, Injectable } from '@nestjs/common';
import { OrderStatus } from '@restaurant-os/types';
import { customerFromTrackingToken } from '../../common/utils/guest-identity';
import { PRISMA, type PrismaService } from '../../prisma/prisma.service';
import { runAsSystem } from '../../prisma/tenant-scope';
import { pickUsualOrder, type HistoricOrder } from './usual-order';

/** The usual order, resolved against nothing but what the guest already holds. */
export interface UsualOrderDto {
  /** How many of the recent orders were this exact basket. */
  repeatCount: number;
  lastOrderedAt: string;
  /**
   * Ids only. The browser already holds the live menu, so names, prices and
   * availability are resolved there - a usual order can never quote a price
   * that has since changed, because it quotes no price at all.
   */
  lines: Array<{
    productId: string;
    quantity: number;
    modifierOptionIds: string[];
  }>;
}

/**
 * "Your usual" at the top of the menu.
 *
 * Identity comes from a tracking token the guest already has from a previous
 * order, not from a phone number typed into a query string: the token is a
 * 48-character secret that already authorises exactly one order, so it proves
 * possession without letting anyone read a stranger's habits by guessing at
 * phone numbers.
 *
 * How many past orders to look at is a judgement, not a setting. Ten covers a
 * few weeks for a daily regular and a year for an occasional visitor, which is
 * the right horizon in both cases: a habit from last spring is not the usual.
 */
@Injectable()
export class RegularsService {
  private static readonly HISTORY_DEPTH = 10;

  constructor(@Inject(PRISMA) private readonly prisma: PrismaService) {}

  async usualOrder(
    tenantId: string,
    trackingToken: string,
  ): Promise<UsualOrderDto | null> {
    const customerId = await customerFromTrackingToken(
      this.prisma,
      tenantId,
      trackingToken,
    );
    if (!customerId) return null;

    const rows = await runAsSystem('usual order: customer history', () =>
      this.prisma.order.findMany({
        where: {
          tenantId,
          customerId,
          // A cancelled order is not a habit, and a basket still being
          // assembled at the counter is not one yet either.
          status: { notIn: [OrderStatus.CANCELLED] },
        },
        orderBy: { createdAt: 'desc' },
        take: RegularsService.HISTORY_DEPTH,
        select: {
          id: true,
          createdAt: true,
          items: {
            select: {
              productId: true,
              quantity: true,
              modifiers: { select: { modifierOptionId: true } },
            },
          },
        },
      }),
    );

    const history: HistoricOrder[] = rows.map((row) => ({
      id: row.id,
      placedAt: row.createdAt,
      lines: row.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        modifierOptionIds: item.modifiers
          .map((modifier) => modifier.modifierOptionId)
          .filter((id): id is string => id != null),
      })),
    }));

    const usual = pickUsualOrder(history);
    if (!usual) return null;

    return {
      repeatCount: usual.repeatCount,
      lastOrderedAt: usual.lastOrderedAt.toISOString(),
      lines: usual.lines.map((line) => ({
        // pickUsualOrder only returns baskets whose products all survive.
        productId: line.productId!,
        quantity: line.quantity,
        modifierOptionIds: line.modifierOptionIds,
      })),
    };
  }
}
