'use client';

import {
  presetConfig,
  resolveTheme,
  type MenuThemeConfig,
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
  hexToRgbChannels,
  scopeCustomCss,
  themeClasses,
  themeVariables,
  type ThemeClasses,
} from './theme-runtime';
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

  /*
   * The published theme drives everything below. A restaurant that has never
   * opened the customizer has no theme row yet, so the preset named on its
   * branding is used instead - the menu looks identical either way.
   */
  const config: MenuThemeConfig =
    menu.theme?.config ?? presetConfig(restaurant.branding.menuTemplate);
  const styles = themeClasses(config);
  const customCss = scopeCustomCss(menu.theme?.customCss);
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
      id="foodos-menu"
      className="min-h-dvh bg-canvas pb-28"
      // The theme carries its own colours, so the light/dark token set is
      // chosen from the theme's background rather than the legacy flag.
      data-theme={isLightBackground(config.colors.background) ? 'light' : undefined}
      style={themeVariables(config)}
    >
      {/*
        Tenant CSS, scoped to this container. It is injected last so it can
        override the theme, and it can never escape `#foodos-menu`.
      */}
      {customCss ? (
        <style dangerouslySetInnerHTML={{ __html: customCss }} />
      ) : null}

      <RestaurantHeader
        restaurant={restaurant}
        slug={slug}
        styles={styles}
        header={config.header}
      />

      {/* Sticky category rail */}
      {categories.length > 0 ? (
        <nav
          aria-label="دسته‌بندی‌ها"
          className={cn(
            'z-30 border-b border-line bg-canvas/85 backdrop-blur-xl',
            config.header.stickyCategoryNav && 'sticky top-0',
          )}
        >
          <div className="no-scrollbar mx-auto flex w-full max-w-[var(--menu-container)] gap-2 overflow-x-auto px-4 py-3">
            {categories.map((category) => (
              <button
                key={category.id}
                ref={(el) => {
                  chipRefs.current[category.id] = el;
                }}
                onClick={() => scrollToCategory(category.id)}
                aria-current={activeCategory === category.id}
                className={cn(
                  'shrink-0 text-sm font-medium transition-colors',
                  activeCategory === category.id ? styles.chipActive : styles.chipIdle,
                )}
              >
                {category.nameFa}
              </button>
            ))}
          </div>
        </nav>
      ) : null}

      <main className="mx-auto w-full max-w-[var(--menu-container)] px-4">
        {categories.length === 0 ? (
          <EmptyState
            icon={<UtensilsCrossed className="size-6" />}
            title="منو هنوز آماده نیست"
            description="این رستوران هنوز محصولی به منوی خود اضافه نکرده است."
            className="mt-10"
          />
        ) : null}

        {featured.length > 0 && config.showFeaturedRail ? (
          <section
            className="pt-[var(--menu-section-gap)]"
            aria-labelledby="featured-heading"
          >
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
                  className="group w-40 shrink-0 overflow-hidden rounded-[var(--menu-radius)] border border-line bg-surface text-start transition-colors hover:border-gold/40"
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
          /*
           * Resolved per section. A photo-led layout in a category nobody has
           * photographed is a wall of empty frames - the state every new
           * restaurant starts in - so those sections fall back to the list.
           * Everything else about the theme still applies.
           */
          const hasPhotos = category.products.some((p) => p.imageUrl != null);
          const sectionStyles =
            config.productCard.showImage &&
            !hasPhotos &&
            (config.layout.productLayout === 'grid' ||
              config.layout.productLayout === 'gallery')
              ? themeClasses({
                  ...config,
                  layout: { ...config.layout, productLayout: 'list' },
                })
              : styles;
          const sectionLayout =
            sectionStyles === styles ? config.layout.productLayout : 'list';
          return (
            <section
              key={category.id}
              id={category.id}
              ref={(el) => {
                sectionRefs.current[category.id] = el;
              }}
              className="scroll-mt-32 pt-[var(--menu-section-gap)]"
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
                    layout={sectionLayout}
                    card={config.productCard}
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
  header,
}: {
  restaurant: PublicMenu['restaurant'];
  slug: string;
  styles: ThemeClasses;
  header: MenuThemeConfig['header'];
}) {
  return (
    <header className="relative">
      {header.showCover ? (
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
      ) : null}

      {/*
        `relative` is load-bearing: the cover's gradient overlay is absolutely
        positioned, and positioned elements paint above static siblings no
        matter the DOM order. Without this the overlay covers the restaurant
        name, which sits inside the cover's height because of the -mt-14 pull.
      */}
      <div
        className={cn(
          'relative z-10 mx-auto w-full max-w-[var(--menu-container)] px-4',
          header.showCover ? '-mt-14' : 'pt-6',
        )}
      >
        <div
          className={cn(
            'flex items-end gap-4',
            header.logoPlacement === 'center' && 'flex-col items-center text-center',
          )}
        >
          {header.logoPlacement === 'hidden' ? null : (
          <div className="relative size-20 shrink-0 overflow-hidden rounded-[var(--menu-radius)] border-2 border-canvas bg-surface-raised shadow-lifted">
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
          )}
          <div className="min-w-0 flex-1 pb-1">
            <h1
              className="truncate text-xl text-ink sm:text-2xl"
              style={{
                fontFamily: 'var(--menu-font-headline)',
                fontWeight: 'var(--menu-headline-weight)' as never,
                letterSpacing: 'var(--menu-headline-tracking)',
              }}
            >
              {restaurant.name}
            </h1>
            {header.showTagline && restaurant.branding.tagline ? (
              <p className="truncate text-sm text-ink-muted">
                {restaurant.branding.tagline}
              </p>
            ) : null}
          </div>
        </div>

        <div
          className={cn(
            'mt-4 flex flex-wrap items-center gap-2',
            header.logoPlacement === 'center' && 'justify-center',
            !header.showStatusBadges && 'hidden',
          )}
        >
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

        {header.showBranchInfo &&
        (restaurant.branch.address || restaurant.branch.phone) ? (
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
  layout,
  card,
  onSelect,
}: {
  product: PublicProduct;
  styles: ThemeClasses;
  layout: MenuThemeConfig['layout']['productLayout'];
  card: MenuThemeConfig['productCard'];
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
    <span
      className={cn(
        'shrink-0 px-2 py-0.5 text-[0.7rem]',
        card.badgeStyle === 'solid'
          ? 'rounded-md bg-ink-subtle text-canvas'
          : card.badgeStyle === 'outline'
            ? 'rounded-md border border-line text-ink-subtle'
            : 'rounded-md bg-surface-raised text-ink-subtle',
      )}
    >
      ناموجود
    </span>
  ) : null;

  const title = (
    <h3
      className="min-w-0 flex-1 truncate text-ink"
      style={{
        fontFamily: 'var(--menu-font-headline)',
        fontWeight: 'var(--menu-headline-weight)' as never,
        letterSpacing: 'var(--menu-headline-tracking)',
      }}
    >
      {product.nameFa}
    </h3>
  );

  const description =
    card.showDescription && product.descriptionFa ? (
      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-muted">
        {product.descriptionFa}
      </p>
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
      {card.showAddButton && product.isAvailable ? (
        <span className="absolute bottom-2 end-2 flex size-8 items-center justify-center rounded-[var(--menu-radius)] bg-gold text-ink-inverse shadow">
          <ShoppingBag className="size-4" />
        </span>
      ) : null}
    </div>
  );

  const showPhoto = card.showImage && layout !== 'text';

  return (
    <button
      onClick={product.isAvailable ? onSelect : undefined}
      disabled={!product.isAvailable}
      className={cn(
        styles.card,
        layout !== 'text' && 'rounded-[var(--menu-radius)]',
        'transition-colors',
        product.isAvailable ? 'hover:border-gold/40' : 'cursor-not-allowed opacity-55',
      )}
    >
      {layout === 'text' ? (
        <>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {title}
              {soldOut}
            </div>
            {card.showDescription && product.descriptionFa ? (
              <p className="mt-1 line-clamp-1 text-xs leading-relaxed text-ink-subtle">
                {product.descriptionFa}
              </p>
            ) : null}
          </div>
          {/* A dotted leader carries the eye across the gap to the price. */}
          <span className="mx-1 hidden h-px flex-1 self-center border-b border-dotted border-line-strong sm:block" />
          {price}
        </>
      ) : layout === 'list' ? (
        <>
          <div className="min-w-0 flex-1 py-1">
            <div className="flex items-start gap-2">
              {title}
              {soldOut}
            </div>
            {description}
            <div className="mt-2.5">{price}</div>
          </div>
          {showPhoto ? (
            <div className="size-24 shrink-0 overflow-hidden rounded-[var(--menu-radius)]">
              {photo('96px', 'size-full')}
            </div>
          ) : null}
        </>
      ) : (
        <>
          {showPhoto
            ? photo(
                layout === 'gallery' ? '(max-width: 768px) 100vw, 640px' : '50vw',
                cn('w-full', styles.imageAspect),
              )
            : null}
          <div className={styles.cardInner}>
            <div className="flex items-start gap-2">
              {title}
              {soldOut}
            </div>
            {description}
            <div className="mt-auto pt-2">{price}</div>
          </div>
        </>
      )}
    </button>
  );
}

/**
 * Whether a background colour wants the light token set.
 *
 * Relative luminance rather than a stored flag: the owner picks a background
 * colour, and text has to stay readable on it whichever they choose.
 */
function isLightBackground(hex: string): boolean {
  const channels = hexToRgbChannels(hex);
  if (!channels) return false;
  const [r, g, b] = channels.split(' ').map(Number);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.5;
}

/** Fallback art so a product without a photo still looks intentional. */
function PlaceholderArt() {
  return (
    <div className="flex size-full items-center justify-center bg-[radial-gradient(100%_100%_at_50%_0%,rgb(var(--gold)/0.14),transparent)]">
      <UtensilsCrossed className="size-6 text-ink-subtle" />
    </div>
  );
}
