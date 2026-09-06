'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Input,
  Switch,
  useToast,
} from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { formatMoney, toPersianDigits } from '@/lib/format';
import { deliveryService, type DeliveryZoneDto } from '@/services';

const EMPTY = { title: '', fee: '', minOrderTotal: '', estimatedMinutes: '45' };

/**
 * Delivery areas and what each costs.
 *
 * Areas, not radii: a customer picks the neighbourhood they are in, which is
 * how an Iranian address is described anyway, and the restaurant prices the
 * ones it is willing to reach.
 */
export function DeliveryZones({
  branchId,
  editable,
}: {
  branchId: string | null;
  editable: boolean;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);

  const query = useQuery({
    queryKey: ['delivery-zones', branchId],
    queryFn: () => deliveryService.zones({ branchId: branchId ?? undefined }),
    enabled: !!branchId,
  });

  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: ['delivery-zones'] });

  const onError = (error: unknown) => {
    if (error instanceof ApiError) {
      toast.error('انجام نشد', error.message);
      if (error.details) {
        setErrors(
          Object.fromEntries(
            Object.entries(error.details).map(([key, list]) => [key, list[0]]),
          ),
        );
      }
    }
  };

  const digits = (value: string) => Number(value.replace(/\D/g, '')) || 0;

  const create = useMutation({
    mutationFn: () =>
      deliveryService.createZone(branchId!, {
        title: form.title.trim(),
        fee: digits(form.fee),
        minOrderTotal: digits(form.minOrderTotal),
        estimatedMinutes: digits(form.estimatedMinutes) || 45,
      }),
    onSuccess: () => {
      toast.success('منطقه اضافه شد');
      setForm(EMPTY);
      setErrors({});
      setAdding(false);
      refresh();
    },
    onError,
  });

  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      deliveryService.updateZone(id, { isActive }),
    onSuccess: refresh,
    onError,
  });

  const remove = useMutation({
    mutationFn: (id: string) => deliveryService.deleteZone(id),
    onSuccess: (result) => {
      toast.success(
        result.deleted ? 'منطقه حذف شد' : 'منطقه غیرفعال شد',
        result.deleted
          ? undefined
          : 'چون سفارش‌هایی به این منطقه ثبت شده، به‌جای حذف غیرفعال شد.',
      );
      refresh();
    },
    onError,
  });

  return (
    <Card>
      <CardHeader
        title="مناطق ارسال"
        description="هزینه پیک و حداقل سفارش برای هر منطقه."
        action={
          editable && branchId ? (
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<Plus className="size-4" />}
              onClick={() => setAdding(true)}
            >
              منطقه جدید
            </Button>
          ) : null
        }
      />
      <CardBody className="space-y-3">
        {!branchId ? (
          <p className="text-xs text-ink-subtle">ابتدا یک شعبه بسازید.</p>
        ) : null}

        {query.data?.length === 0 && !adding ? (
          <p className="rounded-xl border border-caution/30 bg-caution/10 p-3 text-xs leading-relaxed text-caution">
            هنوز منطقه‌ای تعریف نشده است. تا وقتی حداقل یک منطقه فعال نباشد، مشتری
            نمی‌تواند سفارش ارسال با پیک ثبت کند.
          </p>
        ) : null}

        {(query.data ?? []).map((zone) => (
          <ZoneRow
            key={zone.id}
            zone={zone}
            editable={editable}
            onToggle={(isActive) => toggle.mutate({ id: zone.id, isActive })}
            onRemove={() => remove.mutate(zone.id)}
          />
        ))}

        {adding ? (
          <div className="space-y-3 rounded-xl border border-line p-3">
            <Input
              label="نام منطقه"
              placeholder="سعادت‌آباد"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              error={errors.title}
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <Input
                label="هزینه پیک"
                dir="ltr"
                inputMode="numeric"
                rightAddon="تومان"
                value={form.fee}
                onChange={(e) => setForm({ ...form, fee: e.target.value })}
                error={errors.fee}
              />
              <Input
                label="حداقل سفارش"
                dir="ltr"
                inputMode="numeric"
                rightAddon="تومان"
                hint="خالی یعنی بدون حداقل"
                value={form.minOrderTotal}
                onChange={(e) => setForm({ ...form, minOrderTotal: e.target.value })}
                error={errors.minOrderTotal}
              />
              <Input
                label="زمان تقریبی"
                dir="ltr"
                inputMode="numeric"
                rightAddon="دقیقه"
                value={form.estimatedMinutes}
                onChange={(e) => setForm({ ...form, estimatedMinutes: e.target.value })}
                error={errors.estimatedMinutes}
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="primary"
                size="sm"
                loading={create.isPending}
                onClick={() => create.mutate()}
              >
                افزودن
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>
                انصراف
              </Button>
            </div>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

function ZoneRow({
  zone,
  editable,
  onToggle,
  onRemove,
}: {
  zone: DeliveryZoneDto;
  editable: boolean;
  onToggle: (isActive: boolean) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-sunken p-3">
      <MapPin className="size-4 shrink-0 text-ink-subtle" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">{zone.title}</p>
        <p className="text-xs text-ink-subtle">
          پیک {formatMoney(zone.fee, 'IRT')}
          {zone.minOrderTotal > 0
            ? ` · حداقل ${formatMoney(zone.minOrderTotal, 'IRT')}`
            : ''}
          {' · '}
          حدود {toPersianDigits(zone.estimatedMinutes)} دقیقه
        </p>
      </div>
      {editable ? (
        <>
          <Switch checked={zone.isActive} onChange={onToggle} label="فعال" />
          <Button
            variant="ghost"
            size="icon"
            aria-label={`حذف ${zone.title}`}
            onClick={onRemove}
          >
            <Trash2 className="size-4" />
          </Button>
        </>
      ) : null}
    </div>
  );
}
