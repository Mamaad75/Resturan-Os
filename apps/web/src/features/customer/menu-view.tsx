'use client';

import type { PublicMenu, PublicProduct } from '@restaurant-os/types';
import { MapPin, Phone, ShoppingBag, Sparkles, UtensilsCrossed } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, EmptyState } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatMoney, toPersianDigits } from '@/lib/format';
import { CartProvider, useCart } from './cart';
import { CheckoutSheet } from './checkout-sheet';
import { ProductSheet } from './product-sheet';

export function MenuView({ menu, slug }: { menu: PublicMenu; slug: string }) {
  return (
    <CartProvider restaurantSlug={slug}>
      <MenuScreen menu={menu} slug={slug} />
    </CartProvider>
  );
}

function MenuScreen({ menu, slug }: { menu: PublicMenu; slug: string }) {
  const { restaurant, categories } = menu;
  const cart = useCart();
  const [activeCategory, setActiveCategory] = useState(categories[0]?.id ?? '');
  const [selectedProduct, setSelectedProduct] = useState<PublicProduct | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const chipRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const featured = useMemo(
    () =>
      categories
        .flatMap((category) => category.products)
        .filter((product) => product.isFeatured && product.isAvailable)
        .slice(0, 6),
    [categories],
  );

  /*
   * Scroll spy: highlight the category whose section is under the sticky
   * header. `rootMargin` accounts for the header + chip rail so the chip flips
   * exactly when the heading reaches them.
   */
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target.id) {
          setActiveCategory(visible[0].target.id);
        }
      },
      { rootMargin: '-140px 0px -65% 0px', threshold: 0 },
    );

    for (const section of Object.values(sectionRefs.current)) {
      if (section) observer.observe(section);
    }
    return () => observer.disconnect();
  }, [categories]);

  // Keep the active chip in view as the customer scrolls the page.
  useEffect(() => {
    chipRefs.current[activeCategory]?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    });
  }, [activeCategory]);

  function scrollToCategory(categoryId: string) {
    sectionRefs.current[categoryId]?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }

  return (
    <div
      className="min-h-dvh bg-canvas pb-28"
      data-theme={restaurant.branding.theme === 'light' ? 'light' : undefined}
      style={
        {
          // The restaurant's own accent colour drives the whole page.
          '--gold': hexToRgbChannels(restaurant.branding.accentColor) ?? undefined,
        } as React.CSSProperties
      }
    >
      <RestaurantHeader restaurant={restaurant} />

      {/* Sticky category rail */}
      {categories.length > 0 ? (
        <nav
          aria-label="دسته‌بندی‌ها"
          className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur-xl"
        >
          <div className="no-scrollbar mx-auto flex max-w-3xl gap-2 overflow-x-auto px-4 py-3">
            {categories.map((category) => (
              <button
                key={category.id}
                ref={(el) => {
                  chipRefs.current[category.id] = el;
                }}
                onClick={() => scrollToCategory(category.id)}
                aria-current={activeCategory === category.id}
                className={cn(
                  'shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors',
                  activeCategory === category.id
                    ? 'bg-gold text-ink-inverse'
                    : 'bg-surface-raised text-ink-muted hover:text-ink',
                )}
              >
                {category.nameFa}
              </button>
            ))}
          </div>
        </nav>
      ) : null}

      <main className="mx-auto max-w-3xl px-4">
        {categories.length === 0 ? (
          <EmptyState
            icon={<UtensilsCrossed className="size-6" />}
            title="منو هنوز آماده نیست"
            description="این رستوران هنوز محصولی به منوی خود اضافه نکرده است."
            className="mt-10"
          />
        ) : null}

        {featured.length > 0 ? (
          <section className="pt-6" aria-labelledby="featured-heading">
            <h2
              id="featured-heading"
              className="gold-rule mb-4 flex items-center gap-2 text-lg font-bold text-ink"
            >
              <Sparkles className="size-4 text-gold" />
              پیشنهاد ویژه
            </h2>
            <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-2">
              {featured.map((product) => (
                <button
                  key={product.id}
                  onClick={() => setSelectedProduct(product)}
                  className="group w-40 shrink-0 overflow-hidden rounded-2xl border border-line bg-surface text-start transition-colors hover:border-gold/40"
                >
                  <div className="relative aspect-square bg-surface-sunken">
                    {product.imageUrl ? (
                      <Image
                        src={product.imageUrl}
                        alt={product.nameFa}
                        fill
                        sizes="160px"
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <PlaceholderArt />
                    )}
                  </div>
                  <div className="p-3">
                    <p className="truncate text-sm font-medium text-ink">
                      {product.nameFa}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-gold">
                      {formatMoney(product.effectivePrice, 'IRT', { withUnit: false })}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {categories.map((category) => (
          <section
            key={category.id}
            id={category.id}
            ref={(el) => {
              sectionRefs.current[category.id] = el;
            }}
            className="scroll-mt-32 pt-8"
            aria-labelledby={`heading-${category.id}`}
          >
            <h2
              id={`heading-${category.id}`}
              className="gold-rule mb-4 text-lg font-bold text-ink"
            >
              {category.nameFa}
            </h2>
            <div className="space-y-3">
              {category.products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onSelect={() => setSelectedProduct(product)}
                />
              ))}
            </div>
          </section>
        ))}
      </main>

      {/* Floating cart */}
      {cart.itemCount > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-40 p-4">
          <button
            onClick={() => setCheckoutOpen(true)}
            className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 rounded-2xl bg-gold px-5 py-4 text-ink-inverse shadow-lifted transition-transform active:scale-[0.99]"
          >
            <span className="flex items-center gap-2.5 font-semibold">
              <span className="flex size-7 items-center justify-center rounded-full bg-black/15 text-sm tabular-nums">
                {toPersianDigits(cart.itemCount)}
              </span>
              مشاهده سبد خرید
            </span>
            <span className="font-bold">{formatMoney(cart.estimatedSubtotal)}</span>
          </button>
        </div>
      ) : null}

      <ProductSheet
        product={selectedProduct}
        open={selectedProduct !== null}
        onClose={() => setSelectedProduct(null)}
      />
      <CheckoutSheet
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        restaurant={restaurant}
        slug={slug}
      />
    </div>
  );
}

function RestaurantHeader({ restaurant }: { restaurant: PublicMenu['restaurant'] }) {
  return (
    <header className="relative">
      <div className="relative h-44 overflow-hidden bg-surface-sunken sm:h-56">
        {restaurant.branding.coverUrl ? (
          <Image
            src={restaurant.branding.coverUrl}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        ) : (
          <div className="size-full bg-[radial-gradient(120%_100%_at_50%_0%,rgb(var(--gold)/0.18),transparent_70%)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-canvas via-canvas/55 to-transparent" />
      </div>

      {/*
        `relative` is load-bearing: the cover's gradient overlay is absolutely
        positioned, and positioned elements paint above static siblings no
        matter the DOM order. Without this the overlay covers the restaurant
        name, which sits inside the cover's height because of the -mt-14 pull.
      */}
      <div className="relative z-10 mx-auto -mt-14 max-w-3xl px-4">
        <div className="flex items-end gap-4">
          <div className="relative size-20 shrink-0 overflow-hidden rounded-2xl border-2 border-canvas bg-surface-raised shadow-lifted">
            {restaurant.branding.logoUrl ? (
              <Image
                src={restaurant.branding.logoUrl}
                alt={restaurant.name}
                fill
                sizes="80px"
                className="object-cover"
              />
            ) : (
              <div className="flex size-full items-center justify-center text-2xl font-bold text-gold">
                {restaurant.name.charAt(0)}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 pb-1">
            <h1 className="truncate text-xl font-bold text-ink sm:text-2xl">
              {restaurant.name}
            </h1>
            {restaurant.branding.tagline ? (
              <p className="truncate text-sm text-ink-muted">
                {restaurant.branding.tagline}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {restaurant.table ? (
            <Badge tone="gold" dot>
              میز {toPersianDigits(restaurant.table.number)}
            </Badge>
          ) : null}
          <Badge tone={restaurant.branch.isOpen ? 'positive' : 'critical'} dot>
            {restaurant.branch.isOpen ? 'باز است' : 'بسته است'}
          </Badge>
          {restaurant.settings.estimatedPrepMinutes ? (
            <Badge tone="neutral">
              آماده‌سازی حدود {toPersianDigits(restaurant.settings.estimatedPrepMinutes)}{' '}
              دقیقه
            </Badge>
          ) : null}
        </div>

        {restaurant.branch.address || restaurant.branch.phone ? (
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-ink-subtle">
            {restaurant.branch.address ? (
              <span className="flex items-center gap-1.5">
                <MapPin className="size-3.5" />
                {restaurant.branch.address}
              </span>
            ) : null}
            {restaurant.branch.phone ? (
              <a
                href={`tel:${restaurant.branch.phone}`}
                className="flex items-center gap-1.5 hover:text-ink"
              >
                <Phone className="size-3.5" />
                <span className="ltr-nums">
                  {toPersianDigits(restaurant.branch.phone)}
                </span>
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
    </header>
  );
}

function ProductCard({
  product,
  onSelect,
}: {
  product: PublicProduct;
  onSelect: () => void;
}) {
  const hasDiscount =
    product.discountPrice != null && product.discountPrice < product.price;

  return (
    <button
      onClick={product.isAvailable ? onSelect : undefined}
      disabled={!product.isAvailable}
      className={cn(
        'group flex w-full gap-4 rounded-2xl border border-line bg-surface p-3 text-start transition-colors',
        product.isAvailable
          ? 'hover:border-gold/40'
          : 'cursor-not-allowed opacity-55',
      )}
    >
      <div className="min-w-0 flex-1 py-1">
        <div className="flex items-start gap-2">
          <h3 className="min-w-0 flex-1 truncate font-medium text-ink">
            {product.nameFa}
          </h3>
          {!product.isAvailable ? (
            <span className="shrink-0 rounded-md bg-surface-raised px-2 py-0.5 text-[0.7rem] text-ink-subtle">
              ناموجود
            </span>
          ) : null}
        </div>

        {product.descriptionFa ? (
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-muted">
            {product.descriptionFa}
          </p>
        ) : null}

        <div className="mt-2.5 flex items-baseline gap-2">
          <span className="font-semibold text-gold">
            {formatMoney(product.effectivePrice, 'IRT', { withUnit: false })}
          </span>
          <span className="text-xs text-ink-subtle">تومان</span>
          {hasDiscount ? (
            <span className="text-xs text-ink-subtle line-through">
              {formatMoney(product.price, 'IRT', { withUnit: false })}
            </span>
          ) : null}
        </div>
      </div>

      <div className="relative size-24 shrink-0 overflow-hidden rounded-xl bg-surface-sunken">
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.nameFa}
            fill
            sizes="96px"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <PlaceholderArt />
        )}
        {product.isAvailable ? (
          <span className="absolute bottom-1.5 end-1.5 flex size-7 items-center justify-center rounded-lg bg-gold text-ink-inverse shadow">
            <ShoppingBag className="size-3.5" />
          </span>
        ) : null}
      </div>
    </button>
  );
}

/** Fallback art so a product without a photo still looks intentional. */
function PlaceholderArt() {
  return (
    <div className="flex size-full items-center justify-center bg-[radial-gradient(100%_100%_at_50%_0%,rgb(var(--gold)/0.14),transparent)]">
      <UtensilsCrossed className="size-6 text-ink-subtle" />
    </div>
  );
}

/** "#C9A24B" -> "201 162 75", the channel form the CSS tokens expect. */
function hexToRgbChannels(hex: string): string | null {
  const match = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim());
  if (!match) return null;
  let value = match[1];
  if (value.length === 3) {
    value = value
      .split('')
      .map((char) => char + char)
      .join('');
  }
  const int = Number.parseInt(value, 16);
  return `${(int >> 16) & 255} ${(int >> 8) & 255} ${int & 255}`;
}
