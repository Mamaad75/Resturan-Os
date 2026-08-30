'use client';

import {
  MENU_TEMPLATE_SPECS,
  MENU_TEMPLATES,
  menuTemplateSpec,
  type MenuTemplate,
  type MenuTemplateSpec,
} from '@restaurant-os/types';
import { Check, Image as ImageIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { hexToRgbChannels, templateStyles } from '@/features/customer/menu-templates';
import { toPersianDigits } from '@/lib/format';

/**
 * Template chooser with a live miniature of the customer menu.
 *
 * The thumbnail resolves its classes through the same `templateStyles` the
 * real menu uses, so the owner is looking at the actual layout rather than a
 * drawing of it - including their own accent colour and light/dark choice.
 */
export function MenuTemplatePicker({
  value,
  accentColor,
  theme,
  onChange,
  disabled,
}: {
  value: MenuTemplate;
  accentColor: string;
  theme: 'dark' | 'light';
  onChange: (template: MenuTemplate, spec: MenuTemplateSpec) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {MENU_TEMPLATES.map((id) => {
        const spec = MENU_TEMPLATE_SPECS[id];
        const selected = value === id;
        return (
          <button
            key={id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(id, spec)}
            aria-pressed={selected}
            className={cn(
              'flex flex-col overflow-hidden rounded-2xl border text-start transition-colors disabled:cursor-not-allowed disabled:opacity-60',
              selected
                ? 'border-gold/60 bg-gold/[0.06]'
                : 'border-line bg-surface hover:border-line-strong',
            )}
          >
            <TemplateThumbnail spec={spec} accentColor={accentColor} theme={theme} />

            <div className="flex items-start gap-2 p-3">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                  {spec.labelFa}
                  {selected ? <Check className="size-3.5 text-gold" /> : null}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-subtle">
                  {spec.descriptionFa}
                </p>
                {spec.layout === 'grid' || spec.layout === 'gallery' ? (
                  <p className="mt-1.5 flex items-center gap-1 text-[0.7rem] text-caution">
                    <ImageIcon className="size-3" />
                    به عکس محصول نیاز دارد
                  </p>
                ) : null}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/** Three fake products rendered through the real template rules. */
function TemplateThumbnail({
  spec,
  accentColor,
  theme,
}: {
  spec: MenuTemplateSpec;
  accentColor: string;
  theme: 'dark' | 'light';
}) {
  const styles = templateStyles(spec);
  const rows = [
    { name: 'قهوه دمی', price: 95_000 },
    { name: 'کیک شکلاتی', price: 145_000 },
    { name: 'آب پرتقال', price: 120_000 },
  ];
  // Grid and gallery layouts get taller cells, so two fit where three would
  // overflow the thumbnail.
  const visible = spec.layout === 'list' || spec.layout === 'text' ? rows : rows.slice(0, 2);

  return (
    <div
      data-theme={theme === 'light' ? 'light' : undefined}
      style={
        { '--gold': hexToRgbChannels(accentColor) ?? undefined } as React.CSSProperties
      }
      className="pointer-events-none h-40 overflow-hidden bg-canvas p-3"
      aria-hidden
    >
      <p className={cn(styles.heading, 'truncate !text-xs')}>نوشیدنی</p>

      <div className={styles.productList}>
        {visible.map((row) => (
          <div key={row.name} className={cn(styles.card, '!p-2')}>
            {spec.layout === 'text' ? (
              <>
                <span className="truncate text-[0.65rem] text-ink">{row.name}</span>
                <span className="mx-1 h-px flex-1 self-center border-b border-dotted border-line-strong" />
                <span className={cn(styles.price, '!text-[0.65rem]')}>
                  {toPersianDigits(row.price / 1000)}
                </span>
              </>
            ) : spec.layout === 'list' ? (
              <>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.65rem] text-ink">{row.name}</p>
                  <p className={cn(styles.price, '!text-[0.65rem]')}>
                    {toPersianDigits(row.price / 1000)}
                  </p>
                </div>
                <div className={cn('size-7 shrink-0 bg-surface-sunken', styles.radius)} />
              </>
            ) : (
              <>
                {/*
                  Fixed heights rather than the real aspect ratios: the
                  thumbnail has to show a whole card, and a square photo at
                  this width would not fit inside it.
                */}
                <div
                  className={cn(
                    'w-full bg-surface-sunken',
                    spec.layout === 'gallery' ? 'h-12' : 'h-14',
                  )}
                />
                <div className="p-1">
                  <p className="truncate text-[0.65rem] text-ink">{row.name}</p>
                  <p className={cn(styles.price, '!text-[0.65rem]')}>
                    {toPersianDigits(row.price / 1000)}
                  </p>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
