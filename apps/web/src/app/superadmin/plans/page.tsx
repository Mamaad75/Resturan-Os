'use client';

import { PLAN_FEATURE_KEYS, PLAN_LIMIT_KEYS, type PlanDto } from '@restaurant-os/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Save, X } from 'lucide-react';
import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ErrorState,
  Input,
  Modal,
  Skeleton,
  Switch,
  useToast,
} from '@/components/ui';
import { PlatformShell } from '@/features/platform/platform-shell';
import { ApiError } from '@/lib/api-client';
import { formatMoney, toPersianDigits } from '@/lib/format';
import { platformService } from '@/services';

const LIMIT_LABEL: Record<string, string> = {
  maxBranches: 'شعبه',
  maxStaff: 'کاربر',
  maxProducts: 'محصول',
  maxTables: 'میز',
  maxMonthlyOrders: 'سفارش ماهانه',
  smsAllowance: 'پیامک تبلیغاتی',
};

const FEATURE_LABEL: Record<string, string> = {
  customThemeEnabled: 'سفارشی‌سازی ظاهر',
  advancedThemeEnabled: 'سفارشی‌سازی پیشرفته',
  customCssEnabled: 'CSS اختصاصی',
  crmEnabled: 'باشگاه مشتریان',
  campaignsEnabled: 'کمپین پیامکی',
  takeawayEnabled: 'بیرون‌بر',
  dineInEnabled: 'سرو در محل',
  waiterCallEnabled: 'صدا زدن گارسون',
  reportsEnabled: 'گزارش‌ها',
  couponsEnabled: 'کد تخفیف',
  multiBranchEnabled: 'چند شعبه',
};

export default function PlansPage() {
  return (
    <PlatformShell>
      <PlanList />
    </PlatformShell>
  );
}

