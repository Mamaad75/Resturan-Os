'use client';

import {
  BusinessType,
  SERVICE_MODE_LABELS_FA,
  ServiceMode,
  ServiceModeChoice,
  tablesEnabled,
  type RestaurantSettings,
} from '@restaurant-os/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Palette, Store, Truck } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  ErrorState,
  ImageUpload,
  Input,
  Skeleton,
  Switch,
  Textarea,
  useToast,
} from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { MenuThemeCustomizer } from '@/features/admin/menu-theme-customizer';
import { ApiError } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { toPersianDigits } from '@/lib/format';
import { restaurantService, subscriptionService } from '@/services';

export default function SettingsPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();

  const restaurantQuery = useQuery({
    queryKey: ['restaurant'],
    queryFn: () => restaurantService.get(),
  });

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tagline, setTagline] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [accentColor, setAccentColor] = useState('#C9A24B');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [settings, setSettings] = useState<RestaurantSettings | null>(null);
  const [tab, setTab] = useState('general');

  // Entitlements decide which sections are even worth showing.
  const subscriptionQuery = useQuery({
    queryKey: ['subscription'],
    queryFn: () => subscriptionService.get(),
  });

  useEffect(() => {
    const data = restaurantQuery.data;
    if (!data) return;
    setName(data.name);
    setDescription(data.description ?? '');
    setTagline(data.branding.tagline ?? '');
    setLogoUrl(data.branding.logoUrl);
    setCoverUrl(data.branding.coverUrl);
    setAccentColor(data.branding.accentColor);
    setTheme(data.branding.theme);
    setSettings(data.settings);
  }, [restaurantQuery.data]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['restaurant'] });
  };

  const saveProfile = useMutation({
    mutationFn: () =>
      restaurantService.update({
        name: name.trim(),
        description: description.trim() || null,
      }),
    onSuccess: () => {
      toast.success('اطلاعات رستوران ذخیره شد');
      invalidate();
    },
    onError: (error) =>
      toast.error('ذخیره انجام نشد', error instanceof ApiError ? error.message : undefined),
  });

  const saveBranding = useMutation({
    mutationFn: () =>
      restaurantService.updateBranding({
        tagline: tagline.trim() || null,
        logoUrl,
        coverUrl,
        accentColor,
        theme,
      }),
    onSuccess: () => {
      toast.success('ظاهر منو به‌روزرسانی شد');
      invalidate();
    },
    onError: (error) =>
      toast.error('ذخیره انجام نشد', error instanceof ApiError ? error.message : undefined),
  });

  const saveSettings = useMutation({
    mutationFn: (next: Partial<RestaurantSettings>) =>
      restaurantService.updateSettings(next as Record<string, unknown>),
    onSuccess: () => {
      toast.success('تنظیمات ذخیره شد');
      invalidate();
    },
    onError: (error) =>
      toast.error('ذخیره انجام نشد', error instanceof ApiError ? error.message : undefined),
  });

  if (restaurantQuery.isPending) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (restaurantQuery.isError || !restaurantQuery.data || !settings) {
    return <ErrorState onRetry={() => restaurantQuery.refetch()} />;
  }

  const restaurant = restaurantQuery.data;
  const editable = can('settings:manage');

  function updateSetting<K extends keyof RestaurantSettings>(
    key: K,
    value: RestaurantSettings[K],
  ) {
    setSettings((current) => (current ? { ...current, [key]: value } : current));
    saveSettings.mutate({ [key]: value } as Partial<RestaurantSettings>);
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="اطلاعات رستوران"
          description="نامی که مشتری در منو و رسید می‌بیند."
          action={
            <a
              href={restaurant.publicUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-sm text-gold hover:text-gold-bright"
            >
              مشاهده منو
              <ExternalLink className="size-3.5" />
            </a>
          }
        />
        <CardBody className="space-y-4">
          <Input
            label="نام رستوران"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!editable}
          />
          <Input
            label="نشانی عمومی منو"
            dir="ltr"
            value={`/r/${restaurant.slug}`}
            disabled
            hint="این نشانی در کدهای QR چاپ‌شده استفاده می‌شود؛ تغییر آن کدهای قبلی را بی‌اعتبار می‌کند."
          />
          <Textarea
            label="توضیحات"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={!editable}
          />
        </CardBody>
        {editable ? (
          <CardFooter>
            <Button
              variant="primary"
              loading={saveProfile.isPending}
              onClick={() => saveProfile.mutate()}
            >
              ذخیره اطلاعات
            </Button>
          </CardFooter>
        ) : null}
      </Card>

      <Card>
        <CardHeader
          title="ظاهر منوی مشتری"
          description="رنگ و تم منویی که پس از اسکن QR نمایش داده می‌شود."
        />
        <CardBody className="space-y-4">
          <Input
            label="شعار"
            placeholder="قهوه تخصصی و غذای دست‌ساز"
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            disabled={!editable}
          />

          {editable ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <ImageUpload
                value={logoUrl}
                onChange={setLogoUrl}
                folder="branding"
                label="لوگو"
                hint="مربعی، روی هدر منو و رسید چاپی می‌نشیند."
              />
              <ImageUpload
                value={coverUrl}
                onChange={setCoverUrl}
                folder="branding"
                label="تصویر کاور"
                hint="پس‌زمینه بالای منوی مشتری."
              />
            </div>
          ) : null}

          <div>
            <p className="mb-2 text-sm font-medium text-ink-muted">رنگ شاخص</p>
            <div className="flex flex-wrap items-center gap-2">
              {/* The five template accents, so the swatches and the templates agree. */}
              {['#C9A24B', '#C2410C', '#0F766E', '#DC2626', '#57534E'].map((color) => (
                <button
                  key={color}
                  disabled={!editable}
                  onClick={() => setAccentColor(color)}
                  aria-label={`رنگ ${color}`}
                  className={cn(
                    'size-9 rounded-xl border-2 transition-transform',
                    accentColor.toLowerCase() === color.toLowerCase()
                      ? 'border-ink scale-110'
                      : 'border-transparent',
                  )}
                  style={{ background: color }}
                />
              ))}
              <Input
                dir="ltr"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                disabled={!editable}
                containerClassName="w-32"
              />
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-ink-muted">تم منو</p>
            <div className="grid max-w-xs grid-cols-2 gap-2">
              {(['dark', 'light'] as const).map((option) => (
                <button
                  key={option}
                  disabled={!editable}
                  onClick={() => setTheme(option)}
                  className={cn(
                    'flex items-center justify-center gap-2 rounded-xl border p-3 text-sm',
                    theme === option
                      ? 'border-gold/50 bg-gold/[0.08] text-ink'
                      : 'border-line bg-surface-sunken text-ink-muted',
                  )}
                >
                  <Palette className="size-4" />
                  {option === 'dark' ? 'تیره' : 'روشن'}
                </button>
              ))}
            </div>
          </div>
        </CardBody>
        {editable ? (
          <CardFooter>
            <Button
              variant="primary"
              loading={saveBranding.isPending}
              onClick={() => saveBranding.mutate()}
            >
              ذخیره ظاهر
            </Button>
          </CardFooter>
        ) : null}
      </Card>

      <Card>
        <CardHeader
          title="نوع کسب‌وکار"
          description="تعیین می‌کند پیش‌فرض‌ها و متن‌ها چطور تنظیم شوند."
        />
        <CardBody className="grid gap-3 sm:grid-cols-3">
          {(
            [
              [BusinessType.CAFE, 'کافه', 'قهوه، دمنوش و دسر'],
              [BusinessType.RESTAURANT, 'رستوران', 'غذای اصلی و سرو در محل'],
              [BusinessType.FAST_FOOD, 'فست‌فود', 'برگر، پیتزا و ساندویچ'],
            ] as Array<[BusinessType, string, string]>
          ).map(([value, label, hint]) => (
            <button
              key={value}
              disabled={!editable}
              onClick={() => updateSetting('businessType', value)}
              className={cn(
                'flex flex-col items-start gap-1 rounded-xl border p-4 text-start transition-colors',
                settings.businessType === value
                  ? 'border-gold/50 bg-gold/[0.08]'
                  : 'border-line bg-surface-sunken',
                !editable && 'cursor-not-allowed opacity-60',
              )}
            >
              <span className="text-sm font-medium text-ink">{label}</span>
              <span className="text-xs text-ink-subtle">{hint}</span>
            </button>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="نحوه سرویس"
          description="تعیین می‌کند مشتری چه نوع سفارشی می‌تواند ثبت کند و آیا میز دارید یا نه."
        />
        <CardBody className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                [ServiceModeChoice.DINE_IN, 'فقط سرو در محل', 'مشتری سر میز سفارش می‌دهد'],
                [ServiceModeChoice.TAKEAWAY, 'فقط بیرون‌بر', 'بدون میز؛ فقط QR عمومی'],
                [ServiceModeChoice.BOTH, 'هر دو', 'میز و بیرون‌بر با هم'],
              ] as Array<[ServiceModeChoice, string, string]>
            ).map(([value, label, hint]) => (
              <button
                key={value}
                disabled={!editable}
                onClick={() => updateSetting('serviceMode', value)}
                className={cn(
                  'flex flex-col items-start gap-1 rounded-xl border p-4 text-start transition-colors',
                  settings.serviceMode === value
                    ? 'border-gold/50 bg-gold/[0.08]'
                    : 'border-line bg-surface-sunken',
                  !editable && 'cursor-not-allowed opacity-60',
                )}
              >
                <span className="flex items-center gap-2 text-sm font-medium text-ink">
                  <Store className="size-4" />
                  {label}
                </span>
                <span className="text-xs text-ink-subtle">{hint}</span>
              </button>
            ))}
          </div>

          {!tablesEnabled(settings.serviceModes) ? (
            <p className="rounded-xl border border-line bg-surface-sunken p-3 text-xs leading-relaxed text-ink-muted">
              چون فقط بیرون‌بر دارید، بخش «میزها» و QR میز نمایش داده نمی‌شود. مشتری با
              QR عمومی وارد منو می‌شود، شماره موبایلش را وارد می‌کند و شماره سفارش
              می‌گیرد.
            </p>
          ) : null}

          <div className="flex items-center gap-2 text-xs text-ink-subtle">
            <Truck className="size-3.5" />
            ارسال با پیک در نسخه بعدی فعال می‌شود.
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="مشتریان و پیامک"
          description="تعیین می‌کند چه اطلاعاتی از مشتری گرفته شود."
        />
        <CardBody className="space-y-3">
          <Switch
            checked={settings.requireCustomerPhone}
            onChange={(value) => updateSetting('requireCustomerPhone', value)}
            disabled={!editable}
            label="شماره موبایل برای ثبت سفارش الزامی باشد"
            description={
              tablesEnabled(settings.serviceModes)
                ? 'برای سفارش بیرون‌بر همیشه الزامی است. این گزینه آن را برای سرو در محل هم اجباری می‌کند.'
                : 'برای سفارش بیرون‌بر همیشه الزامی است.'
            }
          />
          <Switch
            checked={settings.marketingOptInEnabled}
            onChange={(value) => updateSetting('marketingOptInEnabled', value)}
            disabled={!editable}
            label="پرسیدن رضایت دریافت پیامک تبلیغاتی"
            description="در پایان ثبت سفارش از مشتری پرسیده می‌شود. کمپین‌ها فقط به کسانی می‌روند که موافقت کرده‌اند."
          />
          <Switch
            checked={settings.smsNotificationsEnabled}
            onChange={(value) => updateSetting('smsNotificationsEnabled', value)}
            disabled={!editable}
            label="پیامک وضعیت سفارش"
            description="پیامک‌های تراکنشی مثل «سفارش شما آماده تحویل است»."
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="مالیات و حق سرویس"
          description="این مقادیر توسط سرور روی هر سفارش اعمال می‌شوند."
        />
        <CardBody className="space-y-3">
          <Switch
            checked={settings.taxEnabled}
            onChange={(value) => updateSetting('taxEnabled', value)}
            disabled={!editable}
            label="مالیات بر ارزش افزوده"
            description={`نرخ فعلی: ${toPersianDigits((settings.taxRateBps / 100).toFixed(2))}٪`}
          />
          <Input
            label="نرخ مالیات (درصد)"
            dir="ltr"
            inputMode="decimal"
            value={(settings.taxRateBps / 100).toString()}
            onChange={(e) => {
              const percent = Number(e.target.value);
              if (Number.isFinite(percent)) {
                setSettings((current) =>
                  current ? { ...current, taxRateBps: Math.round(percent * 100) } : current,
                );
              }
            }}
            onBlur={() => updateSetting('taxRateBps', settings.taxRateBps)}
            disabled={!editable || !settings.taxEnabled}
          />

          <Switch
            checked={settings.serviceChargeEnabled}
            onChange={(value) => updateSetting('serviceChargeEnabled', value)}
            disabled={!editable}
            label="حق سرویس"
            description={`نرخ فعلی: ${toPersianDigits((settings.serviceChargeBps / 100).toFixed(2))}٪`}
          />
          <Input
            label="نرخ حق سرویس (درصد)"
            dir="ltr"
            inputMode="decimal"
            value={(settings.serviceChargeBps / 100).toString()}
            onChange={(e) => {
              const percent = Number(e.target.value);
              if (Number.isFinite(percent)) {
                setSettings((current) =>
                  current
                    ? { ...current, serviceChargeBps: Math.round(percent * 100) }
                    : current,
                );
              }
            }}
            onBlur={() => updateSetting('serviceChargeBps', settings.serviceChargeBps)}
            disabled={!editable || !settings.serviceChargeEnabled}
          />
        </CardBody>
      </Card>

      <div>
        <div className="mb-3">
          <h2 className="text-lg font-bold text-ink">طراحی منو</h2>
          <p className="text-sm text-ink-subtle">
            قالب، رنگ، فونت و چیدمان منویی که مشتری بعد از اسکن QR می‌بیند.
          </p>
        </div>
        <MenuThemeCustomizer
          restaurant={restaurant}
          features={subscriptionQuery.data?.entitlements.features ?? null}
          editable={editable}
        />
      </div>

      <SubscriptionCard />

      <Card>
        <CardHeader title="عملیات سفارش" />
        <CardBody className="space-y-3">
          <Switch
            checked={settings.autoConfirmOrders}
            onChange={(value) => updateSetting('autoConfirmOrders', value)}
            disabled={!editable}
            label="ارسال خودکار به آشپزخانه"
            description="سفارش‌های ثبت‌شده با QR بدون نیاز به تأیید صندوق مستقیم به آشپزخانه می‌روند."
          />
          <Input
            label="زمان پیش‌فرض آماده‌سازی (دقیقه)"
            dir="ltr"
            inputMode="numeric"
            value={String(settings.estimatedPrepMinutes)}
            onChange={(e) => {
              const minutes = Number(e.target.value);
              if (Number.isFinite(minutes)) {
                setSettings((current) =>
                  current ? { ...current, estimatedPrepMinutes: minutes } : current,
                );
              }
            }}
            onBlur={() =>
              updateSetting('estimatedPrepMinutes', settings.estimatedPrepMinutes)
            }
            disabled={!editable}
            hint="اگر محصولی زمان بیشتری لازم داشته باشد، همان مقدار بزرگ‌تر اعمال می‌شود."
          />
        </CardBody>
      </Card>
    </div>
  );
}

