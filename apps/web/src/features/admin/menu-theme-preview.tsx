'use client';

import type { MenuThemeConfig } from '@restaurant-os/types';
import { ShoppingBag } from 'lucide-react';
import {
  scopeCustomCss,
  themeClasses,
  themeVariables,
} from '@/features/customer/theme-runtime';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/format';

interface PreviewProduct {
  nameFa: string;
  descriptionFa: string;
  price: number;
}

const SAMPLE: Array<{ category: string; products: PreviewProduct[] }> = [
  {
    category: 'نوشیدنی گرم',
    products: [
      { nameFa: 'کاپوچینو', descriptionFa: 'اسپرسو با شیر بخارپز و فوم مخملی', price: 145_000 },
      { nameFa: 'لاته', descriptionFa: 'اسپرسو با شیر بخارپز و لایه‌ای نازک از فوم', price: 155_000 },
    ],
  },
  {
    category: 'دسر',
    products: [
      { nameFa: 'چیزکیک', descriptionFa: 'چیزکیک نیویورکی با سس توت‌فرنگی', price: 190_000 },
    ],
  },
];

/**
 * A phone-sized rendering of the customer menu with the theme being edited.
 *
 * Renders through `themeVariables` and `themeClasses` - the same two functions
 * the live menu uses - so the preview cannot claim something the real page
 * would not do. It is a miniature, not a mock: the sample products stand in for
 * the menu, everything around them is the actual styling.
 */
