'use client';

import { useQuery } from '@tanstack/react-query';
import { Building2, Search } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import {
  Badge,
  Card,
  CardBody,
  EmptyState,
  ErrorState,
  Input,
  Select,
  SkeletonList,
} from '@/components/ui';
import { PlatformShell } from '@/features/platform/platform-shell';
import { toPersianDigits } from '@/lib/format';
import {
  BUSINESS_TYPE_LABEL,
  SUBSCRIPTION_STATUS_LABEL,
  SUBSCRIPTION_STATUS_TONE,
} from '@/features/platform/labels';
import { platformService } from '@/services';

export default function TenantsPage() {
  return (
    <PlatformShell>
      <TenantList />
    </PlatformShell>
  );
}

function TenantList() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');

  const query = useQuery({
    queryKey: ['platform-tenants', search, status],
    queryFn: () =>
      platformService.tenants({
        pageSize: 50,
        search: search.trim() || undefined,
        status: status || undefined,
      }),
  });

  const tenants = query.data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          placeholder="جستجوی نام یا نشانی"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leftAddon={<Search className="size-4" />}
          containerClassName="flex-1"
        />
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          placeholder="همه وضعیت‌ها"
          options={Object.entries(SUBSCRIPTION_STATUS_LABEL).map(([value, label]) => ({
            value,
            label,
          }))}
          containerClassName="sm:w-48"
        />
      </div>

      <Card>
        <CardBody className="p-0">
          {query.isPending ? (
            <div className="p-5">
              <SkeletonList rows={6} />
            </div>
          ) : query.isError ? (
            <ErrorState onRetry={() => query.refetch()} />
          ) : tenants.length === 0 ? (
            <EmptyState
              icon={<Building2 className="size-6" />}
              title="کسب‌وکاری پیدا نشد"
              description="فیلترها را تغییر دهید یا عبارت دیگری جستجو کنید."
            />
          ) : (
            <ul className="divide-y divide-line">
              {tenants.map((tenant) => (
                <li key={tenant.id}>
                  <Link
                    href={`/superadmin/tenants/${tenant.id}`}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-surface-raised sm:px-5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-ink">{tenant.name}</span>
                        {tenant.businessType ? (
                          <Badge tone="neutral">
                            {BUSINESS_TYPE_LABEL[tenant.businessType] ?? tenant.businessType}
                          </Badge>
                        ) : null}
                        {!tenant.isActive ? (
                          <Badge tone="critical">غیرفعال</Badge>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-xs text-ink-subtle ltr-nums">
                        {tenant.slug}
                      </p>
                    </div>

                    <div className="hidden text-xs text-ink-subtle sm:block">
                      {toPersianDigits(tenant.counts.branches)} شعبه •{' '}
                      {toPersianDigits(tenant.counts.users)} کاربر •{' '}
                      {toPersianDigits(tenant.counts.orders)} سفارش
                    </div>

                    <div className="flex items-center gap-2">
                      {tenant.subscription ? (
                        <>
                          <span className="text-xs text-ink-muted">
                            {tenant.subscription.plan.nameFa}
                          </span>
                          <Badge tone={SUBSCRIPTION_STATUS_TONE[tenant.subscription.status]}>
                            {SUBSCRIPTION_STATUS_LABEL[tenant.subscription.status]}
                          </Badge>
                        </>
                      ) : (
                        <Badge tone="critical">بدون اشتراک</Badge>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
