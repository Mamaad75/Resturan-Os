import { Prisma } from '@prisma/client';
import type {
  PublicCategory,
  PublicModifierGroup,
  PublicProduct,
} from '@restaurant-os/types';
import { effectivePrice } from '../../common/utils/money.util';

interface ModifierOptionRow {
  id: string;
  name: string;
  nameFa: string;
  priceDelta: number;
  isAvailable: boolean;
  displayOrder: number;
}

interface ModifierGroupRow {
  id: string;
  name: string;
  nameFa: string;
  type: string;
  isRequired: boolean;
  minSelect: number;
  maxSelect: number;
  displayOrder: number;
  options: ModifierOptionRow[];
}

interface ProductRow {
  id: string;
  name: string;
  nameFa: string;
  description: string | null;
  descriptionFa: string | null;
  imageUrl: string | null;
  price: number;
  discountPrice: number | null;
  isAvailable: boolean;
  isFeatured: boolean;
  displayOrder: number;
  categoryId: string;
  preparationMinutes: number | null;
  calories: number | null;
  modifierGroups?: ModifierGroupRow[];
}

interface CategoryRow {
  id: string;
  name: string;
  nameFa: string;
  description: string | null;
  imageUrl: string | null;
  displayOrder: number;
  products?: ProductRow[];
}

export function toPublicModifierGroup(row: ModifierGroupRow): PublicModifierGroup {
  return {
    id: row.id,
    name: row.name,
    nameFa: row.nameFa,
    type: row.type as PublicModifierGroup['type'],
    isRequired: row.isRequired,
    minSelect: row.minSelect,
    maxSelect: row.maxSelect,
    displayOrder: row.displayOrder,
    options: row.options.map((option) => ({
      id: option.id,
      name: option.name,
      nameFa: option.nameFa,
      priceDelta: option.priceDelta,
      isAvailable: option.isAvailable,
      displayOrder: option.displayOrder,
    })),
  };
}

export function toPublicProduct(row: ProductRow): PublicProduct {
  return {
    id: row.id,
    name: row.name,
    nameFa: row.nameFa,
    description: row.description,
    descriptionFa: row.descriptionFa,
    imageUrl: row.imageUrl,
    price: row.price,
    discountPrice: row.discountPrice,
    // Computed server-side so the customer app never has to reason about which
    // of the two prices applies.
    effectivePrice: effectivePrice(row.price, row.discountPrice),
    isAvailable: row.isAvailable,
    isFeatured: row.isFeatured,
    displayOrder: row.displayOrder,
    categoryId: row.categoryId,
    preparationMinutes: row.preparationMinutes,
    calories: row.calories,
    modifierGroups: (row.modifierGroups ?? []).map(toPublicModifierGroup),
  };
}

export function toPublicCategory(row: CategoryRow): PublicCategory {
  return {
    id: row.id,
    name: row.name,
    nameFa: row.nameFa,
    description: row.description,
    imageUrl: row.imageUrl,
    displayOrder: row.displayOrder,
    products: (row.products ?? []).map(toPublicProduct),
  };
}

/**
 * Prisma include tree that produces everything the mappers above need.
 * `Prisma.validator` keeps the literal types Prisma needs for result inference
 * without the readonly arrays that `as const` would produce.
 */
export const MENU_INCLUDE = Prisma.validator<Prisma.CategoryInclude>()({
  products: {
    orderBy: [{ displayOrder: 'asc' }, { nameFa: 'asc' }],
    include: {
      modifierGroups: {
        orderBy: { displayOrder: 'asc' },
        include: { options: { orderBy: { displayOrder: 'asc' } } },
      },
    },
  },
});
