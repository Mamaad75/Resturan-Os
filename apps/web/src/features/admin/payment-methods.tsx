'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Save, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Input,
  Skeleton,
  Switch,
  useToast,
} from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import {
  paymentConfigService,
  type OnlinePaymentMode,
  type TenantPaymentConfigDto,
} from '@/services';

const MASK = '••••••';

type CredRow = { key: string; value: string };

function toRows(credentials: Record<string, string>): CredRow[] {
  const rows = Object.entries(credentials).map(([key, value]) => ({ key, value }));
  return rows.length ? rows : [{ key: '', value: '' }];
}

/**
 * The restaurant owner decides which ways a customer may pay: cash and the
 * in-person card reader are simple on/off switches; "online" additionally
 * needs a gateway — either the platform's shared one (a commission applies and
 * the platform settles the money to the restaurant) or the restaurant's own.
 * A customer only ever sees the methods enabled here.
 */
export function PaymentMethods({ editable }: { editable: boolean }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['payment-config'],
    queryFn: () => paymentConfigService.get(),
  });

  const [draft, setDraft] = useState<TenantPaymentConfigDto | null>(null);
  const [rows, setRows] = useState<CredRow[]>([]);

  useEffect(() => {
    if (query.data) {
      setDraft(query.data);
      setRows(toRows(query.data.ownCredentials));
    }
  }, [query.data]);

  const save = useMutation({
    mutationFn: () => {
      if (!draft) throw new Error('no draft');
      const ownCredentials: Record<string, string> = {};
      for (const r of rows) {
        const key = r.key.trim();
        if (key) ownCredentials[key] = r.value;
      }
      return paymentConfigService.update({
        mode: draft.mode,
        ownProvider: draft.mode === 'OWN' ? draft.ownProvider ?? '' : null,
        ownCredentials: draft.mode === 'OWN' ? ownCredentials : undefined,
        ownSandbox: draft.ownSandbox,
        cashEnabled: draft.cashEnabled,
        cardOnSiteEnabled: draft.cardOnSiteEnabled,
      });
    },
    onSuccess: (data) => {
      toast.success('روش‌های پرداخت ذخیره شد');
      setDraft(data);
      setRows(toRows(data.ownCredentials));
      void queryClient.invalidateQueries({ queryKey: ['payment-config'] });
    },
    onError: (error) =>
      toast.error('ذخیره نشد', error instanceof ApiError ? error.message : undefined),
  });

  if (query.isPending) return <Skeleton className="h-64 rounded-2xl" />;
  if (query.isError || !draft) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-ink-muted">دریافت تنظیمات پرداخت ممکن نشد.</p>
        </CardBody>
      </Card>
    );
  }

  const onlineEnabled = draft.mode !== 'OFF';
  const setMode = (mode: OnlinePaymentMode) => setDraft({ ...draft, mode });

  return (
    <Card>
      <CardHeader
        title="روش‌های پرداخت"
        description="مشخص کنید مشتری بعد از سرو سفارش با چه روش‌هایی می‌تواند پرداخت کند."
      />
      <CardBody className="space-y-3">
        <Switch
          checked={draft.cashEnabled}
          disabled={!editable}
          onChange={(v) => setDraft({ ...draft, cashEnabled: v })}
          label="پرداخت نقدی"
          description="مشتری وجه را نقدی به صندوق می‌پردازد."
        />
        <Switch
          checked={draft.cardOnSiteEnabled}
          disabled={!editable}
          onChange={(v) => setDraft({ ...draft, cardOnSiteEnabled: v })}
          label="کارت‌خوان حضوری"
          description="پرداخت با دستگاه کارت‌خوانِ خودِ رستوران در محل."
        />

        <Switch
          checked={onlineEnabled}
          disabled={!editable}
          onChange={(v) => setMode(v ? (draft.platformAvailable ? 'PLATFORM' : 'OWN') : 'OFF')}
          label="پرداخت آنلاین"
          description="مشتری از صفحهٔ پیگیری سفارش آنلاین پرداخت می‌کند و وضعیت سفارش خودکار «پرداخت‌شده» می‌شود."
        />

        {onlineEnabled ? (
          <div className="space-y-3 rounded-xl border border-line p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <GatewayChoice
                active={draft.mode === 'PLATFORM'}
                disabled={!editable || !draft.platformAvailable}
                title="درگاه پلتفرم"
                hint={
                  draft.platformAvailable
                    ? `کارمزد ${(draft.platformCommissionBps / 100).toLocaleString('fa-IR')}٪ · تسویه توسط پلتفرم`
                    : 'فعلاً از سمت پلتفرم فعال نشده'
                }
                onClick={() => setMode('PLATFORM')}
              />
              <GatewayChoice
                active={draft.mode === 'OWN'}
                disabled={!editable}
                title="درگاه شخصی"
                hint="درگاه اختصاصی خودتان؛ بدون کارمزد پلتفرم"
                onClick={() => setMode('OWN')}
              />
            </div>

            {draft.mode === 'OWN' ? (
              <div className="space-y-3 rounded-lg bg-surface-sunken p-3">
                <Input
                  label="نوع درگاه"
                  placeholder="مثلاً zarinpal"
                  disabled={!editable}
                  value={draft.ownProvider ?? ''}
                  onChange={(e) => setDraft({ ...draft, ownProvider: e.target.value })}
                />
                <div>
                  <p className="mb-1.5 text-xs text-ink-subtle">
                    کلیدها و اطلاعات درگاه (مقادیر ذخیره‌شده به‌صورت {MASK} نمایش داده
                    می‌شوند).
                  </p>
                  <div className="space-y-2">
                    {rows.map((row, i) => (
                      <div key={i} className="flex flex-col gap-2 sm:flex-row">
                        <Input
                          containerClassName="sm:w-2/5"
                          dir="ltr"
                          placeholder="کلید (merchant_id)"
                          disabled={!editable}
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
                            disabled={!editable}
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
                            disabled={!editable}
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
                    disabled={!editable}
                    leftIcon={<Plus className="size-4" />}
                    onClick={() => setRows([...rows, { key: '', value: '' }])}
                  >
                    افزودن فیلد
                  </Button>
                </div>
                <Switch
                  checked={draft.ownSandbox}
                  disabled={!editable}
                  onChange={(v) => setDraft({ ...draft, ownSandbox: v })}
                  label="حالت آزمایشی (Sandbox)"
                  description="تا وقتی درگاه را کامل تست نکرده‌اید روشن بماند."
                />
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-sunken p-3 text-xs text-ink-subtle">
                <Badge tone={draft.platformAvailable ? 'positive' : 'neutral'}>
                  {draft.platformAvailable ? 'آماده' : 'غیرفعال'}
                </Badge>
                پرداخت‌ها از درگاه مشترک پلتفرم انجام و پس از کسر کارمزد به شما تسویه می‌شود.
              </div>
            )}
          </div>
        ) : null}

        <div className="flex justify-end pt-1">
          <Button
            variant="primary"
            leftIcon={<Save className="size-4" />}
            loading={save.isPending}
            disabled={!editable}
            onClick={() => save.mutate()}
          >
            ذخیره روش‌های پرداخت
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function GatewayChoice({
  active,
  disabled,
  title,
  hint,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'rounded-xl border p-3 text-start transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        active
          ? 'border-brand bg-brand/10'
          : 'border-line hover:border-line-strong hover:bg-surface-raised',
      )}
    >
      <span className={cn('text-sm font-medium', active ? 'text-brand' : 'text-ink')}>
        {title}
      </span>
      <span className="mt-0.5 block text-xs text-ink-subtle">{hint}</span>
    </button>
  );
}
