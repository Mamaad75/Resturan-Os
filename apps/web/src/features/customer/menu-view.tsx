'use client';

import {
  menuTemplateSpec,
  type PublicMenu,
  type PublicProduct,
} from '@restaurant-os/types';
import { MapPin, Phone, ShoppingBag, Sparkles, UtensilsCrossed } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, EmptyState } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatMoney, toPersianDigits } from '@/lib/format';
import { CartProvider, useCart } from './cart';
import {
  effectiveLayout,
  hexToRgbChannels,
  templateStyles,
  type TemplateStyles,
} from './menu-templates';
import { CheckoutSheet } from './checkout-sheet';
import { ProductSheet } from './product-sheet';
import { WaiterCallButton } from './waiter-call';

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
  // One source of truth for the look: the admin preview resolves the same
  // spec through the same helper.
  const spec = menuTemplateSpec(restaurant.branding.menuTemplate);
  const styles = templateStyles(spec);
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
      data-menu-template={spec.id}
      style={
        {
          // The restaurant's own accent colour drives the whole page.
          '--gold': hexToRgbChannels(restaurant.branding.accentColor) ?? undefined,
        } as React.CSSProperties
      }
    >
      <RestaurantHeader restaurant={restaurant} slug={slug} styles={styles} />

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
                  activeCategory === category.id ? styles.chipActive : styles.chipIdle,
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

        {featured.length > 0 && spec.showFeaturedRail ? (
          <section className="pt-6" aria-labelledby="featured-heading">
            <h2
              id="featured-heading"
              className={cn('flex items-center gap-2', styles.heading)}
            >
              <Sparkles className="size-4 text-gold" />
              پیشنهاد ویژه
            </h2>
            <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-2">
              {featured.map((product) => (
                <button
                  key={product.id}
                  onClick={() => setSelectedProduct(product)}
                  className={cn(
                    'group w-40 shrink-0 overflow-hidden border border-line bg-surface text-start transition-colors hover:border-gold/40',
                    styles.radius,
                  )}
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

        {categories.map((category) => {
          // Resolved per section: a category nobody has photographed renders
          // as a list even under a photo-led template.
          const sectionStyles = templateStyles(
            spec,
            effectiveLayout(
              spec,
              category.products.some((product) => product.imageUrl != null),
            ),
          );
          return (
            <section
              key={category.id}
              id={category.id}
              ref={(el) => {
                sectionRefs.current[category.id] = el;
              }}
              className={styles.section}
              aria-labelledby={`heading-${category.id}`}
            >
              <h2 id={`heading-${category.id}`} className={styles.heading}>
                {category.nameFa}
              </h2>
              <div className={sectionStyles.productList}>
                {category.products.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    styles={sectionStyles}
                    onSelect={() => setSelectedProduct(product)}
                  />
                ))}
              </div>
            </section>
          );
        })}
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

function RestaurantHeader({
  restaurant,
  slug,
  styles,
}: {
  restaurant: PublicMenu['restaurant'];
  slug: string;
  styles: TemplateStyles;
}) {
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
          <div
            className={cn(
              'relative size-20 shrink-0 overflow-hidden border-2 border-canvas bg-surface-raised shadow-lifted',
              styles.radius,
            )}
          >
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

          {/* Only meaningful when the guest is actually sitting at a table. */}
          {restaurant.table ? (
            <WaiterCallButton
              slug={slug}
              tableId={restaurant.table.id}
              tableNumber={restaurant.table.number}
            />
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

/**
 * One product, rendered the way the restaurant's template asks for.
 *
 * The four layouts differ in what they lead with - a thumbnail beside the
 * text, a photo above it, a full-width photo, or no photo at all - so each
 * gets its own body rather than one body full of conditionals.
 */
function ProductCard({
  product,
  styles,
  onSelect,
}: {
  product: PublicProduct;
  styles: TemplateStyles;
  onSelect: () => void;
}) {
  const hasDiscount =
    product.discountPrice != null && product.discountPrice < product.price;

  const price = (
    <div className="flex items-baseline gap-2">
      <span className={styles.price}>
        {formatMoney(product.effectivePrice, 'IRT', { withUnit: false })}
      </span>
      <span className="text-xs text-ink-subtle">تومان</span>
      {hasDiscount ? (
        <span className="text-xs text-ink-subtle line-through">
          {formatMoney(product.price, 'IRT', { withUnit: false })}
        </span>
      ) : null}
    </div>
  );

  const soldOut = !product.isAvailable ? (
    <span className="shrink-0 rounded-md bg-surface-raised px-2 py-0.5 text-[0.7rem] text-ink-subtle">
      ناموجود
    </span>
  ) : null;

  const photo = (sizes: string, aspect: string) => (
    <div className={cn('relative overflow-hidden bg-surface-sunken', aspect)}>
      {product.imageUrl ? (
        <Image
          src={product.imageUrl}
          alt={product.nameFa}
          fill
          sizes={sizes}
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />
      ) : (
        <PlaceholderArt />
      )}
      {product.isAvailable ? (
        <span className="absolute bottom-2 end-2 flex size-8 items-center justify-center rounded-lg bg-gold text-ink-inverse shadow">
          <ShoppingBag className="size-4" />
        </span>
      ) : null}
    </div>
  );

  return (
    <button
      onClick={product.isAvailable ? onSelect : undefined}
      disabled={!product.isAvailable}
      className={cn(
        styles.card,
        'transition-colors',
        product.isAvailable ? 'hover:border-gold/40' : 'cursor-not-allowed opacity-55',
      )}
    >
      {styles.layout === 'text' ? (
        <>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="min-w-0 flex-1 truncate font-medium text-ink">
                {product.nameFa}
              </h3>
              {soldOut}
            </div>
            {product.descriptionFa ? (
              <p className="mt-1 line-clamp-1 text-xs leading-relaxed text-ink-subtle">
                {product.descriptionFa}
              </p>
            ) : null}
          </div>
          {/* A dotted leader carries the eye across the gap to the price. */}
          <span className="mx-1 hidden h-px flex-1 self-center border-b border-dotted border-line-strong sm:block" />
          {price}
        </>
      ) : styles.layout === 'list' ? (
        <>
          <div className="min-w-0 flex-1 py-1">
            <div className="flex items-start gap-2">
              <h3 className="min-w-0 flex-1 truncate font-medium text-ink">
                {product.nameFa}
              </h3>
              {soldOut}
            </div>
            {product.descriptionFa ? (
              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-muted">
                {product.descriptionFa}
              </p>
            ) : null}
            <div className="mt-2.5">{price}</div>
          </div>
          <div className={cn('size-24 shrink-0', styles.radius, 'overflow-hidden')}>
            {photo('96px', 'size-full')}
          </div>
        </>
      ) : (
        <>
          {photo(
            styles.layout === 'gallery' ? '(max-width: 768px) 100vw, 640px' : '50vw',
            styles.layout === 'gallery' ? 'aspect-[16/9] w-full' : 'aspect-square w-full',
          )}
          <div className="flex flex-1 flex-col gap-1 p-3">
            <div className="flex items-start gap-2">
              <h3 className="min-w-0 flex-1 font-medium leading-snug text-ink">
                {product.nameFa}
              </h3>
              {soldOut}
            </div>
            {product.descriptionFa ? (
              <p className="line-clamp-2 text-xs leading-relaxed text-ink-muted">
                {product.descriptionFa}
              </p>
            ) : null}
            <div className="mt-auto pt-2">{price}</div>
          </div>
        </>
      )}
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
