'use client';

import { useQuery } from '@tanstack/react-query';
import { Download, Phone, Search, Users } from 'lucide-react';
import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  EmptyState,
  ErrorState,
  Input,
  Skeleton,
  Switch,
} from '@/components/ui';
import { PlatformShell } from '@/features/platform/platform-shell';
import { toPersianDigits } from '@/lib/format';
import { platformService } from '@/services';

export default function PhoneBankPage() {
  return (
    <PlatformShell>
      <PhoneBank />
    </PlatformShell>
  );
}

function PhoneBank() {
  const [search, setSearch] = useState('');
  const [consentOnly, setConsentOnly] = useState(false);

  const query = useQuery({
    queryKey: ['platform-phone-bank', search, consentOnly],
    queryFn: () =>
      platformService.phoneBank({
        search: search.trim() || undefined,
        consentOnly: consentOnly || undefined,
        pageSize: 100,
      }),
  });

  const exportCsv = () => {
    const rows = query.data?.items ?? [];
    const header = 'phone,name,restaurant,orders,marketing_consent,created_at\n';
    const body = rows
      .map((r) =>
        [
          r.phone,
          (r.name ?? '').replace(/,/g, ' '),
          r.restaurantName.replace(/,/g, ' '),
          r.ordersCount,
          r.marketingConsent ? 'yes' : 'no',
          r.createdAt,
        ].join(','),
      )
      .join('\n');
    const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `phone-bank-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-ink">بانک شماره</h1>
        <p className="mt-0.5 text-sm text-ink-subtle">
          شماره‌های جمع‌آوری‌شده از مشتریان همهٔ رستوران‌ها.
        </p>
      </div>

      {query.data ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat icon={<Phone className="size-5" />} label="کل رکوردها" value={query.data.totals.records} />
          <Stat icon={<Users className="size-5" />} label="شماره‌های یکتا" value={query.data.totals.uniquePhones} />
          <Stat
            icon={<Users className="size-5" />}
            label="با رضایت تبلیغاتی"
            value={query.data.totals.consenting}
            tone="brand"
          />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Input
          containerClassName="flex-1 min-w-[12rem]"
          dir="ltr"
          leftAddon={<Search className="size-4" />}
          placeholder="جستجوی شماره"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Switch
          checked={consentOnly}
          onChange={setConsentOnly}
          label="فقط با رضایت تبلیغاتی"
        />
        <Button
          variant="ghost"
          leftIcon={<Download className="size-4" />}
          disabled={!query.data || query.data.items.length === 0}
          onClick={exportCsv}
        >
          خروجی CSV
        </Button>
      </div>

      {query.isPending ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : query.isError ? (
        <ErrorState onRetry={() => query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          icon={<Phone className="size-6" />}
          title="شماره‌ای نیست"
          description="هنوز شماره‌ای از مشتری‌ها ثبت نشده است."
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="bg-surface-sunken text-ink-subtle">
              <tr>
                <th className="p-3 text-start font-medium">شماره</th>
                <th className="p-3 text-start font-medium">نام</th>
                <th className="p-3 text-start font-medium">رستوران</th>
                <th className="p-3 text-center font-medium">سفارش‌ها</th>
                <th className="p-3 text-center font-medium">تبلیغاتی</th>
              </tr>
            </thead>
            <tbody>
              {query.data.items.map((r, i) => (
                <tr key={`${r.phone}-${i}`} className="border-t border-line">
                  <td className="p-3" dir="ltr">
                    <span className="font-mono tabular-nums text-ink">{r.phone}</span>
                  </td>
                  <td className="p-3 text-ink-muted">{r.name ?? '—'}</td>
                  <td className="p-3 text-ink-muted">{r.restaurantName}</td>
                  <td className="p-3 text-center tabular-nums text-ink-muted">
                    {toPersianDigits(r.ordersCount)}
                  </td>
                  <td className="p-3 text-center">
                    {r.marketingConsent ? (
                      <Badge tone="positive">بله</Badge>
                    ) : (
                      <Badge tone="neutral">خیر</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone?: 'brand';
}) {
  return (
    <Card>
      <CardBody className="flex items-center gap-3">
        <span
          className={
            tone === 'brand'
              ? 'flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand'
              : 'flex size-11 shrink-0 items-center justify-center rounded-xl bg-surface-raised text-ink-muted'
          }
        >
          {icon}
        </span>
        <div>
          <p className="text-xs text-ink-subtle">{label}</p>
          <p className="mt-0.5 text-lg font-bold tabular-nums text-ink">
            {toPersianDigits(value)}
          </p>
        </div>
      </CardBody>
    </Card>
  );
}
