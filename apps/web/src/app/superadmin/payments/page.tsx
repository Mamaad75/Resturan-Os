'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, MessageSquare, Plus, Save, Trash2 } from 'lucide-react';
import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ErrorState,
  Input,
  Select,
  Skeleton,
  Switch,
  useToast,
} from '@/components/ui';
import { PlatformShell } from '@/features/platform/platform-shell';
import { ApiError } from '@/lib/api-client';
import {
  platformService,
  type PlatformPaymentConfigDto,
  type PlatformSmsConfigDto,
} from '@/services';

const MASK = '••••••';

export default function PlatformPaymentsPage() {
  return (
    <PlatformShell>
      <div className="space-y-4">
        <div>
          <h1 className="text-lg font-bold text-ink">پرداخت آنلاین و پیامک</h1>
          <p className="mt-0.5 text-sm text-ink-subtle">
            درگاه پرداخت مشترک پلتفرم و سرویس پیامک را اینجا تنظیم کنید. تا وقتی
            «فعال» نکرده‌اید هیچ پرداخت واقعی انجام نمی‌شود.
          </p>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <PaymentGatewayCard />
          <SmsServiceCard />
        </div>
      </div>
    </PlatformShell>
  );
}

/* ------------------------------------------------------------------ */
/* Platform payment gateway (provider-agnostic)                        */
/* ------------------------------------------------------------------ */

type CredRow = { key: string; value: string };

function toRows(credentials: Record<string, string>): CredRow[] {
  const rows = Object.entries(credentials).map(([key, value]) => ({ key, value }));
  return rows.length ? rows : [{ key: '', value: '' }];
}