/**
 * The tenant's own view of its plan.
 *
 * Read-only: a restaurant cannot change its own subscription, only the
 * platform can. Shown here so an owner can see what they have, what they have
 * used, and when it runs out - without opening a support ticket to find out.
 */
function SubscriptionCard() {
  const query = useQuery({
    queryKey: ['subscription'],
    queryFn: () => subscriptionService.get(),
  });

  if (query.isPending || !query.data) return null;
  const { subscription, entitlements } = query.data;
  if (!subscription) return null;

  const tone =
    subscription.status === 'ACTIVE'
      ? 'positive'
      : subscription.status === 'TRIAL'
        ? 'info'
        : subscription.status === 'GRACE_PERIOD'
          ? 'caution'
          : 'critical';

  const rows: Array<[string, number, number | null]> = [
    ['شعبه', entitlements.usage.branches, entitlements.limits.maxBranches],
    ['کاربر', entitlements.usage.staff, entitlements.limits.maxStaff],
    ['محصول', entitlements.usage.products, entitlements.limits.maxProducts],
    ['میز', entitlements.usage.tables, entitlements.limits.maxTables],
    ['سفارش این ماه', entitlements.usage.monthlyOrders, entitlements.limits.maxMonthlyOrders],
    [
      'پیامک تبلیغاتی این ماه',
      entitlements.usage.monthlyMarketingSms,
      entitlements.limits.smsAllowance,
    ],
  ];

  return (
    <Card>
      <CardHeader
        title="اشتراک"
        description="پلن فعلی، میزان استفاده و تاریخ انقضا."
        action={<Badge tone={tone}>{SUBSCRIPTION_STATUS_FA[subscription.status]}</Badge>}
      />
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <div>
            <p className="text-xs text-ink-subtle">پلن</p>
            <p className="font-semibold text-ink">{subscription.plan.nameFa}</p>
          </div>
          {subscription.daysRemaining !== null ? (
            <div>
              <p className="text-xs text-ink-subtle">باقی‌مانده</p>
              <p
                className={cn(
                  'font-semibold tabular-nums',
                  subscription.daysRemaining < 7 ? 'text-critical' : 'text-ink',
                )}
              >
                {subscription.daysRemaining > 0
                  ? `${toPersianDigits(subscription.daysRemaining)} روز`
                  : 'منقضی شده'}
              </p>
            </div>
          ) : null}
          {subscription.suspendedReason ? (
            <div className="w-full rounded-xl border border-critical/30 bg-critical/10 p-3 text-xs text-critical">
              {subscription.suspendedReason}
            </div>
          ) : null}
        </div>

        <div className="overflow-hidden rounded-xl border border-line">
          {rows.map(([label, used, cap]) => {
            const ratio = cap && cap > 0 ? Math.min(1, used / cap) : 0;
            return (
              <div
                key={label}
                className="flex items-center gap-3 border-b border-line px-3 py-2.5 last:border-b-0"
              >
                <span className="w-40 shrink-0 text-xs text-ink-muted">{label}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken">
                  <div
                    className={cn(
                      'h-full rounded-full',
                      ratio >= 1 ? 'bg-critical' : ratio > 0.8 ? 'bg-caution' : 'bg-gold',
                    )}
                    style={{ width: `${Math.round(ratio * 100)}%` }}
                  />
                </div>
                <span className="w-24 shrink-0 text-end text-xs tabular-nums text-ink-subtle">
                  {toPersianDigits(used)}
                  {cap === null ? ' / نامحدود' : ` / ${toPersianDigits(cap)}`}
                </span>
              </div>
            );
          })}
        </div>
      </CardBody>
    </Card>
  );
}

const SUBSCRIPTION_STATUS_FA: Record<string, string> = {
  TRIAL: 'دوره آزمایشی',
  ACTIVE: 'فعال',
  GRACE_PERIOD: 'مهلت تمدید',
  EXPIRED: 'منقضی',
  SUSPENDED: 'معلق',
};
