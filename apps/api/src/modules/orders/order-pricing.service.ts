import { Injectable } from '@nestjs/common';
import { ApiErrorCode, ModifierGroupType } from '@restaurant-os/types';
import type { CartItemInput } from '@restaurant-os/validation';
import { AppException } from '../../common/exceptions/app.exception';
import { effectivePrice, lineTotal } from '../../common/utils/money.util';
import type { PrismaTransaction } from '../../prisma/prisma.service';

export interface ResolvedModifier {
  modifierOptionId: string;
  name: string;
  nameFa: string;
  priceDelta: number;
}

export interface ResolvedLine {
  productId: string;
  productName: string;
  productNameFa: string;
  imageUrl: string | null;
  quantity: number;
  unitPrice: number;
  modifiersTotal: number;
  lineTotal: number;
  notes: string | null;
  modifiers: ResolvedModifier[];
  preparationMinutes: number | null;
}

/**
 * Turns a client cart into priced order lines.
 *
 * The client sends product ids, quantities and chosen modifier ids - nothing
 * else. Every price, every modifier surcharge and every total is looked up
 * from the live menu here, so a tampered request simply cannot buy a burger
 * for one Toman.
 */
@Injectable()
export class OrderPricingService {
  async resolveLines(
    tx: PrismaTransaction,
    tenantId: string,
    menuId: string,
    items: CartItemInput[],
  ): Promise<ResolvedLine[]> {
    const productIds = [...new Set(items.map((item) => item.productId))];

    const products = await tx.product.findMany({
      where: {
        tenantId,
        id: { in: productIds },
        // Scoping to the menu prevents ordering a product that belongs to a
        // different branch of the same tenant.
        category: { menuId },
      },
      include: {
        modifierGroups: { include: { options: true } },
      },
    });

    const byId = new Map(products.map((product) => [product.id, product]));

    for (const productId of productIds) {
      const product = byId.get(productId);
      if (!product) {
        throw AppException.notFound('یکی از محصولات انتخاب‌شده');
      }
      if (!product.isAvailable) {
        throw new AppException(
          ApiErrorCode.PRODUCT_UNAVAILABLE,
          `«${product.nameFa}» در حال حاضر موجود نیست.`,
          409,
        );
      }
    }

    return items.map((item) => {
      const product = byId.get(item.productId)!;
      const selectedIds = new Set(item.modifierOptionIds);

      // Index every option this product legitimately offers.
      const optionIndex = new Map<
        string,
        { option: (typeof product.modifierGroups)[number]['options'][number]; groupId: string }
      >();
      for (const group of product.modifierGroups) {
        for (const option of group.options) {
          optionIndex.set(option.id, { option, groupId: group.id });
        }
      }

      // Reject any option that does not belong to this product at all.
      for (const optionId of selectedIds) {
        if (!optionIndex.has(optionId)) {
          throw new AppException(
            ApiErrorCode.MODIFIER_INVALID,
            `گزینه انتخاب‌شده برای «${product.nameFa}» معتبر نیست.`,
            422,
          );
        }
      }

      const modifiers: ResolvedModifier[] = [];
      for (const group of product.modifierGroups) {
        const chosen = group.options.filter((option) => selectedIds.has(option.id));

        for (const option of chosen) {
          if (!option.isAvailable) {
            throw new AppException(
              ApiErrorCode.MODIFIER_INVALID,
              `گزینه «${option.nameFa}» در حال حاضر موجود نیست.`,
              409,
            );
          }
        }

        if (group.isRequired && chosen.length < Math.max(group.minSelect, 1)) {
          throw new AppException(
            ApiErrorCode.MODIFIER_INVALID,
            `انتخاب «${group.nameFa}» برای «${product.nameFa}» الزامی است.`,
            422,
          );
        }
        if (chosen.length < group.minSelect) {
          throw new AppException(
            ApiErrorCode.MODIFIER_INVALID,
            `برای «${group.nameFa}» حداقل ${group.minSelect} گزینه انتخاب کنید.`,
            422,
          );
        }
        const maxSelect =
          group.type === ModifierGroupType.SINGLE ? 1 : group.maxSelect;
        if (chosen.length > maxSelect) {
          throw new AppException(
            ApiErrorCode.MODIFIER_INVALID,
            `برای «${group.nameFa}» حداکثر ${maxSelect} گزینه قابل انتخاب است.`,
            422,
          );
        }

        for (const option of chosen) {
          modifiers.push({
            modifierOptionId: option.id,
            name: option.name,
            nameFa: option.nameFa,
            priceDelta: option.priceDelta,
          });
        }
      }

      const unitPrice = effectivePrice(product.price, product.discountPrice);
      const modifiersTotal = modifiers.reduce((sum, m) => sum + m.priceDelta, 0);

      return {
        productId: product.id,
        productName: product.name,
        productNameFa: product.nameFa,
        imageUrl: product.imageUrl,
        quantity: item.quantity,
        unitPrice,
        modifiersTotal,
        lineTotal: lineTotal({ quantity: item.quantity, unitPrice, modifiersTotal }),
        notes: item.notes ?? null,
        modifiers,
        preparationMinutes: product.preparationMinutes,
      };
    });
  }
}