function PaymentGatewayCard() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['platform-payment-config'],
    queryFn: () => platformService.paymentConfig(),
  });

  const [draft, setDraft] = useState<PlatformPaymentConfigDto | null>(null);
  const [rows, setRows] = useState<CredRow[]>([]);
  const [seeded, setSeeded] = useState(false);

  if (query.data && !seeded) {
    setSeeded(true);
    setDraft(query.data);
    setRows(toRows(query.data.credentials));
  }

  const save = useMutation({
    mutationFn: () => {
      if (!draft) throw new Error('no draft');
      const credentials: Record<string, string> = {};
      for (const r of rows) {
        const key = r.key.trim();
        if (key) credentials[key] = r.value;
      }
      return platformService.updatePaymentConfig({
        provider: draft.provider.trim(),
        credentials,
        sandbox: draft.sandbox,
        enabled: draft.enabled,
        commissionBps: draft.commissionBps,
        settleMinHours: draft.settleMinHours,
        settleMaxHours: draft.settleMaxHours,
      });
    },
    onSuccess: (data) => {
      toast.success('تنظیمات درگاه ذخیره شد');
      setDraft(data);
      setRows(toRows(data.credentials));
      void queryClient.invalidateQueries({ queryKey: ['platform-payment-config'] });
    },
    onError: (error) =>
      toast.error('ذخیره نشد', error instanceof ApiError ? error.message : undefined),
  });

  if (query.isPending) return <Skeleton className="h-96 rounded-2xl" />;
  if (query.isError || !draft) return <ErrorState onRetry={() => query.refetch()} />;

  const percent = (draft.commissionBps / 100).toString();

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <CreditCard className="size-4 text-gold" />
            درگاه پرداخت پلتفرم
          </span>
        }
        description="درگاه مشترکی که رستوران‌ها می‌توانند برای دریافت پرداخت آنلاین انتخاب کنند."
        action={
          <Badge tone={draft.enabled ? 'positive' : 'neutral'}>
            {draft.enabled ? 'فعال' : 'خاموش'}
          </Badge>
        }
      />
      <CardBody className="space-y-4">
        <Input
          label="نوع درگاه"
          placeholder="مثلاً zarinpal یا نام درگاه شما"
          hint="هر درگاهی که بعداً تهیه کردید همین‌جا وارد کنید؛ سیستم به یک درگاه خاص وابسته نیست."
          value={draft.provider}
          onChange={(e) => setDraft({ ...draft, provider: e.target.value })}
        />

        <div>
          <p className="mb-1.5 text-sm font-medium text-ink-muted">
            کلیدها و اطلاعات درگاه
          </p>
          <p className="mb-2 text-xs text-ink-subtle">
            مقادیر ذخیره‌شده به‌صورت {MASK} نمایش داده می‌شوند؛ اگر تغییرشان
            ندهید همان مقدار قبلی حفظ می‌شود.
          </p>
          <div className="space-y-2">
            {rows.map((row, i) => (
              <div key={i} className="flex flex-col gap-2 sm:flex-row">
                <Input
                  containerClassName="sm:w-2/5"
                  dir="ltr"
                  placeholder="کلید (merchant_id)"
                  value={row.key}
                  onChange={(e) => {
                    const next = [...rows];
                    next[i] = { ...next[i], key: e.target.value };
                    setRows(next);
                  }}
                />
                <div className="flex flex-1 gap-2">
                  <Input
                    containerClassName="flex-1"
                    dir="ltr"
                    placeholder="مقدار"
                    value={row.value}
                    onChange={(e) => {
                      const next = [...rows];
                      next[i] = { ...next[i], value: e.target.value };
                      setRows(next);
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="حذف"
                    onClick={() => setRows(rows.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            leftIcon={<Plus className="size-4" />}
            onClick={() => setRows([...rows, { key: '', value: '' }])}
          >
            افزودن فیلد
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Input
            label="کارمزد پلتفرم"
            dir="ltr"
            inputMode="decimal"
            rightAddon="٪"
            hint="پیش‌فرض ۴٪"
            value={percent}
            onChange={(e) => {
              const raw = e.target.value.replace(/[^\d.]/g, '');
              const pct = Number(raw);
              setDraft({
                ...draft,
                commissionBps: Number.isFinite(pct) ? Math.round(pct * 100) : 0,
              });
            }}
          />
          <Input
            label="حداقل زمان تسویه"
            dir="ltr"
            inputMode="numeric"
            rightAddon="ساعت"
            value={String(draft.settleMinHours)}
            onChange={(e) =>
              setDraft({
                ...draft,
                settleMinHours: Number(e.target.value.replace(/\D/g, '')) || 0,
              })
            }
          />
          <Input
            label="حداکثر زمان تسویه"
            dir="ltr"
            inputMode="numeric"
            rightAddon="ساعت"
            value={String(draft.settleMaxHours)}
            onChange={(e) =>
              setDraft({
                ...draft,
                settleMaxHours: Number(e.target.value.replace(/\D/g, '')) || 1,
              })
            }
          />
        </div>

        <div className="space-y-2 rounded-xl border border-line bg-surface-sunken p-3">
          <Switch
            checked={draft.sandbox}
            onChange={(sandbox) => setDraft({ ...draft, sandbox })}
            label="حالت آزمایشی (Sandbox)"
            description="تا وقتی درگاه را کامل تست نکرده‌اید روشن بماند."
          />
          <Switch
            checked={draft.enabled}
            onChange={(enabled) => setDraft({ ...draft, enabled })}
            label="درگاه پلتفرم فعال باشد"
            description="با فعال‌شدن، رستوران‌ها می‌توانند این درگاه را انتخاب کنند."
          />
        </div>

        <Button
          variant="primary"
          fullWidth
          leftIcon={<Save className="size-4" />}
          loading={save.isPending}
          onClick={() => save.mutate()}
        >
          ذخیره تنظیمات درگاه
        </Button>
      </CardBody>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* SMS service                                                         */
/* ------------------------------------------------------------------ */

const SMS_PROVIDERS = [
  { value: 'console', label: 'کنسول (فقط لاگ — بدون ارسال واقعی)' },
  { value: 'kavenegar', label: 'کاوه‌نگار' },
  { value: 'sms_ir', label: 'اس‌ام‌اس‌دات‌آی‌آر (SMS.ir)' },
] as const;

function SmsServiceCard() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['platform-sms-config'],
    queryFn: () => platformService.smsConfig(),
  });

  const [draft, setDraft] = useState<PlatformSmsConfigDto | null>(null);
  const [seeded, setSeeded] = useState(false);
  const [apiKeyTouched, setApiKeyTouched] = useState(false);

  if (query.data && !seeded) {
    setSeeded(true);
    setDraft(query.data);
  }

  const save = useMutation({
    mutationFn: () => {
      if (!draft) throw new Error('no draft');
      return platformService.updateSmsConfig({
        provider: draft.provider,
        // Only send the key when the operator actually changed it.
        apiKey: apiKeyTouched ? draft.apiKey : undefined,
        sender: draft.sender,
        enabled: draft.enabled,
      });
    },
    onSuccess: (data) => {
      toast.success('تنظیمات پیامک ذخیره شد');
      setDraft(data);
      setApiKeyTouched(false);
      void queryClient.invalidateQueries({ queryKey: ['platform-sms-config'] });
    },
    onError: (error) =>
      toast.error('ذخیره نشد', error instanceof ApiError ? error.message : undefined),
  });

  if (query.isPending) return <Skeleton className="h-96 rounded-2xl" />;
  if (query.isError || !draft) return <ErrorState onRetry={() => query.refetch()} />;

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <MessageSquare className="size-4 text-gold" />
            سرویس پیامک
          </span>
        }
        description="سرویسی که کدهای تأیید و پیام‌های سیستم با آن ارسال می‌شوند."
        action={
          <Badge tone={draft.enabled ? 'positive' : 'neutral'}>
            {draft.enabled ? 'فعال' : 'خاموش'}
          </Badge>
        }
      />
      <CardBody className="space-y-4">
        <Select
          label="سرویس‌دهنده"
          value={draft.provider}
          options={SMS_PROVIDERS.map((p) => ({ value: p.value, label: p.label }))}
          onChange={(e) =>
            setDraft({ ...draft, provider: e.target.value as PlatformSmsConfigDto['provider'] })
          }
        />
        <Input
          label="کلید API"
          dir="ltr"
          type="text"
          hint="اگر خالی/بدون تغییر بماند، کلید قبلی حفظ می‌شود."
          value={draft.apiKey}
          onChange={(e) => {
            setApiKeyTouched(true);
            setDraft({ ...draft, apiKey: e.target.value });
          }}
        />
        <Input
          label="شمارهٔ فرستنده"
          dir="ltr"
          placeholder="۱۰۰۰..."
          value={draft.sender}
          onChange={(e) => setDraft({ ...draft, sender: e.target.value })}
        />
        <div className="rounded-xl border border-line bg-surface-sunken p-3">
          <Switch
            checked={draft.enabled}
            onChange={(enabled) => setDraft({ ...draft, enabled })}
            label="ارسال واقعی پیامک فعال باشد"
            description="خاموش یعنی پیام‌ها فقط در لاگ سرور ثبت می‌شوند."
          />
        </div>
        <Button
          variant="primary"
          fullWidth
          leftIcon={<Save className="size-4" />}
          loading={save.isPending}
          onClick={() => save.mutate()}
        >
          ذخیره تنظیمات پیامک
        </Button>
      </CardBody>
    </Card>
  );
}
