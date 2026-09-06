'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Gift, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Input,
  Switch,
  useToast,
} from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { formatMoney, toPersianDigits } from '@/lib/format';
import { loyaltyService, type LoyaltyRulesDto } from '@/services';

const DEFAULTS: LoyaltyRulesDto = {
  isEnabled: false,
  pointsPerThousand: 1,
  tomanPerPoint: 1_000,
  minRedeemPoints: 50,
  maxRedeemBps: 5_000,
  welcomePoints: 0,
  expiryDays: null,
};

/**
 * The points scheme.
 *
 * Every field is phrased as the sentence a customer would be told, and the
 * worked example underneath spells the scheme out in Toman - a rate expressed
 * only in basis points is a rate nobody checks.
 */
export function LoyaltyProgram({ editable }: { editable: boolean }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<LoyaltyRulesDto>(DEFAULTS);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const query = useQuery({
    queryKey: ['loyalty-program'],
    queryFn: () => loyaltyService.program(),
  });

  useEffect(() => {
    if (query.data) setForm(query.data);
  }, [query.data]);

  const save = useMutation({
    mutationFn: () => loyaltyService.saveProgram(form),
    onSuccess: () => {
      toast.success('باشگاه مشتریان ذخیره شد');
      setErrors({});
      void queryClient.invalidateQueries({ queryKey: ['loyalty-program'] });
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        toast.error('ذخیره نشد', error.message);
        if (error.details) {
          setErrors(
            Object.fromEntries(
              Object.entries(error.details).map(([key, list]) => [key, list[0]]),
            ),
          );
        }
      }
    },
  });

  const num = (value: string) => Number(value.replace(/\D/g, '')) || 0;
  const set = <K extends keyof LoyaltyRulesDto>(key: K, value: LoyaltyRulesDto[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  // A worked example on a 500,000 Toman bill, which is what an owner pictures.
  const sample = 500_000;
  const earned = Math.floor((sample / 1_000) * form.pointsPerThousand);

  return (
    <Card>
      <CardHeader
        title="باشگاه مشتریان"
        description="مشتری با هر خرید امتیاز می‌گیرد و در سفارش بعدی خرج می‌کند."
        action={<Sparkles className="size-4 text-gold" />}
      />
      <CardBody className="space-y-4">
        <Switch
          checked={form.isEnabled}
          onChange={(value) => set('isEnabled', value)}
          disabled={!editable}
          label="باشگاه مشتریان فعال باشد"
          description="تا وقتی خاموش است، نه امتیازی داده می‌شود و نه خرج."
        />

        {form.isEnabled ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="امتیاز به ازای هر ۱۰۰۰ تومان"
                dir="ltr"
                inputMode="numeric"
                value={String(form.pointsPerThousand)}
                onChange={(e) => set('pointsPerThousand', num(e.target.value))}
                error={errors.pointsPerThousand}
                disabled={!editable}
              />
              <Input
                label="ارزش هر امتیاز"
                dir="ltr"
                inputMode="numeric"
                rightAddon="تومان"
                value={String(form.tomanPerPoint)}
                onChange={(e) => set('tomanPerPoint', num(e.target.value))}
                error={errors.tomanPerPoint}
                disabled={!editable}
              />
              <Input
                label="حداقل امتیاز برای استفاده"
                dir="ltr"
                inputMode="numeric"
                hint="تا این عدد جمع نشود، قابل خرج کردن نیست."
                value={String(form.minRedeemPoints)}
                onChange={(e) => set('minRedeemPoints', num(e.target.value))}
                error={errors.minRedeemPoints}
                disabled={!editable}
              />
              <Input
                label="سقف پرداخت با امتیاز"
                dir="ltr"
                inputMode="numeric"
                rightAddon="٪"
                hint="بیشترین سهمی از یک فاکتور که با امتیاز پرداخت می‌شود."
                value={String(Math.round(form.maxRedeemBps / 100))}
                onChange={(e) =>
                  set('maxRedeemBps', Math.min(100, num(e.target.value)) * 100)
                }
                error={errors.maxRedeemBps}
                disabled={!editable}
              />
              <Input
                label="امتیاز خوش‌آمدگویی"
                dir="ltr"
                inputMode="numeric"
                hint="یک‌بار، در اولین سفارش هر شماره."
                value={String(form.welcomePoints)}
                onChange={(e) => set('welcomePoints', num(e.target.value))}
                error={errors.welcomePoints}
                disabled={!editable}
              />
              <Input
                label="انقضای امتیاز"
                dir="ltr"
                inputMode="numeric"
                rightAddon="روز"
                hint="خالی یعنی امتیازها منقضی نمی‌شوند."
                value={form.expiryDays == null ? '' : String(form.expiryDays)}
                onChange={(e) => {
                  const value = e.target.value.trim();
                  set('expiryDays', value === '' ? null : num(value));
                }}
                error={errors.expiryDays}
                disabled={!editable}
              />
            </div>

            <div className="flex items-start gap-2 rounded-xl border border-gold/30 bg-gold/[0.06] p-3 text-xs leading-relaxed text-ink-muted">
              <Gift className="mt-0.5 size-3.5 shrink-0 text-gold" />
              <span>
                مثال: خرید {formatMoney(sample, 'IRT')} به مشتری{' '}
                <b className="text-gold">{toPersianDigits(earned)} امتیاز</b> می‌دهد،
                معادل {formatMoney(earned * form.tomanPerPoint, 'IRT')} برای سفارش
                بعدی.
              </span>
            </div>
          </>
        ) : null}
      </CardBody>
      {editable ? (
        <CardFooter>
          <Button
            variant="primary"
            loading={save.isPending}
            onClick={() => save.mutate()}
          >
            ذخیره باشگاه مشتریان
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  );
}
