'use client';

import {
  SERVICE_MODE_LABELS_FA,
  ServiceMode,
  type RestaurantSettings,
} from '@restaurant-os/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Palette, Store, Truck } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
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
import { ApiError } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { toPersianDigits } from '@/lib/format';
import { restaurantService } from '@/services';

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

  function toggleServiceMode(mode: ServiceMode) {
    if (!settings) return;
    const enabled = settings.serviceModes.includes(mode);
    const next = enabled
      ? settings.serviceModes.filter((m) => m !== mode)
      : [...settings.serviceModes, mode];
    // At least one mode must stay on, or customers cannot order at all.
    if (next.length === 0) {
      toast.error('حداقل یک حالت سرویس باید فعال بماند');
      return;
    }
    updateSetting('serviceModes', next);
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
              {['#C9A24B', '#B45309', '#0F766E', '#7C3AED', '#BE123C'].map((color) => (
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
          title="حالت‌های سرویس"
          description="تعیین می‌کند مشتری چه نوع سفارشی می‌تواند ثبت کند."
        />
        <CardBody className="grid gap-3 sm:grid-cols-3">
          {(
            [ServiceMode.DINE_IN, ServiceMode.TAKEAWAY, ServiceMode.DELIVERY] as ServiceMode[]
          ).map((mode) => {
            const enabled = settings.serviceModes.includes(mode);
            const isDelivery = mode === ServiceMode.DELIVERY;
            return (
              <button
                key={mode}
                disabled={!editable || isDelivery}
                onClick={() => toggleServiceMode(mode)}
                className={cn(
                  'flex flex-col items-start gap-1 rounded-xl border p-4 text-start transition-colors',
                  enabled
                    ? 'border-gold/50 bg-gold/[0.08]'
                    : 'border-line bg-surface-sunken',
                  (isDelivery || !editable) && 'cursor-not-allowed opacity-60',
                )}
              >
                <span className="flex items-center gap-2 text-sm font-medium text-ink">
                  {isDelivery ? <Truck className="size-4" /> : <Store className="size-4" />}
                  {SERVICE_MODE_LABELS_FA[mode]}
                </span>
                <span className="text-xs text-ink-subtle">
                  {isDelivery
                    ? 'در نسخه بعدی فعال می‌شود'
                    : enabled
                      ? 'فعال'
                      : 'غیرفعال'}
                </span>
              </button>
            );
          })}
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
          <Switch
            checked={settings.smsNotificationsEnabled}
            onChange={(value) => updateSetting('smsNotificationsEnabled', value)}
            disabled={!editable}
            label="اطلاع‌رسانی پیامکی"
            description="ارسال پیامک در مراحل کلیدی سفارش به مشتریانی که شماره داده‌اند."
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
