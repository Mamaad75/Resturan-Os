import { Inject, Injectable } from '@nestjs/common';
import type {
  CheckoutOfferInput,
  UpdateCheckoutOfferInput,
} from '@restaurant-os/validation';
import { AppException } from '../../common/exceptions/app.exception';
import type { RequestContext } from '../../common/types/request-context';
import {
  PRISMA,
  type PrismaService,
  type PrismaTransaction,
} from '../../prisma/prisma.service';
import { runAsSystem } from '../../prisma/tenant-scope';
import {
  defaultOfferTitle,
  offerDiscountForOrder,
  offerPrice,
} from './offers.math';

/** What the guest is shown, with the price already worked out. */
export interface PublicOffer {
  id: string;
  title: string;
  productId: string;
  productNameFa: string;
  imageUrl: string | null;
  /** Normal price of one unit. */
  price: number;
  /** Price after the offer's discount, for one unit. */
  offerPrice: number;
  discountBps: number;
  endsAt: string;
}

/**
 * The offer a guest sees just before paying.
 *
 * Deliberately one offer, not a carousel: a single "add a croissant for 20%
 * less" is a decision, and five of them are an advertisement people close.
 * The discount is applied server-side when the item is added, so the popup
 * can never be the thing that sets a price.
 */
@Injectable()
export class OffersService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaService) {}

  /* ---------------------------------------------------------------- admin */

  async list(ctx: RequestContext) {
    const rows = await this.prisma.checkoutOffer.findMany({
      where: { tenantId: ctx.tenantId },
      include: {
        product: { select: { id: true, nameFa: true, price: true, imageUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => ({
      id: row.id,
      productId: row.productId,
      productNameFa: row.product.nameFa,
      title: row.title,
      discountBps: row.discountBps,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      isActive: row.isActive,
      shownCount: row.shownCount,
      acceptedCount: row.acceptedCount,
      /** Live right now, which is not the same as merely being active. */
      isLive:
        row.isActive && row.startsAt <= new Date() && row.endsAt > new Date(),
    }));
  }

  async create(ctx: RequestContext, input: CheckoutOfferInput) {
    const product = await this.prisma.product.findFirst({
      where: { id: input.productId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!product) throw AppException.notFound('محصول');

    const startsAt = input.startsAt ? new Date(input.startsAt) : new Date();
    const row = await this.prisma.checkoutOffer.create({
      data: {
        tenantId: ctx.tenantId,
        productId: input.productId,
        title: input.title ?? null,
        discountBps: input.discountBps,
        startsAt,
        // Days, not a date: an owner thinks "run it for a week".
        endsAt: new Date(startsAt.getTime() + input.days * 86_400_000),
        isActive: input.isActive ?? true,
      },
    });
    return row;
  }

  async update(ctx: RequestContext, id: string, input: UpdateCheckoutOfferInput) {
    const existing = await this.prisma.checkoutOffer.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!existing) throw AppException.notFound('پیشنهاد');

    const startsAt = input.startsAt ? new Date(input.startsAt) : existing.startsAt;
    return this.prisma.checkoutOffer.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.discountBps !== undefined
          ? { discountBps: input.discountBps }
          : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.startsAt !== undefined ? { startsAt } : {}),
        ...(input.days !== undefined
          ? { endsAt: new Date(startsAt.getTime() + input.days * 86_400_000) }
          : {}),
      },
    });
  }

  async remove(ctx: RequestContext, id: string) {
    const existing = await this.prisma.checkoutOffer.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!existing) throw AppException.notFound('پیشنهاد');
    await this.prisma.checkoutOffer.delete({ where: { id } });
    return { deleted: true };
  }

  /* ---------------------------------------------------------------- guest */

  /**
   * The live offer for a restaurant, if there is one.
   *
   * Cross-tenant by nature: the caller is an anonymous guest and the slug is
   * what identifies the tenant, so the lookup is wrapped rather than filtered.
   * An offer whose product has gone unavailable is skipped - nothing is worse
   * than a popup for something the kitchen cannot make.
   */
  async liveOffer(tenantId: string, excludeProductIds: string[] = []) {
    const now = new Date();
    const row = await runAsSystem('public checkout offer', () =>
      this.prisma.checkoutOffer.findFirst({
        where: {
          tenantId,
          isActive: true,
          startsAt: { lte: now },
          endsAt: { gt: now },
          productId: { notIn: excludeProductIds },
          product: { isAvailable: true },
        },
        include: {
          product: {
            select: { id: true, nameFa: true, price: true, discountPrice: true, imageUrl: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    );
    if (!row) return null;

    // The same base the pricing service will use when the order is submitted:
    // an item already on sale is discounted from its sale price, not from the
    // price it used to have.
    const base = row.product.discountPrice ?? row.product.price;

    await runAsSystem('offer impression', () =>
      this.prisma.checkoutOffer.update({
        where: { id: row.id },
        data: { shownCount: { increment: 1 } },
      }),
    );

    const offer: PublicOffer = {
      id: row.id,
      title: row.title ?? defaultOfferTitle(row.product.nameFa, row.discountBps),
      productId: row.product.id,
      productNameFa: row.product.nameFa,
      imageUrl: row.product.imageUrl,
      price: base,
      offerPrice: offerPrice(base, row.discountBps),
      discountBps: row.discountBps,
      endsAt: row.endsAt.toISOString(),
    };
    return offer;
  }

  /**
   * The discount an accepted offer is worth on an order.
   *
   * Re-read here rather than trusted from the request: the popup tells the
   * guest a price, and this decides it. Reads on the caller's transaction so
   * the offer that priced the order is the offer that was live when it landed,
   * and so a rolled-back order leaves no trace of having taken one.
   *
   * The tenant filter is what makes this safe on the anonymous path: an offer
   * id from another restaurant simply finds nothing and is worth zero.
   */
  async discountFor(
    tx: PrismaTransaction,
    tenantId: string,
    offerId: string,
    lines: Array<{ productId: string | null; quantity: number; unitPrice: number }>,
  ): Promise<number> {
    const now = new Date();
    const offer = await tx.checkoutOffer.findFirst({
      where: {
        id: offerId,
        tenantId,
        isActive: true,
        startsAt: { lte: now },
        endsAt: { gt: now },
      },
      select: { productId: true, discountBps: true },
    });
    if (!offer) return 0;
    return offerDiscountForOrder(offer, lines);
  }

  /**
   * Recorded when an offer actually priced an order, so its worth can be
   * judged against how often it was shown.
   */
  async markAccepted(
    tx: PrismaTransaction,
    tenantId: string,
    offerId: string,
  ): Promise<void> {
    await tx.checkoutOffer.updateMany({
      where: { id: offerId, tenantId },
      data: { acceptedCount: { increment: 1 } },
    });
  }
}