export function MenuThemePreview({
  config,
  customCss,
  restaurantName,
  logoUrl,
  coverUrl,
  tagline,
}: {
  config: MenuThemeConfig;
  customCss: string | null;
  restaurantName: string;
  logoUrl: string | null;
  coverUrl: string | null;
  tagline: string | null;
}) {
  const styles = themeClasses(config);
  const scoped = scopeCustomCss(customCss);
  const isLight = isLightBackground(config.colors.background);

  return (
    <div className="mx-auto w-full max-w-[22rem]">
      {/* Phone shell, so the proportions match what a guest actually holds. */}
      <div className="overflow-hidden rounded-[2rem] border-[6px] border-line-strong bg-canvas shadow-lifted">
        <div
          id="foodos-menu"
          data-theme={isLight ? 'light' : undefined}
          style={themeVariables(config)}
          className="h-[34rem] overflow-y-auto bg-canvas"
        >
          {scoped ? <style dangerouslySetInnerHTML={{ __html: scoped }} /> : null}

          {config.header.showCover ? (
            <div className="relative h-24 bg-surface-sunken">
              {coverUrl ? (
                // A plain img: next/image inside a scrollable preview adds
                // nothing and complicates the sizing.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coverUrl} alt="" className="size-full object-cover" />
              ) : (
                <div className="size-full bg-[radial-gradient(120%_100%_at_50%_0%,rgb(var(--gold)/0.25),transparent_70%)]" />
              )}
            </div>
          ) : null}

          <div className={cn('px-3', config.header.showCover ? '-mt-6' : 'pt-3')}>
            <div
              className={cn(
                'flex items-end gap-2',
                config.header.logoPlacement === 'center' &&
                  'flex-col items-center text-center',
              )}
            >
              {config.header.logoPlacement === 'hidden' ? null : (
                <div className="relative size-11 shrink-0 overflow-hidden rounded-[var(--menu-radius)] border-2 border-canvas bg-surface-raised">
                  {logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoUrl} alt="" className="size-full object-cover" />
                  ) : (
                    <div className="flex size-full items-center justify-center text-sm font-bold text-gold">
                      {restaurantName.charAt(0)}
                    </div>
                  )}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-sm text-ink"
                  style={{
                    fontFamily: 'var(--menu-font-headline)',
                    fontWeight: 'var(--menu-headline-weight)' as never,
                  }}
                >
                  {restaurantName}
                </p>
                {config.header.showTagline && tagline ? (
                  <p className="truncate text-[0.65rem] text-ink-muted">{tagline}</p>
                ) : null}
              </div>
            </div>

            {config.header.showStatusBadges ? (
              <div
                className={cn(
                  'mt-2 flex gap-1.5',
                  config.header.logoPlacement === 'center' && 'justify-center',
                )}
              >
                <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[0.6rem] text-gold">
                  میز ۷
                </span>
                <span className="rounded-full bg-positive/15 px-2 py-0.5 text-[0.6rem] text-positive">
                  باز است
                </span>
              </div>
            ) : null}
          </div>

          <nav className="mt-3 border-b border-line px-3 pb-2">
            <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
              {SAMPLE.map((section, index) => (
                <span
                  key={section.category}
                  className={cn(
                    'shrink-0 whitespace-nowrap text-[0.65rem]',
                    index === 0 ? styles.chipActive : styles.chipIdle,
                  )}
                >
                  {section.category}
                </span>
              ))}
            </div>
          </nav>

          <div className="px-3 pb-4">
            {SAMPLE.map((section) => (
              <section key={section.category} className="pt-[var(--menu-section-gap)]">
                <h3 className={cn(styles.heading, '!mb-2 !text-sm')}>
                  {section.category}
                </h3>
                <div className={styles.productList}>
                  {section.products.map((product) => (
                    <PreviewCard
                      key={product.nameFa}
                      product={product}
                      config={config}
                      styles={styles}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>

          {config.footer.show ? (
            <footer className="border-t border-line px-3 py-3 text-center text-[0.6rem] text-ink-subtle">
              {config.footer.text ?? restaurantName}
              {config.footer.showPlatformCredit ? (
                <span className="block opacity-70">قدرت‌گرفته از فوداواس</span>
              ) : null}
            </footer>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PreviewCard({
  product,
  config,
  styles,
}: {
  product: PreviewProduct;
  config: MenuThemeConfig;
  styles: ReturnType<typeof themeClasses>;
}) {
  const { layout, productCard } = { layout: config.layout, productCard: config.productCard };
  const showPhoto = productCard.showImage && layout.productLayout !== 'text';

  const price = (
    <span className={cn(styles.price, '!text-[0.7rem]')}>
      {formatMoney(product.price, 'IRT', { withUnit: false })}
    </span>
  );

  const swatch = (
    <div className="relative size-full bg-[linear-gradient(135deg,rgb(var(--gold)/0.35),rgb(var(--gold)/0.08))]">
      {productCard.showAddButton ? (
        <span className="absolute bottom-1 end-1 flex size-5 items-center justify-center rounded-[var(--menu-radius)] bg-gold text-ink-inverse">
          <ShoppingBag className="size-2.5" />
        </span>
      ) : null}
    </div>
  );

  return (
    <div
      className={cn(
        styles.card,
        layout.productLayout !== 'text' && 'rounded-[var(--menu-radius)] !p-2',
      )}
    >
      {layout.productLayout === 'text' ? (
        <>
          <span className="truncate text-[0.7rem] text-ink">{product.nameFa}</span>
          <span className="mx-1 h-px flex-1 self-center border-b border-dotted border-line-strong" />
          {price}
        </>
      ) : layout.productLayout === 'list' ? (
        <>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.7rem] text-ink">{product.nameFa}</p>
            {productCard.showDescription ? (
              <p className="line-clamp-1 text-[0.6rem] text-ink-muted">
                {product.descriptionFa}
              </p>
            ) : null}
            <div className="mt-1">{price}</div>
          </div>
          {showPhoto ? (
            <div className="size-12 shrink-0 overflow-hidden rounded-[var(--menu-radius)]">
              {swatch}
            </div>
          ) : null}
        </>
      ) : (
        <>
          {showPhoto ? (
            <div className={cn('w-full overflow-hidden', styles.imageAspect)}>
              {swatch}
            </div>
          ) : null}
          <div className="p-1.5">
            <p className="truncate text-[0.7rem] text-ink">{product.nameFa}</p>
            {productCard.showDescription ? (
              <p className="line-clamp-1 text-[0.6rem] text-ink-muted">
                {product.descriptionFa}
              </p>
            ) : null}
            <div className="mt-1">{price}</div>
          </div>
        </>
      )}
    </div>
  );
}

function isLightBackground(hex: string): boolean {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return false;
  const int = Number.parseInt(match[1], 16);
  const [r, g, b] = [(int >> 16) & 255, (int >> 8) & 255, int & 255];
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.5;
}
