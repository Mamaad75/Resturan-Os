'use client';

import {
  MENU_TEMPLATES,
  MENU_TEMPLATE_SPECS,
  MENU_THEME_PRESETS,
  presetConfig,
  type MenuTemplate,
  type MenuThemeConfig,
  type MenuThemeDto,
  type PlanFeatures,
} from '@restaurant-os/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Eye, Lock, RotateCcw, Save, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Select,
  Switch,
  Tabs,
  useToast,
} from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { themeService, type RestaurantAdminDto } from '@/services';
import { MenuThemePreview } from './menu-theme-preview';

/* ------------------------------------------------------------------ */
/* Control definitions - the customizer is generated from these        */
/* ------------------------------------------------------------------ */

type Section = keyof Omit<MenuThemeConfig, 'showFeaturedRail'>;

interface ChoiceControl {
  kind: 'choice';
  section: Section;
  key: string;
  label: string;
  options: Array<{ value: string; label: string }>;
}

interface ToggleControl {
  kind: 'toggle';
  section: Section;
  key: string;
  label: string;
  description?: string;
}

interface ColorControl {
  kind: 'color';
  key: keyof MenuThemeConfig['colors'];
  label: string;
}

type Control = ChoiceControl | ToggleControl;

const choice = (
  section: Section,
  key: string,
  label: string,
  options: Array<[string, string]>,
): ChoiceControl => ({
  kind: 'choice',
  section,
  key,
  label,
  options: options.map(([value, optionLabel]) => ({ value, label: optionLabel })),
});

const toggle = (
  section: Section,
  key: string,
  label: string,
  description?: string,
): ToggleControl => ({ kind: 'toggle', section, key, label, description });

const COLORS: ColorControl[] = [
  { kind: 'color', key: 'primary', label: 'رنگ اصلی' },
  { kind: 'color', key: 'secondary', label: 'رنگ مکمل' },
  { kind: 'color', key: 'background', label: 'پس‌زمینه' },
  { kind: 'color', key: 'surface', label: 'کارت‌ها' },
  { kind: 'color', key: 'text', label: 'متن' },
  { kind: 'color', key: 'textMuted', label: 'متن کم‌رنگ' },
  { kind: 'color', key: 'border', label: 'خطوط' },
];

const TYPOGRAPHY: Control[] = [
  choice('typography', 'headlineFont', 'فونت تیتر', [
    ['vazirmatn', 'وزیرمتن'],
    ['vazirmatn-tight', 'وزیرمتن فشرده'],
    ['serif', 'سریف'],
    ['system', 'سیستمی'],
    ['mono', 'تک‌عرض'],
  ]),
  choice('typography', 'bodyFont', 'فونت متن', [
    ['vazirmatn', 'وزیرمتن'],
    ['vazirmatn-tight', 'وزیرمتن فشرده'],
    ['system', 'سیستمی'],
  ]),
  choice('typography', 'baseSize', 'اندازه فونت', [
    ['sm', 'کوچک'],
    ['md', 'متوسط'],
    ['lg', 'بزرگ'],
  ]),
  choice('typography', 'headlineWeight', 'وزن تیتر', [
    ['normal', 'معمولی'],
    ['medium', 'نیم‌ضخیم'],
    ['bold', 'ضخیم'],
  ]),
  choice('typography', 'headingStyle', 'سبک تیتر بخش', [
    ['rule', 'خط زیر تیتر'],
    ['ornament', 'تزئینی وسط‌چین'],
    ['block', 'بلوک رنگی'],
    ['plain', 'ساده'],
  ]),
];

