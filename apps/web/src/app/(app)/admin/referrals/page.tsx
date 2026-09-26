'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Gift, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  ErrorState,
  Input,
  Select,
  SkeletonList,
  Switch,
  Textarea,
  useToast,
} from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { ApiError } from '@/lib/api-client';
import { formatMoney, toPersianDigits } from '@/lib/format';
import {
  menuService,
  referralService,
  type ReferralRewardType,
} from '@/services';

const REWARD_TYPES: Array<{ value: ReferralRewardType; label: string }> = [
  { value: 'PERCENTAGE', label: 'درصد تخفیف' },
  { value: 'FIXED', label: 'مبلغ ثابت تخفیف' },
  { value: 'FREE_PRODUCT', label: 'یک آیتم رایگان' },
];

/**
 * "Invite a friend", from the owner's side.
 *
 * Three decisions and a switch: what the inviter gets, after how many friends,
 * and whether the friend gets anything too. Everything else - codes, counting,
 * expiry, what a reward is worth on a particular bill - is the server's job.
 */
export default function ReferralsPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const manageable = can('settings:manage');

  const programQuery = useQuery({
    queryKey: ['referral-program'],
    queryFn: () => referralService.program(),
  });
  const productsQuery = useQuery({
    queryKey: ['products', 'referral-picker'],
    queryFn: () => menuService.products({ pageSize: 200 }),
  });
  const products = productsQuery.data?.items ?? [];

  const [isActive, setIsActive] = useState(false);
  const [rewardType, setRewardType] = useState<ReferralRewardType>('PERCENTAGE');
  const [rewardValue, setRewardValue] = useState('10');
  const [rewardProductId, setRewardProductId] = useState('');
  const [invitesRequired, setInvitesRequired] = useState('1');
  const [friendEnabled, setFriendEnabled] = useState(false);
  const [friendRewardType, setFriendRewardType] =
    useState<ReferralRewardType>('PERCENTAGE');
  const [friendRewardValue, setFriendRewardValue] = useState('10');
  const [friendRewardProductId, setFriendRewardProductId] = useState('');
  const [validDays, setValidDays] = useState('30');
  const [terms, setTerms] = useState('');

  // Seeded once from the server, then the form owns the values.
  const loaded = programQuery.data;
  useEffect(() => {
    if (!loaded) return;
    setIsActive(loaded.isActive);
    setRewardType(loaded.rewardType);
    setRewardValue(
      loaded.rewardType === 'PERCENTAGE'
        ? String(Math.round(loaded.rewardValue / 100))
        : String(loaded.rewardValue),
    );
    setRewardProductId(loaded.rewardProductId ?? '');
    setInvitesRequired(String(loaded.invitesRequired));
    setFriendEnabled(loaded.friendRewardType != null);
    setFriendRewardType(loaded.friendRewardType ?? 'PERCENTAGE');
    setFriendRewardValue(
      loaded.friendRewardType === 'PERCENTAGE'
        ? String(Math.round(loaded.friendRewardValue / 100))
        : String(loaded.friendRewardValue),
    );
    setFriendRewardProductId(loaded.friendRewardProductId ?? '');
    setValidDays(String(loaded.rewardValidDays));
    setTerms(loaded.termsFa ?? '');
  }, [loaded]);

  const save = useMutation({
    mutationFn: () =>
      referralService.saveProgram({
        isActive,
        rewardType,
        // A percentage is typed as a percentage and stored as basis points.
        rewardValue:
          rewardType === 'PERCENTAGE'
            ? Math.round(Number(rewardValue) * 100)
            : Number(rewardValue),
        rewardProductId: rewardType === 'FREE_PRODUCT' ? rewardProductId : null,
        invitesRequired: Number(invitesRequired),
        friendRewardType: friendEnabled ? friendRewardType : null,
        friendRewardValue: friendEnabled
          ? friendRewardType === 'PERCENTAGE'
            ? Math.round(Number(friendRewardValue) * 100)
            : Number(friendRewardValue)
          : 0,
        friendRewardProductId:
          friendEnabled && friendRewardType === 'FREE_PRODUCT'
            ? friendRewardProductId
            : null,
        rewardValidDays: Number(validDays),
        termsFa: terms.trim() || null,
      }),
    onSuccess: () => {
      toast.success('ذخیره شد');
      void queryClient.invalidateQueries({ queryKey: ['referral-program'] });
    },
    onError: (error) =>
      toast.error(
        'ذخیره نشد',
        error instanceof ApiError ? error.message : undefined,
      ),
  });

  if (programQuery.isPending) {
    return (
      <Card>
        <CardBody>
          <SkeletonList rows={5} />
        </CardBody>
      </Card>
    );
  }
  if (programQuery.isError) {
    return <ErrorState onRetry={() => programQuery.refetch()} />;
  }

  const productOptions = products.map((product) => ({
    value: product.id,
    label: `${product.nameFa} — ${formatMoney(
      product.discountPrice ?? product.price,
    )}`,
  }));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="دعوت از دوستان"
          description="هر مشتری یک کد دعوت می‌گیرد؛ وقتی دوستش با آن کد سفارش داد، پاداشی که شما تعیین می‌کنید به او تعلق می‌گیرد."
        />
        <CardBody className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Stat
              icon={<Users className="size-4" />}
              label="دعوت‌های پذیرفته‌شده"
              value={toPersianDigits(programQuery.data.invitedTotal)}
            />
            <Stat
              icon={<Gift className="size-4" />}
              label="پاداش‌های صادرشده"
              value={toPersianDigits(programQuery.data.rewardsGranted)}
            />
          </div>

          <Switch
            label="فعال بودن دعوت از دوستان"
            description="تا وقتی خاموش است، هیچ مشتری‌ای کد دعوت نمی‌بیند و پاداشی صادر نمی‌شود."
            checked={isActive}
            onChange={setIsActive}
            disabled={!manageable}
          />

          <fieldset className="space-y-4 rounded-xl border border-line p-4">
            <legend className="px-1 text-sm font-medium text-ink-muted">
              پاداش دعوت‌کننده
            </legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label="نوع پاداش"
                value={rewardType}
                onChange={(e) =>
                  setRewardType(e.target.value as ReferralRewardType)
                }
                options={REWARD_TYPES}
                disabled={!manageable}
              />
              {rewardType === 'FREE_PRODUCT' ? (
                <Select
                  label="کدام آیتم رایگان شود؟"
                  value={rewardProductId}
                  onChange={(e) => setRewardProductId(e.target.value)}
                  placeholder="یک آیتم انتخاب کنید"
                  options={productOptions}
                  disabled={!manageable}
                />
              ) : (
                <Input
                  label={rewardType === 'PERCENTAGE' ? 'درصد تخفیف' : 'مبلغ تخفیف'}
                  dir="ltr"
                  inputMode="numeric"
                  rightAddon={rewardType === 'PERCENTAGE' ? '٪' : 'ت'}
                  value={rewardValue}
                  onChange={(e) =>
                    setRewardValue(e.target.value.replace(/[^\d]/g, ''))
                  }
                  disabled={!manageable}
                />
              )}
            </div>
            <Input
              label="پس از چند دعوت؟"
              dir="ltr"
              inputMode="numeric"
              rightAddon="دوست"
              value={invitesRequired}
              onChange={(e) =>
                setInvitesRequired(e.target.value.replace(/[^\d]/g, ''))
              }
              hint="پاداش برای هر دوره کامل صادر می‌شود؛ مثلاً با عدد ۳، در دعوت سوم و ششم."
              disabled={!manageable}
            />
          </fieldset>

          <fieldset className="space-y-4 rounded-xl border border-line p-4">
            <legend className="px-1 text-sm font-medium text-ink-muted">
              پاداش دوست دعوت‌شده
            </legend>
            <Switch
              label="به دوست دعوت‌شده هم پاداش بده"
              description="روی سفارش بعدی او اعمال می‌شود؛ سفارش اول همان چیزی است که دعوت را به ثمر می‌رساند."
              checked={friendEnabled}
              onChange={setFriendEnabled}
              disabled={!manageable}
            />
            {friendEnabled ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Select
                  label="نوع پاداش"
                  value={friendRewardType}
                  onChange={(e) =>
                    setFriendRewardType(e.target.value as ReferralRewardType)
                  }
                  options={REWARD_TYPES}
                  disabled={!manageable}
                />
                {friendRewardType === 'FREE_PRODUCT' ? (
                  <Select
                    label="کدام آیتم رایگان شود؟"
                    value={friendRewardProductId}
                    onChange={(e) => setFriendRewardProductId(e.target.value)}
                    placeholder="یک آیتم انتخاب کنید"
                    options={productOptions}
                    disabled={!manageable}
                  />
                ) : (
                  <Input
                    label={
                      friendRewardType === 'PERCENTAGE' ? 'درصد تخفیف' : 'مبلغ تخفیف'
                    }
                    dir="ltr"
                    inputMode="numeric"
                    rightAddon={friendRewardType === 'PERCENTAGE' ? '٪' : 'ت'}
                    value={friendRewardValue}
                    onChange={(e) =>
                      setFriendRewardValue(e.target.value.replace(/[^\d]/g, ''))
                    }
                    disabled={!manageable}
                  />
                )}
              </div>
            ) : null}
          </fieldset>

          <Input
            label="اعتبار پاداش"
            dir="ltr"
            inputMode="numeric"
            rightAddon="روز"
            value={validDays}
            onChange={(e) => setValidDays(e.target.value.replace(/[^\d]/g, ''))}
            hint="پاداشی که صادر شده با تغییر این عدد عوض نمی‌شود؛ شرایط روی خودِ پاداش ثبت می‌شود."
            disabled={!manageable}
          />

          <Textarea
            label="شرایط (اختیاری)"
            placeholder="مثلاً: فقط برای سفارش حضوری"
            rows={2}
            maxLength={300}
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            disabled={!manageable}
          />

          {manageable ? (
            <div className="flex justify-end">
              <Button
                variant="primary"
                loading={save.isPending}
                onClick={() => save.mutate()}
              >
                ذخیره
              </Button>
            </div>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface-sunken p-4">
      <p className="flex items-center gap-2 text-xs text-ink-muted">
        <span className="text-gold">{icon}</span>
        {label}
      </p>
      <p className="mt-1.5 text-xl font-bold tabular-nums text-ink">{value}</p>
    </div>
  );
}