function PlanList() {
  const [editing, setEditing] = useState<PlanDto | null>(null);
  const query = useQuery({
    queryKey: ['platform-plans'],
    queryFn: () => platformService.plans(),
  });

  if (query.isPending) return <Skeleton className="h-64 rounded-2xl" />;
  if (query.isError || !query.data) {
    return <ErrorState onRetry={() => query.refetch()} />;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        {query.data.map((plan) => (
          <Card key={plan.id}>
            <CardHeader
              title={plan.nameFa}
              description={plan.description ?? undefined}
              action={
                <div className="flex gap-1.5">
                  {plan.isDefault ? <Badge tone="gold">پیش‌فرض</Badge> : null}
                  <Badge tone={plan.isActive ? 'positive' : 'neutral'}>
                    {plan.isActive ? 'فعال' : 'غیرفعال'}
                  </Badge>
                </div>
              }
            />
            <CardBody className="space-y-3">
              <p className="text-xl font-bold tabular-nums text-gold">
                {formatMoney(plan.monthlyPrice, 'IRT', { withUnit: false })}
                <span className="text-xs font-normal text-ink-subtle"> / ماه</span>
              </p>

              {plan.subscriberCount !== undefined ? (
                <p className="text-xs text-ink-subtle">
                  {toPersianDigits(plan.subscriberCount)} کسب‌وکار روی این پلن
                </p>
              ) : null}

              <div className="space-y-1">
                {PLAN_LIMIT_KEYS.map((key) => (
                  <div key={key} className="flex justify-between text-xs">
                    <span className="text-ink-muted">{LIMIT_LABEL[key]}</span>
                    <span className="tabular-nums text-ink">
                      {plan[key] === null ? 'نامحدود' : toPersianDigits(plan[key] as number)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-1">
                {PLAN_FEATURE_KEYS.filter((key) => plan[key]).map((key) => (
                  <span
                    key={key}
                    className="inline-flex items-center gap-1 rounded-md bg-positive/10 px-1.5 py-0.5 text-[0.65rem] text-positive"
                  >
                    <Check className="size-2.5" />
                    {FEATURE_LABEL[key]}
                  </span>
                ))}
              </div>

              <Button variant="ghost" fullWidth onClick={() => setEditing(plan)}>
                ویرایش
              </Button>
            </CardBody>
          </Card>
        ))}
      </div>

      <PlanEditor plan={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function PlanEditor({ plan, onClose }: { plan: PlanDto | null; onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<PlanDto | null>(null);
  const [seededFor, setSeededFor] = useState<string | null>(null);

  if (plan && seededFor !== plan.id) {
    setSeededFor(plan.id);
    setDraft(plan);
  }

  const save = useMutation({
    mutationFn: () => {
      if (!draft) throw new Error('no draft');
      const payload: Record<string, unknown> = {
        nameFa: draft.nameFa,
        name: draft.name,
        monthlyPrice: draft.monthlyPrice,
        isActive: draft.isActive,
        isDefault: draft.isDefault,
      };
      for (const key of PLAN_LIMIT_KEYS) payload[key] = draft[key];
      for (const key of PLAN_FEATURE_KEYS) payload[key] = draft[key];
      return platformService.updatePlan(draft.id, payload);
    },
    onSuccess: () => {
      toast.success('پلن به‌روزرسانی شد');
      void queryClient.invalidateQueries({ queryKey: ['platform-plans'] });
      onClose();
    },
    onError: (error) =>
      toast.error(
        'ذخیره انجام نشد',
        error instanceof ApiError ? error.message : undefined,
      ),
  });

  if (!draft) return null;

  return (
    <Modal
      open={plan !== null}
      onClose={onClose}
      title={`ویرایش پلن ${draft.nameFa}`}
      size="lg"
      footer={
        <div className="flex gap-3">
          <Button variant="ghost" onClick={onClose} fullWidth>
            انصراف
          </Button>
          <Button
            variant="primary"
            fullWidth
            leftIcon={<Save className="size-4" />}
            loading={save.isPending}
            onClick={() => save.mutate()}
          >
            ذخیره
          </Button>
        </div>
      }
    >
      <div className="space-y-4 pt-1">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="نام فارسی"
            value={draft.nameFa}
            onChange={(e) => setDraft({ ...draft, nameFa: e.target.value })}
          />
          <Input
            label="قیمت ماهانه"
            dir="ltr"
            inputMode="numeric"
            rightAddon="تومان"
            value={String(draft.monthlyPrice)}
            onChange={(e) =>
              setDraft({ ...draft, monthlyPrice: Number(e.target.value.replace(/\D/g, '')) || 0 })
            }
          />
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-ink-muted">سقف‌ها</p>
          <p className="mb-2 text-xs text-ink-subtle">
            خالی گذاشتن هر مقدار یعنی نامحدود.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {PLAN_LIMIT_KEYS.map((key) => (
              <Input
                key={key}
                label={LIMIT_LABEL[key]}
                dir="ltr"
                inputMode="numeric"
                placeholder="نامحدود"
                value={draft[key] === null ? '' : String(draft[key])}
                onChange={(e) => {
                  const raw = e.target.value.replace(/\D/g, '');
                  setDraft({ ...draft, [key]: raw === '' ? null : Number(raw) });
                }}
              />
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-ink-muted">قابلیت‌ها</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {PLAN_FEATURE_KEYS.map((key) => (
              <Switch
                key={key}
                checked={draft[key]}
                onChange={(value) => setDraft({ ...draft, [key]: value })}
                label={FEATURE_LABEL[key]}
              />
            ))}
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <Switch
            checked={draft.isActive}
            onChange={(value) => setDraft({ ...draft, isActive: value })}
            label="پلن فعال"
            description="پلن غیرفعال به مشتری جدید پیشنهاد نمی‌شود."
          />
          <Switch
            checked={draft.isDefault}
            onChange={(value) => setDraft({ ...draft, isDefault: value })}
            label="پلن پیش‌فرض ثبت‌نام"
          />
        </div>
      </div>
    </Modal>
  );
}