const LAYOUT: Control[] = [
  choice('layout', 'productLayout', 'چیدمان محصول', [
    ['list', 'فهرستی'],
    ['grid', 'دو ستونی'],
    ['gallery', 'عکس بزرگ'],
    ['text', 'فقط متن'],
  ]),
  choice('layout', 'imageRatio', 'نسبت تصویر', [
    ['square', 'مربع'],
    ['wide', 'عریض'],
    ['portrait', 'عمودی'],
  ]),
  choice('layout', 'cardStyle', 'سبک کارت', [
    ['flat', 'بدون پس‌زمینه'],
    ['outlined', 'ساده'],
    ['raised', 'برجسته'],
    ['glass', 'شیشه‌ای'],
  ]),
  choice('layout', 'radius', 'گردی گوشه‌ها', [
    ['none', 'تیز'],
    ['sm', 'کم'],
    ['md', 'متوسط'],
    ['lg', 'زیاد'],
    ['full', 'کاملاً گرد'],
  ]),
  choice('layout', 'cardSpacing', 'فاصله کارت‌ها', [
    ['compact', 'فشرده'],
    ['comfortable', 'متعادل'],
    ['airy', 'باز'],
  ]),
  choice('layout', 'sectionSpacing', 'فاصله بخش‌ها', [
    ['compact', 'فشرده'],
    ['comfortable', 'متعادل'],
    ['airy', 'باز'],
  ]),
  choice('layout', 'containerWidth', 'عرض صفحه', [
    ['narrow', 'باریک'],
    ['standard', 'استاندارد'],
    ['wide', 'عریض'],
  ]),
  choice('layout', 'categoryNav', 'ناوبری دسته‌ها', [
    ['chips', 'قرصی'],
    ['pills', 'قرصی پررنگ'],
    ['underline', 'زیرخط'],
    ['dropdown', 'کشویی'],
  ]),
];

const PRODUCT_CARD: Control[] = [
  toggle('productCard', 'showImage', 'نمایش تصویر محصول'),
  toggle('productCard', 'showDescription', 'نمایش توضیحات'),
  choice('productCard', 'priceStyle', 'سبک قیمت', [
    ['inline', 'ساده'],
    ['loud', 'درشت'],
    ['badge', 'برچسبی'],
  ]),
  choice('productCard', 'badgeStyle', 'سبک برچسب', [
    ['soft', 'ملایم'],
    ['solid', 'پر'],
    ['outline', 'خطی'],
  ]),
  toggle('productCard', 'showAddButton', 'دکمه افزودن روی تصویر'),
  toggle('productCard', 'showShadow', 'سایه کارت'),
  toggle('productCard', 'showBorder', 'خط دور کارت'),
];

const HEADER: Control[] = [
  toggle('header', 'showCover', 'نمایش تصویر کاور'),
  choice('header', 'logoPlacement', 'جایگاه لوگو', [
    ['start', 'راست'],
    ['center', 'وسط'],
    ['hidden', 'مخفی'],
  ]),
  toggle('header', 'showTagline', 'نمایش شعار'),
  toggle('header', 'showBranchInfo', 'نمایش آدرس و تلفن'),
  toggle('header', 'showStatusBadges', 'نمایش وضعیت و میز'),
  toggle('header', 'stickyCategoryNav', 'چسبیدن نوار دسته‌ها به بالا'),
];

const BUTTONS: Control[] = [
  choice('buttons', 'shape', 'شکل دکمه', [
    ['rounded', 'گرد'],
    ['pill', 'کپسولی'],
    ['square', 'گوشه‌تیز'],
  ]),
  choice('buttons', 'size', 'اندازه دکمه', [
    ['sm', 'کوچک'],
    ['md', 'متوسط'],
    ['lg', 'بزرگ'],
  ]),
  choice('buttons', 'weight', 'وزن نوشته دکمه', [
    ['normal', 'معمولی'],
    ['medium', 'نیم‌ضخیم'],
    ['bold', 'ضخیم'],
  ]),
];

const FOOTER: Control[] = [
  toggle('footer', 'show', 'نمایش فوتر'),
  toggle('footer', 'showPlatformCredit', 'نمایش «قدرت‌گرفته از فوداواس»'),
];

