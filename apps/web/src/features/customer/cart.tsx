'use client';

import type { PublicModifierOption, PublicProduct } from '@restaurant-os/types';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export interface CartLine {
  /** Stable key: same product with the same modifier set stacks together. */
  key: string;
  productId: string;
  nameFa: string;
  imageUrl: string | null;
  unitPrice: number;
  quantity: number;
  notes: string | null;
  modifiers: Array<{ id: string; nameFa: string; priceDelta: number }>;
}

interface CartContextValue {
  lines: CartLine[];
  itemCount: number;
  /** Indicative only - the backend recomputes the real total on submit. */
  estimatedSubtotal: number;
  add: (
    product: PublicProduct,
    modifiers: PublicModifierOption[],
    quantity: number,
    notes?: string | null,
  ) => void;
  setQuantity: (key: string, quantity: number) => void;
  remove: (key: string) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

function lineKey(productId: string, modifierIds: string[], notes: string | null): string {
  return [productId, [...modifierIds].sort().join('+'), notes ?? ''].join('|');
}

/**
 * Cart state lives in the browser only until the customer submits.
 *
 * The prices held here are for display; the server re-prices every line from
 * the live menu when the order is created, so a stale or edited cart can never
 * change what the customer is charged.
 */
export function CartProvider({
  restaurantSlug,
  children,
}: {
  restaurantSlug: string;
  children: ReactNode;
}) {
  const storageKey = `ros_cart_${restaurantSlug}`;
  const [lines, setLines] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Restore a cart the customer left behind (closed tab, took a phone call).
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) setLines(JSON.parse(saved) as CartLine[]);
    } catch {
      // A corrupt or unavailable store just means an empty cart.
    }
    setHydrated(true);
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(lines));
    } catch {
      // Private browsing can reject writes; the cart still works in memory.
    }
  }, [lines, storageKey, hydrated]);

  const add = useCallback<CartContextValue['add']>(
    (product, modifiers, quantity, notes = null) => {
      const modifierIds = modifiers.map((m) => m.id);
      const key = lineKey(product.id, modifierIds, notes ?? null);
      const unitPrice =
        product.effectivePrice + modifiers.reduce((sum, m) => sum + m.priceDelta, 0);

      setLines((current) => {
        const existing = current.find((line) => line.key === key);
        if (existing) {
          return current.map((line) =>
            line.key === key
              ? { ...line, quantity: Math.min(99, line.quantity + quantity) }
              : line,
          );
        }
        return [
          ...current,
          {
            key,
            productId: product.id,
            nameFa: product.nameFa,
            imageUrl: product.imageUrl,
            unitPrice,
            quantity,
            notes: notes ?? null,
            modifiers: modifiers.map((m) => ({
              id: m.id,
              nameFa: m.nameFa,
              priceDelta: m.priceDelta,
            })),
          },
        ];
      });
    },
    [],
  );

  const setQuantity = useCallback((key: string, quantity: number) => {
    setLines((current) =>
      quantity <= 0
        ? current.filter((line) => line.key !== key)
        : current.map((line) =>
            line.key === key ? { ...line, quantity: Math.min(99, quantity) } : line,
          ),
    );
  }, []);

  const remove = useCallback((key: string) => {
    setLines((current) => current.filter((line) => line.key !== key));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const value = useMemo<CartContextValue>(() => {
    const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);
    const estimatedSubtotal = lines.reduce(
      (sum, line) => sum + line.unitPrice * line.quantity,
      0,
    );
    return { lines, itemCount, estimatedSubtotal, add, setQuantity, remove, clear };
  }, [lines, add, setQuantity, remove, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used inside a CartProvider');
  return context;
}
