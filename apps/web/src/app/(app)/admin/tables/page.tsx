'use client';

import {
  RealtimeEvent,
  TABLE_STATUS_LABELS_FA,
  TableStatus,
  type TableDto,
} from '@restaurant-os/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LayoutGrid, Plus, Table2 } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  Modal,
  Skeleton,
  TableStatusBadge,
  useToast,
} from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { useRealtime } from '@/hooks/use-realtime';
import { ApiError } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { formatMoney, formatRelativeFa, toPersianDigits } from '@/lib/format';
import { tableService } from '@/services';

const STATUS_STYLES: Record<TableStatus, string> = {
  [TableStatus.AVAILABLE]:
    'border-positive/35 bg-positive/[0.07] text-positive hover:border-positive/60',
  [TableStatus.OCCUPIED]: 'border-gold/40 bg-gold/[0.08] text-gold hover:border-gold/70',
  [TableStatus.WAITING_PAYMENT]:
    'border-caution/40 bg-caution/[0.08] text-caution hover:border-caution/70',
  [TableStatus.RESERVED]: 'border-info/35 bg-info/[0.07] text-info hover:border-info/60',
  [TableStatus.DISABLED]: 'border-line bg-surface-sunken text-ink-subtle',
};

export default function TablesPage() {
  const { accessToken, can } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [selected, setSelected] = useState<TableDto | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const tablesQuery = useQuery({
    queryKey: ['tables'],
    queryFn: () => tableService.list(),
    refetchInterval: 45_000,
  });

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['tables'] });
  }, [queryClient]);

  useRealtime({
    token: accessToken,
    handlers: {
      [RealtimeEvent.TABLE_UPDATED]: refresh,
      [RealtimeEvent.ORDER_STATUS_CHANGED]: refresh,
      [RealtimeEvent.ORDER_CREATED]: refresh,
    },
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TableStatus }) =>
      tableService.update(id, { status }),
    onSuccess: () => {
      toast.success('وضعیت میز به‌روزرسانی شد');
      setSelected(null);
      refresh();
    },
    onError: (error) =>
      toast.error(
        'تغییر وضعیت انجام نشد',
        error instanceof ApiError ? error.message : undefined,
      ),
  });

  const tables = tablesQuery.data ?? [];

  const zones = useMemo(() => {
    const grouped = new Map<string, TableDto[]>();
    for (const table of tables) {
      const zone = table.zone ?? 'بدون محدوده';
      grouped.set(zone, [...(grouped.get(zone) ?? []), table]);
    }
    return [...grouped.entries()];
  }, [tables]);

  const summary = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const table of tables) {
      counts[table.status] = (counts[table.status] ?? 0) + 1;
    }
    return counts;
  }, [tables]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(TABLE_STATUS_LABELS_FA) as TableStatus[]).map((status) =>
            summary[status] ? (
              <Badge key={status} tone="neutral">
                <span
                  className={cn(
                    'size-2 rounded-full',
                    status === TableStatus.AVAILABLE && 'bg-positive',
                    status === TableStatus.OCCUPIED && 'bg-gold',
                    status === TableStatus.WAITING_PAYMENT && 'bg-caution',
                    status === TableStatus.RESERVED && 'bg-info',
                    status === TableStatus.DISABLED && 'bg-ink-subtle',
                  )}
                />
                {TABLE_STATUS_LABELS_FA[status]} {toPersianDigits(summary[status])}
              </Badge>
            ) : null,
          )}
        </div>

        {can('table:manage') ? (
          <Button
            variant="primary"
            size="sm"
            className="ms-auto"
            leftIcon={<Plus className="size-4" />}
            onClick={() => setAddOpen(true)}
          >
            افزودن میز
          </Button>
        ) : null}
      </div>

      {tablesQuery.isPending ? (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-8">
          {Array.from({ length: 16 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-2xl" />
          ))}
        </div>
      ) : tablesQuery.isError ? (
        <ErrorState onRetry={() => tablesQuery.refetch()} />
      ) : tables.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Table2 className="size-6" />}
            title="هنوز میزی تعریف نشده"
            description="برای شروع سفارش‌گیری در محل، چیدمان میزها را بسازید."
            action={
              can('table:manage') ? (
                <Button variant="primary" onClick={() => setAddOpen(true)}>
                  ساخت چیدمان میزها
                </Button>
              ) : null
            }
          />
        </Card>
      ) : (
        zones.map(([zone, zoneTables]) => (
          <section key={zone}>
            <h2 className="gold-rule mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
              <LayoutGrid className="size-4 text-ink-subtle" />
              {zone}
              <span className="text-xs font-normal text-ink-subtle">
                ({toPersianDigits(zoneTables.length)} میز)
              </span>
            </h2>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-8">
              {zoneTables.map((table) => (
                <button
                  key={table.id}
                  onClick={() => setSelected(table)}
                  className={cn(
                    'flex aspect-square flex-col items-center justify-center rounded-2xl border-2 p-2 transition-colors',
                    STATUS_STYLES[table.status],
                  )}
                >
                  <span className="text-xl font-bold tabular-nums">
                    {toPersianDigits(table.number)}
                  </span>
                  <span className="mt-0.5 text-[0.65rem] opacity-85">
                    {TABLE_STATUS_LABELS_FA[table.status]}
                  </span>
                  {table.activeOrder ? (
                    <span className="mt-1 text-[0.65rem] font-medium tabular-nums opacity-90">
                      {formatMoney(table.activeOrder.total, 'IRT', { withUnit: false })}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </section>
        ))
      )}

      <TableDetailModal
        table={selected}
        onClose={() => setSelected(null)}
        onSetStatus={(status) =>
          selected && setStatus.mutate({ id: selected.id, status })
        }
        canManage={can('table:manage')}
        pending={setStatus.isPending}
      />

      <AddTablesModal open={addOpen} onClose={() => setAddOpen(false)} onDone={refresh} />
    </div>
  );
}

function TableDetailModal({
  table,
  onClose,
  onSetStatus,
  canManage,
  pending,
}: {
  table: TableDto | null;
  onClose: () => void;
  onSetStatus: (status: TableStatus) => void;
  canManage: boolean;
  pending: boolean;
}) {
  if (!table) return null;

  return (
    <Modal
      open={table !== null}
      onClose={onClose}
      title={`میز ${toPersianDigits(table.number)}`}
      description={`${toPersianDigits(table.capacity)} نفره${table.zone ? ` • ${table.zone}` : ''}`}
      size="sm"
    >
      <div className="space-y-4 pt-1">
        <div className="flex items-center justify-between">
          <span className="text-sm text-ink-muted">وضعیت فعلی</span>
          <TableStatusBadge status={table.status} />
        </div>

        {table.activeOrder ? (
          <div className="rounded-xl border border-line bg-surface-sunken p-4">
            <p className="text-sm font-medium text-ink">
              سفارش باز #{toPersianDigits(table.activeOrder.orderNumber)}
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              {toPersianDigits(table.activeOrder.itemCount)} قلم •{' '}
              {formatRelativeFa(table.activeOrder.openedAt)}
            </p>
            <p className="mt-2 text-lg font-bold text-gold">
              {formatMoney(table.activeOrder.total)}
            </p>
            <Link href={`/admin/orders/${table.activeOrder.id}`} className="mt-3 block">
              <Button variant="primary" fullWidth>
                مشاهده و تسویه سفارش
              </Button>
            </Link>
          </div>
        ) : (
          <p className="rounded-xl border border-line bg-surface-sunken p-4 text-sm text-ink-muted">
            سفارش بازی روی این میز ثبت نشده است.
          </p>
        )}

        {canManage ? (
          <div>
            <p className="mb-2 text-sm font-medium text-ink-muted">تغییر وضعیت</p>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  TableStatus.AVAILABLE,
                  TableStatus.RESERVED,
                  TableStatus.WAITING_PAYMENT,
                  TableStatus.DISABLED,
                ] as TableStatus[]
              ).map((status) => (
                <Button
                  key={status}
                  variant="secondary"
                  disabled={status === table.status || pending}
                  onClick={() => onSetStatus(status)}
                >
                  {TABLE_STATUS_LABELS_FA[status]}
                </Button>
              ))}
            </div>
            {table.activeOrder ? (
              <p className="mt-2 text-xs text-ink-subtle">
                تا زمانی که سفارش باز است، میز پس از تکمیل سفارش به‌صورت خودکار آزاد
                می‌شود.
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="rounded-xl border border-line p-3">
          <p className="mb-1 text-xs text-ink-subtle">لینک منوی این میز</p>
          <p className="ltr-nums break-all text-xs text-ink-muted">{table.qrUrl}</p>
        </div>
      </div>
    </Modal>
  );
}

function AddTablesModal({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [from, setFrom] = useState('1');
  const [to, setTo] = useState('12');
  const [capacity, setCapacity] = useState('4');
  const [zone, setZone] = useState('');

  const create = useMutation({
    mutationFn: () =>
      tableService.bulkCreate({
        from: Number(from),
        to: Number(to),
        capacity: Number(capacity),
        zone: zone.trim() || null,
      }),
    onSuccess: (result) => {
      toast.success(
        `${toPersianDigits(result.created)} میز ساخته شد`,
        result.skipped > 0
          ? `${toPersianDigits(result.skipped)} شماره تکراری نادیده گرفته شد.`
          : undefined,
      );
      onDone();
      onClose();
    },
    onError: (error) =>
      toast.error(
        'ساخت میزها انجام نشد',
        error instanceof ApiError ? error.message : undefined,
      ),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="افزودن میز"
      description="یک بازه شماره بسازید؛ شماره‌های تکراری نادیده گرفته می‌شوند."
      size="sm"
      footer={
        <Button
          variant="primary"
          size="lg"
          fullWidth
          loading={create.isPending}
          onClick={() => create.mutate()}
        >
          ساخت میزها
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-3 pt-1">
        <Input
          label="از شماره"
          dir="ltr"
          inputMode="numeric"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <Input
          label="تا شماره"
          dir="ltr"
          inputMode="numeric"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
        <Input
          label="ظرفیت"
          dir="ltr"
          inputMode="numeric"
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
        />
        <Input
          label="محدوده"
          placeholder="سالن اصلی"
          value={zone}
          onChange={(e) => setZone(e.target.value)}
        />
      </div>
    </Modal>
  );
}