const TAB_ITEMS = [
  { id: 'colors', label: 'رنگ‌ها' },
  { id: 'typography', label: 'تایپوگرافی' },
  { id: 'layout', label: 'چیدمان' },
  { id: 'card', label: 'کارت محصول' },
  { id: 'header', label: 'هدر' },
  { id: 'buttons', label: 'دکمه‌ها' },
  { id: 'advanced', label: 'پیشرفته' },
];

/* ------------------------------------------------------------------ */

/**
 * Menu theme customizer.
 *
 * Data-driven: the controls above describe the theme, and this component
 * renders them. Adding a knob means adding a line to a list and a field to the
 * config type, not a new branch in the menu's JSX.
 */
export function MenuThemeCustomizer({
  restaurant,
  features,
  editable,
}: {
  restaurant: RestaurantAdminDto;
  features: PlanFeatures | null;
  editable: boolean;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const themeQuery = useQuery({
    queryKey: ['menu-theme'],
    queryFn: () => themeService.get(),
  });

  const [draft, setDraft] = useState<MenuThemeConfig | null>(null);
  const [preset, setPreset] = useState<MenuTemplate>('CLASSIC');
  const [customCss, setCustomCss] = useState('');
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState('colors');

  useEffect(() => {
    const data = themeQuery.data;
    if (!data) return;
    setDraft(data.config);
    setPreset(data.preset);
    setCustomCss(data.customCss ?? '');
    setDirty(false);
  }, [themeQuery.data]);

  const canCustomize = features?.customThemeEnabled ?? false;
  const canAdvanced = features?.advancedThemeEnabled ?? false;
  const canCss = features?.customCssEnabled ?? false;

  function patch<S extends Section>(
    section: S,
    key: string,
    value: unknown,
  ) {
    setDraft((current) =>
      current
        ? { ...current, [section]: { ...current[section], [key]: value } }
        : current,
    );
    setDirty(true);
  }

  const save = useMutation({
    mutationFn: (publish: boolean) =>
      themeService.update({
        preset,
        config: draft ?? undefined,
        ...(canCss ? { customCss: customCss.trim() || null } : {}),
        publish,
      }),
    onSuccess: (data, publish) => {
      toast.success(publish ? 'ظاهر منو منتشر شد' : 'پیش‌نویس ذخیره شد');
      queryClient.setQueryData(['menu-theme'], data);
      setDirty(false);
    },
    onError: (error) =>
      toast.error(
        'ذخیره انجام نشد',
        error instanceof ApiError ? error.message : undefined,
      ),
  });

  const reset = useMutation({
    mutationFn: () => themeService.reset(false),
    onSuccess: (data) => {
      toast.success('به تنظیمات قالب برگشت');
      queryClient.setQueryData(['menu-theme'], data);
    },
    onError: (error) =>
      toast.error(
        'بازنشانی انجام نشد',
        error instanceof ApiError ? error.message : undefined,
      ),
  });

  if (themeQuery.isPending || !draft) {
    return (
      <Card>
        <CardBody>
          <div className="h-40 animate-pulse rounded-xl bg-surface-raised" />
        </CardBody>
      </Card>
    );
  }

  const disabled = !editable || !canCustomize;

  return (
    <div className="space-y-4">
      {!canCustomize ? (
        <div className="flex items-start gap-3 rounded-xl border border-caution/30 bg-caution/10 p-4 text-sm text-caution">
          <Lock className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">سفارشی‌سازی ظاهر در پلن فعلی فعال نیست.</p>
            <p className="mt-1 text-xs leading-relaxed">
              می‌توانید یکی از قالب‌های آماده را انتخاب کنید. برای تغییر رنگ، فونت و
              چیدمان، پلن خود را ارتقا دهید.
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          {/* ------------------------------------------------ presets */}
          <Card>
            <CardHeader
              title="قالب آماده"
              description="نقطه شروع طراحی. بعد از انتخاب، همه‌چیز قابل تغییر است."
            />
            <CardBody>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {MENU_TEMPLATES.map((id) => {
                  const spec = MENU_TEMPLATE_SPECS[id];
                  const selected = preset === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      disabled={!editable}
                      onClick={() => {
                        setPreset(id);
                        // Picking a preset loads its design. The owner's
                        // colours are part of that design, so switching preset
                        // is a deliberate restart rather than a partial merge.
                        setDraft(MENU_THEME_PRESETS[id]);
                        setDirty(true);
                      }}
                      className={cn(
                        'rounded-xl border p-3 text-start transition-colors disabled:opacity-60',
                        selected
                          ? 'border-gold/60 bg-gold/[0.06]'
                          : 'border-line bg-surface hover:border-line-strong',
                      )}
                    >
                      <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                        {spec.labelFa}
                        {selected ? <Check className="size-3.5 text-gold" /> : null}
                      </p>
                      <p className="mt-0.5 text-xs leading-relaxed text-ink-subtle">
                        {spec.descriptionFa}
                      </p>
                    </button>
                  );
                })}
              </div>
            </CardBody>
          </Card>

          {/* --------------------------------------------- customizer */}
          <Card>
            <CardHeader
              title="سفارشی‌سازی"
              description="هر تغییر بلافاصله در پیش‌نمایش کنار صفحه دیده می‌شود."
            />
            <CardBody>
              <Tabs
                items={TAB_ITEMS.filter(
                  (item) => item.id !== 'advanced' || canAdvanced,
                )}
                activeId={tab}
                onChange={setTab}
              />

              <div className="pt-4">
                {tab === 'colors' ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {COLORS.map((control) => (
                      <ColorField
                        key={control.key}
                        label={control.label}
                        value={draft.colors[control.key]}
                        disabled={disabled}
                        onChange={(value) => patch('colors', control.key, value)}
                      />
                    ))}
                  </div>
                ) : null}

                {tab === 'typography' ? (
                  <ControlGrid
                    controls={TYPOGRAPHY}
                    config={draft}
                    disabled={disabled}
                    onChange={patch}
                  />
                ) : null}

                {tab === 'layout' ? (
                  <ControlGrid
                    controls={LAYOUT}
                    config={draft}
                    disabled={disabled}
                    onChange={patch}
                  />
                ) : null}

                {tab === 'card' ? (
                  <ControlGrid
                    controls={PRODUCT_CARD}
                    config={draft}
                    disabled={disabled}
                    onChange={patch}
                  />
                ) : null}

                {tab === 'header' ? (
                  <div className="space-y-3">
                    <ControlGrid
                      controls={HEADER}
                      config={draft}
                      disabled={disabled}
                      onChange={patch}
                    />
                    <Switch
                      checked={draft.showFeaturedRail}
                      disabled={disabled}
                      onChange={(value) => {
                        setDraft({ ...draft, showFeaturedRail: value });
                        setDirty(true);
                      }}
                      label="نوار پیشنهاد ویژه"
                      description="محصولات ویژه را بالای منو نشان می‌دهد."
                    />
                  </div>
                ) : null}

                {tab === 'buttons' ? (
                  <div className="space-y-3">
                    <ControlGrid
                      controls={BUTTONS}
                      config={draft}
                      disabled={disabled}
                      onChange={patch}
                    />
                    <ControlGrid
                      controls={FOOTER}
                      config={draft}
                      disabled={disabled}
                      onChange={patch}
                    />
                  </div>
                ) : null}

                {tab === 'advanced' && canAdvanced ? (
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-medium text-ink-muted">CSS اختصاصی</p>
                      {canCss ? (
                        <Badge tone="positive">فعال</Badge>
                      ) : (
                        <Badge tone="caution">نیازمند پلن کسب‌وکار</Badge>
                      )}
                    </div>
                    <p className="mb-2 text-xs leading-relaxed text-ink-subtle">
                      فقط روی صفحه منوی مشتری اعمال می‌شود. همه انتخابگرها به‌صورت
                      خودکار به منو محدود می‌شوند و نمی‌توانند روی پنل مدیریت اثر
                      بگذارند.
                    </p>
                    <textarea
                      dir="ltr"
                      rows={10}
                      spellCheck={false}
                      disabled={!editable || !canCss}
                      value={customCss}
                      onChange={(e) => {
                        setCustomCss(e.target.value);
                        setDirty(true);
                      }}
                      placeholder={'.menu-card {\n  letter-spacing: 0.01em;\n}'}
                      className="w-full rounded-xl border border-line bg-surface-sunken p-3 font-mono text-xs text-ink outline-none focus:border-gold/50 disabled:opacity-60"
                    />
                  </div>
                ) : null}
              </div>
            </CardBody>
          </Card>
        </div>

        {/* ------------------------------------------------- preview */}
        <div className="space-y-3 xl:sticky xl:top-20 xl:self-start">
          <div className="flex items-center gap-2 text-sm text-ink-muted">
            <Eye className="size-4" />
            پیش‌نمایش موبایل
            {dirty ? <Badge tone="caution">ذخیره نشده</Badge> : null}
            {themeQuery.data?.hasDraft && !dirty ? (
              <Badge tone="neutral">پیش‌نویس منتشرنشده</Badge>
            ) : null}
          </div>

          <MenuThemePreview
            config={draft}
            customCss={canCss ? customCss : null}
            restaurantName={restaurant.name}
            logoUrl={restaurant.branding.logoUrl}
            coverUrl={restaurant.branding.coverUrl}
            tagline={restaurant.branding.tagline}
          />

          {editable ? (
            <div className="space-y-2">
              <Button
                variant="primary"
                fullWidth
                leftIcon={<Send className="size-4" />}
                loading={save.isPending && save.variables === true}
                onClick={() => save.mutate(true)}
              >
                انتشار روی منوی مشتری
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  fullWidth
                  leftIcon={<Save className="size-4" />}
                  loading={save.isPending && save.variables === false}
                  onClick={() => save.mutate(false)}
                >
                  ذخیره پیش‌نویس
                </Button>
                <Button
                  variant="ghost"
                  fullWidth
                  leftIcon={<RotateCcw className="size-4" />}
                  loading={reset.isPending}
                  onClick={() => {
                    setDraft(presetConfig(preset));
                    setDirty(true);
                    reset.mutate();
                  }}
                >
                  بازگشت به قالب
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ControlGrid({
  controls,
  config,
  disabled,
  onChange,
}: {
  controls: Control[];
  config: MenuThemeConfig;
  disabled: boolean;
  onChange: (section: Section, key: string, value: unknown) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {controls.map((control) => {
        const section = config[control.section] as unknown as Record<string, unknown>;
        if (control.kind === 'toggle') {
          return (
            <Switch
              key={`${control.section}.${control.key}`}
              checked={section[control.key] === true}
              disabled={disabled}
              onChange={(value) => onChange(control.section, control.key, value)}
              label={control.label}
              description={control.description}
            />
          );
        }
        return (
          <Select
            key={`${control.section}.${control.key}`}
            label={control.label}
            disabled={disabled}
            value={String(section[control.key] ?? '')}
            onChange={(e) => onChange(control.section, control.key, e.target.value)}
            options={control.options}
          />
        );
      })}
    </div>
  );
}

function ColorField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-ink-muted">{label}</p>
      <div className="flex items-center gap-2">
        <input
          type="color"
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
          className="size-10 shrink-0 cursor-pointer rounded-lg border border-line bg-transparent disabled:cursor-not-allowed disabled:opacity-60"
        />
        <input
          dir="ltr"
          disabled={disabled}
          value={value}
          onChange={(e) => {
            const next = e.target.value;
            // Only commit a complete hex value; a half-typed one would blank
            // the preview on every keystroke.
            if (/^#[0-9a-fA-F]{6}$/.test(next)) onChange(next);
          }}
          className="h-10 w-full rounded-lg border border-line bg-surface-sunken px-3 font-mono text-xs text-ink outline-none focus:border-gold/50 disabled:opacity-60"
        />
      </div>
    </div>
  );
}
