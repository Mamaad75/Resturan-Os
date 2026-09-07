'use client';
import { DEFAULT_GAME_RULES, type GameRules } from '@restaurant-os/types';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
import { gameApi } from '@/features/games/game-api';

export function GameProgram({ editable }: { editable: boolean }) {
  const [form, setForm] = useState<GameRules>({ ...DEFAULT_GAME_RULES });
  const query = useQuery({
    queryKey: ['game-program'],
    queryFn: gameApi.rules,
  });
  const cache = useQueryClient();
  const toast = useToast();
  useEffect(() => {
    if (query.data) setForm(query.data);
  }, [query.data]);
  const save = useMutation({
    mutationFn: () => gameApi.save(form),
    onSuccess: () => {
      toast.success('تنظیمات بازی ذخیره شد');
      void cache.invalidateQueries({ queryKey: ['game-program'] });
    },
    onError: (e) => toast.error('ذخیره نشد', e.message),
  });
  const fields: {
    key: Exclude<keyof GameRules, 'isEnabled'>;
    label: string;
    min: number;
    max: number;
  }[] = [
    {
      key: 'dailyLimit',
      label: 'تعداد نوبت پاداش‌دار روزانه هر مشتری',
      min: 1,
      max: 5,
    },
    {
      key: 'pointsPerWin',
      label: 'حداکثر امتیاز کیف برای هر بازی',
      min: 1,
      max: 100,
    },
    {
      key: 'couponCost',
      label: 'هزینه دریافت کد (امتیاز کیف)',
      min: 10,
      max: 10000,
    },
    {
      key: 'couponMaxDiscount',
      label: 'سقف هر کد تخفیف (تومان)',
      min: 1000,
      max: 500000,
    },
    {
      key: 'couponMinOrder',
      label: 'حداقل سفارش برای کد (تومان)',
      min: 0,
      max: 10000000,
    },
  ];
  return (
    <Card>
      <CardHeader
        title="بازی‌های دور میز"
        description="بازی حافظه، محاسبه و دوز دوستانه؛ با پاداش قابل کنترل برای مشتری‌ها."
      />
      <CardBody className="space-y-5">
        {query.isError ? (
          <p role="alert" className="text-sm text-critical">
            تنظیمات دریافت نشد.{' '}
            <button className="underline" onClick={() => void query.refetch()}>
              تلاش دوباره
            </button>
          </p>
        ) : null}
        <Switch
          checked={form.isEnabled}
          onChange={(checked) => setForm((f) => ({ ...f, isEnabled: checked }))}
          disabled={!editable || query.isPending || query.isError}
          label="فعال‌سازی پاداش بازی"
          description="باشگاه مشتریان و قابلیت کد تخفیف پلن باید فعال باشند. بازی تمرینی همیشه در دسترس است."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map(({ key, label, min, max }) => (
            <Input
              key={key}
              type="number"
              min={min}
              max={max}
              label={label}
              value={form[key]}
              disabled={!editable || query.isPending || query.isError}
              onChange={(e) =>
                setForm((f) => ({ ...f, [key]: Number(e.target.value) }))
              }
            />
          ))}
        </div>
        <p className="text-xs leading-7 text-ink-muted">
          پاداش تا ۷ روز بعد از تکمیل و پرداخت سفارش فعال است؛ برای هر سفارش یک
          نوبت از هر بازی. سطح ۲ به ۱۰۰ امتیاز پیشرفت نیاز دارد. کدها از ۵٪ تا
          ۱۰٪، یک‌بارمصرف و با اعتبار ۷ روز هستند. امتیاز بازی در همان کیف
          باشگاه ثبت می‌شود و طبق قوانین باشگاه هم قابل خرج‌کردن است. دوز امتیاز
          کیف ندارد.
        </p>
      </CardBody>
      {editable && (
        <CardFooter>
          <Button
            disabled={query.isPending || query.isError}
            loading={save.isPending}
            onClick={() => save.mutate()}
          >
            ذخیره تنظیمات بازی
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
