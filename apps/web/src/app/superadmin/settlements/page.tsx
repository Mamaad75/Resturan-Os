'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, CheckCircle2, Wallet } from 'lucide-react';
import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  EmptyState,
  ErrorState,
  Skeleton,
  useToast,
} from '@/components/ui';
import { PlatformShell } from '@/features/platform/platform-shell';
import { ApiError } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { formatMoney, toPersianDigits } from '@/lib/format';
import { platformService, type SettlementDto, type SettlementStatus } from '@/services';

const STATUS_TABS = [
  { value: 'PENDING', label: 'در انتظار تسویه' },
  { value: 'SETTLED', label: 'تسویه‌شده' },
  { value: 'CANCELLED', label: 'لغوشده' },
] as const;

const STATUS_TONE: Record<SettlementStatus, 'info' | 'positive' | 'neutral'> = {
  PENDING: 'info',
  SETTLED: 'positive',
  CANCELLED: 'neutral',
};

export default function SettlementsPage() {
  return (
    <PlatformShell>
      <Settlements />
    </PlatformShell>
  );
}

function Settlements() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<string>('PENDING');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const query = useQuery({
    queryKey: ['platform-settlements', status],
    queryFn: () => platformService.settlements({ status, pageSize: 100 }),
  });

  const settle = useMutation({
    mutationFn: (ids: string[]) => platformService.settle({ ids }),
    onSuccess: ({ settled }) => {
      toast.success(`${toPersianDigits(settled)} مورد تسویه شد`);
      setSelected(new Set());
      void queryClient.invalidateQueries({ queryKey: ['platform-settlements'] });
    },
    onError: (error) =>
      toast.error('تسویه انجام نشد', error instanceof ApiError ? error.message : undefined),
  });

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const items = query.data?.items ?? [];
  const pendingItems = items.filter((s) => s.status === 'PENDING');
  const allSelected = pendingItems.length > 0 && pendingItems.every((s) => selected.has(s.id));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-ink">تسویه با رستوران‌ها</h1>
        <p className="mt-0.5 text-sm text-ink-subtle">
          پرداخت‌هایی که از درگاه پلتفرم دریافت شده و باید پس از کسر کارمزد به
          رستوران‌ها پرداخت شوند.
        </p>
      </div>

      {query.data ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <SummaryCard
            icon={<Wallet className="size-5" />}
            label="مجموع در انتظار پرداخت به رستوران‌ها"
            value={formatMoney(query.data.totals?.pendingNet ?? 0, 'IRT')}
          />
          <SummaryCard
            icon={<Banknote className="size-5" />}
            label="مجموع کارمزد پلتفرم (در انتظار)"
            value={formatMoney(query.data.totals?.pendingCommission ?? 0, 'IRT')}
            tone="gold"
          />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <div className="no-scrollbar flex flex-1 gap-1 overflow-x-auto">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => {
                setStatus(tab.value);
                setSelected(new Set());
              }}
              className={cn(
                'shrink-0 rounded-lg px-3 py-2 text-sm transition-colors',
                status === tab.value
                  ? 'bg-gold/10 text-gold'
                  : 'text-ink-muted hover:bg-surface-raised hover:text-ink',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {status === 'PENDING' && pendingItems.length > 0 ? (
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setSelected(
                  allSelected ? new Set() : new Set(pendingItems.map((s) => s.id)),
                )
              }
            >
              {allSelected ? 'برداشتن انتخاب' : 'انتخاب همه'}
            </Button>
            <Button
              variant="primary"
              size="sm"
              className="flex-1 sm:flex-none"
              leftIcon={<CheckCircle2 className="size-4" />}
              disabled={selected.size === 0}
              loading={settle.isPending}
              onClick={() => settle.mutate([...selected])}
            >
              تسویه {selected.size > 0 ? `(${toPersianDigits(selected.size)})` : ''}
            </Button>
          </div>
        ) : null}
      </div>

      {query.isPending ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : query.isError ? (
        <ErrorState onRetry={() => query.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Wallet className="size-6" />}
          title="موردی نیست"
          description="در این وضعیت تسویه‌ای ثبت نشده است."
        />
      ) : (
        <div className="space-y-2">
          {items.map((s) => (
            <SettlementRow
              key={s.id}
              settlement={s}
              selectable={s.status === 'PENDING'}
              checked={selected.has(s.id)}
              onToggle={() => toggle(s.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: 'gold';
}) {
  return (
    <Card>
      <CardBody className="flex items-center gap-3">
        <span
          className={cn(
            'flex size-11 shrink-0 items-center justify-center rounded-xl',
            tone === 'gold' ? 'bg-gold/10 text-gold' : 'bg-surface-raised text-ink-muted',
          )}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-xs text-ink-subtle">{label}</p>
          <p className="mt-0.5 truncate text-lg font-bold tabular-nums text-ink">{value}</p>
        </div>
      </CardBody>
    </Card>
  );
}

function SettlementRow({
  settlement: s,
  selectable,
  checked,
  onToggle,
}: {
  settlement: SettlementDto;
  selectable: boolean;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <Card>
      <CardBody className="flex flex-wrap items-center gap-x-4 gap-y-3">
        {selectable ? (
          <input
            type="checkbox"
            checked={checked}
            onChange={onToggle}
            className="size-5 shrink-0 accent-gold"
            aria-label="انتخاب برای تسویه"
          />
        ) : null}

        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-ink">{s.tenant.name}</p>
          <p className="mt-0.5 text-xs text-ink-subtle">
            سفارش #{toPersianDigits(String(s.orderNumber))} ·{' '}
            {new Date(s.createdAt).toLocaleDateString('fa-IR')}
          </p>
        </div>

        <div className="text-end">
          <p className="text-xs text-ink-subtle">مبلغ کل</p>
          <p className="tabular-nums text-ink-muted">{formatMoney(s.grossAmount, 'IRT')}</p>
        </div>
        <div className="text-end">
          <p className="text-xs text-ink-subtle">کارمزد</p>
          <p className="tabular-nums text-ink-muted">
            {formatMoney(s.commissionAmount, 'IRT')}
          </p>
        </div>
        <div className="text-end">
          <p className="text-xs text-ink-subtle">سهم رستوران</p>
          <p className="font-bold tabular-nums text-gold">{formatMoney(s.netAmount, 'IRT')}</p>
        </div>

        <div className="flex flex-col items-end gap-1">
          <Badge tone={STATUS_TONE[s.status]}>
            {STATUS_TABS.find((t) => t.value === s.status)?.label ?? s.status}
          </Badge>
          {s.status === 'PENDING' ? (
            <span className="text-[0.65rem] text-ink-subtle">
              مهلت: {new Date(s.dueAt).toLocaleDateString('fa-IR')}
            </span>
          ) : s.settledAt ? (
            <span className="text-[0.65rem] text-ink-subtle">
              {new Date(s.settledAt).toLocaleDateString('fa-IR')}
            </span>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}
