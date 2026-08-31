'use client';

import { CustomerSegment, type CustomerDto } from '@restaurant-os/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BadgeCheck,
  MessageSquare,
  Search,
  Send,
  Store,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  Input,
  Modal,
  Select,
  SkeletonList,
  Switch,
  Textarea,
  useToast,
} from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { ApiError } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { formatMoney, toPersianDigits } from '@/lib/format';
import { campaignService, customerService } from '@/services';

const SEGMENT_TONE: Partial<Record<CustomerSegment, 'gold' | 'positive' | 'caution' | 'neutral'>> = {
  [CustomerSegment.VIP]: 'gold',
  [CustomerSegment.HIGH_VALUE]: 'gold',
  [CustomerSegment.NEW]: 'positive',
  [CustomerSegment.RETURNING]: 'positive',
  [CustomerSegment.INACTIVE_30]: 'caution',
  [CustomerSegment.INACTIVE_60]: 'caution',
};

const SEGMENT_LABEL: Record<string, string> = {
  ALL: 'همه',
  NEW: 'جدید',
  RETURNING: 'بازگشتی',
  VIP: 'وفادار',
  HIGH_VALUE: 'پرخرج',
  INACTIVE_30: 'غیرفعال ۳۰ روز',
  INACTIVE_60: 'غیرفعال ۶۰ روز',
  DINE_IN: 'در محل',
  TAKEAWAY: 'بیرون‌بر',
};

/**
 * The restaurant's customer book.
 *
 * Segments are the organising idea: the same definitions that filter this list
 * choose a campaign's recipients, so what an owner sees here is exactly who a
 * message would reach.
 */
export default function CustomersPage() {
  const { can } = useAuth();
  const [segment, setSegment] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<CustomerDto | null>(null);
  const [campaignOpen, setCampaignOpen] = useState(false);

  const segmentsQuery = useQuery({
    queryKey: ['customer-segments'],
    queryFn: () => customerService.segments(),
  });

  const customersQuery = useQuery({
    queryKey: ['customers', segment, search],
    queryFn: () =>
      customerService.list({
        pageSize: 50,
        segment: segment === 'ALL' ? undefined : segment,
        search: search.trim() || undefined,
      }),
  });

  const editable = can('settings:manage');
  const customers = customersQuery.data?.items ?? [];

  // A plan without CRM returns 402 here; say so rather than showing an empty
  // list that looks like the restaurant has no customers.
  const planBlocked =
    customersQuery.error instanceof ApiError &&
    customersQuery.error.code === 'PLAN_FEATURE_UNAVAILABLE';

  if (planBlocked) {
    return (
      <EmptyState
        icon={<Users className="size-6" />}
        title="باشگاه مشتریان در پلن فعلی فعال نیست"
        description={(customersQuery.error as ApiError).message}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          {(segmentsQuery.data ?? []).map((entry) => (
            <button
              key={entry.segment}
              onClick={() => setSegment(entry.segment)}
              title={entry.descriptionFa}
              className={cn(
                'flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-sm transition-colors',
                segment === entry.segment
                  ? 'bg-gold text-ink-inverse'
                  : 'bg-surface-raised text-ink-muted hover:text-ink',
              )}
            >
              {SEGMENT_LABEL[entry.segment] ?? entry.labelFa}
              <span className="tabular-nums opacity-70">
                {toPersianDigits(entry.count)}
              </span>
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <Input
            placeholder="جستجوی شماره یا نام"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftAddon={<Search className="size-4" />}
            containerClassName="flex-1 lg:w-64"
          />
          {editable ? (
            <Button
              variant="primary"
              leftIcon={<Send className="size-4" />}
              onClick={() => setCampaignOpen(true)}
              className="shrink-0"
            >
              کمپین پیامکی
            </Button>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader
          title="مشتریان"
          description={`${toPersianDigits(customers.length)} مشتری`}
        />
        <CardBody className="p-0">
          {customersQuery.isPending ? (
            <div className="p-5">
              <SkeletonList rows={6} />
            </div>
          ) : customersQuery.isError ? (
            <ErrorState onRetry={() => customersQuery.refetch()} />
          ) : customers.length === 0 ? (
            <EmptyState
              icon={<Users className="size-6" />}
              title={search ? 'مشتری‌ای پیدا نشد' : 'هنوز مشتری ثبت نشده'}
              description={
                search
                  ? `نتیجه‌ای برای «${search}» یافت نشد.`
                  : 'با ثبت اولین سفارشی که شماره موبایل دارد، مشتری اینجا ساخته می‌شود.'
              }
            />
          ) : (
            <ul className="divide-y divide-line">
              {customers.map((customer) => (
                <li key={customer.id}>
                  <button
                    onClick={() => setSelected(customer)}
                    className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-start transition-colors hover:bg-surface-raised sm:px-5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-ink">
                          {customer.name || 'بدون نام'}
                        </span>
                        {customer.marketingConsent ? (
                          <BadgeCheck className="size-4 text-positive" />
                        ) : null}
                        {customer.segments.slice(0, 2).map((seg) => (
                          <Badge key={seg} tone={SEGMENT_TONE[seg] ?? 'neutral'}>
                            {SEGMENT_LABEL[seg] ?? seg}
                          </Badge>
                        ))}
                      </div>
                      <p className="mt-0.5 text-xs text-ink-subtle">
                        <span className="ltr-nums">
                          {toPersianDigits(customer.phone)}
                        </span>
                        {customer.lastBranchName ? ` • ${customer.lastBranchName}` : ''}
                      </p>
                    </div>

                    <div className="text-end">
                      <p className="font-semibold tabular-nums text-gold">
                        {formatMoney(customer.totalSpent, 'IRT', { withUnit: false })}
                      </p>
                      <p className="text-xs text-ink-subtle">
                        {toPersianDigits(customer.ordersCount)} سفارش • میانگین{' '}
                        {formatMoney(customer.averageOrderValue, 'IRT', {
                          withUnit: false,
                        })}
                      </p>
                    </div>

                    <div className="hidden w-28 shrink-0 text-end text-xs text-ink-subtle sm:block">
                      <span className="flex items-center justify-end gap-1">
                        <Store className="size-3" />
                        {toPersianDigits(customer.dineInCount)} در محل
                      </span>
                      <span className="flex items-center justify-end gap-1">
                        <MessageSquare className="size-3" />
                        {toPersianDigits(customer.takeawayCount)} بیرون‌بر
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <CustomerSheet
        customer={selected}
        editable={editable}
        onClose={() => setSelected(null)}
      />
      <CampaignModal open={campaignOpen} onClose={() => setCampaignOpen(false)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function CustomerSheet({
  customer,
  editable,
  onClose,
}: {
  customer: CustomerDto | null;
  editable: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [consent, setConsent] = useState(false);

  const detailQuery = useQuery({
    queryKey: ['customer', customer?.id],
    queryFn: () => customerService.get(customer!.id),
    enabled: customer !== null,
  });

  // Seed the form from whichever copy arrived first.
  const source = detailQuery.data ?? customer;
  const [seededFor, setSeededFor] = useState<string | null>(null);
  if (source && seededFor !== source.id) {
    setSeededFor(source.id);
    setName(source.name ?? '');
    setNotes(source.notes ?? '');
    setConsent(source.marketingConsent);
  }

  const save = useMutation({
    mutationFn: () =>
      customerService.update(customer!.id, {
        name: name.trim() || null,
        notes: notes.trim() || null,
        marketingConsent: consent,
      }),
    onSuccess: () => {
      toast.success('مشتری به‌روزرسانی شد');
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
      void queryClient.invalidateQueries({ queryKey: ['customer-segments'] });
      onClose();
    },
    onError: (error) =>
      toast.error(
        'ذخیره انجام نشد',
        error instanceof ApiError ? error.message : undefined,
      ),
  });

  return (
    <Modal
      open={customer !== null}
      onClose={onClose}
      title={customer?.name || 'مشتری'}
      description={customer ? toPersianDigits(customer.phone) : undefined}
      size="md"
      footer={
        editable ? (
          <div className="flex gap-3">
            <Button variant="ghost" onClick={onClose} fullWidth>
              بستن
            </Button>
            <Button
              variant="primary"
              fullWidth
              loading={save.isPending}
              onClick={() => save.mutate()}
            >
              ذخیره
            </Button>
          </div>
        ) : null
      }
    >
      <div className="space-y-4 pt-1">
        {source ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="سفارش" value={toPersianDigits(source.ordersCount)} />
            <Stat
              label="مجموع خرید"
              value={formatMoney(source.totalSpent, 'IRT', { withUnit: false })}
            />
            <Stat
              label="میانگین"
              value={formatMoney(source.averageOrderValue, 'IRT', { withUnit: false })}
            />
            <Stat
              label="اولین سفارش"
              value={
                source.firstOrderAt
                  ? new Date(source.firstOrderAt).toLocaleDateString('fa-IR')
                  : '—'
              }
            />
          </div>
        ) : null}

        <Input
          label="نام"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!editable}
        />
        <Textarea
          label="یادداشت"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={!editable}
        />
        <Switch
          checked={consent}
          onChange={setConsent}
          disabled={!editable}
          label="رضایت دریافت پیامک تبلیغاتی"
          description="کمپین‌ها فقط به مشتریانی ارسال می‌شوند که این گزینه برایشان فعال است."
        />

        {detailQuery.data?.recentOrders.length ? (
          <div>
            <p className="mb-2 text-sm font-medium text-ink-muted">سفارش‌های اخیر</p>
            <ul className="divide-y divide-line rounded-xl border border-line">
              {detailQuery.data.recentOrders.map((order) => (
                <li
                  key={order.id}
                  className="flex items-center justify-between px-3 py-2 text-xs"
                >
                  <span className="text-ink">#{toPersianDigits(order.orderNumber)}</span>
                  <span className="text-ink-subtle">
                    {new Date(order.createdAt).toLocaleDateString('fa-IR')}
                  </span>
                  <span className="font-medium tabular-nums text-gold">
                    {formatMoney(order.total, 'IRT', { withUnit: false })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-sunken p-3">
      <p className="text-xs text-ink-subtle">{label}</p>
      <p className="mt-0.5 font-semibold tabular-nums text-ink">{value}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function CampaignModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [segment, setSegment] = useState('ALL');
  const [body, setBody] = useState('');

  // Recipient count comes from the server so the number shown is the number
  // that would actually receive it - consent filtering included.
  const previewQuery = useQuery({
    queryKey: ['campaign-preview', segment],
    queryFn: () => campaignService.preview(segment),
    enabled: open,
  });

  const send = useMutation({
    mutationFn: async () => {
      const campaign = await campaignService.create({ name, segment, body });
      return campaignService.send(campaign.id);
    },
    onSuccess: (campaign) => {
      toast.success(
        'کمپین ارسال شد',
        `${toPersianDigits(campaign.sentCount)} پیامک در صف ارسال قرار گرفت.`,
      );
      void queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      setName('');
      setBody('');
      onClose();
    },
    onError: (error) =>
      toast.error(
        'ارسال انجام نشد',
        error instanceof ApiError ? error.message : undefined,
      ),
  });

  const recipients = previewQuery.data?.recipients ?? 0;
  const remaining = previewQuery.data?.remaining ?? null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="کمپین پیامکی"
      description="فقط به مشتریانی ارسال می‌شود که رضایت دریافت پیامک تبلیغاتی داده‌اند."
      size="md"
      footer={
        <div className="flex gap-3">
          <Button variant="ghost" onClick={onClose} fullWidth>
            انصراف
          </Button>
          <Button
            variant="primary"
            fullWidth
            disabled={recipients === 0 || body.trim().length < 10}
            loading={send.isPending}
            onClick={() => send.mutate()}
          >
            ارسال به {toPersianDigits(recipients)} مشتری
          </Button>
        </div>
      }
    >
      <div className="space-y-4 pt-1">
        <Input
          label="نام کمپین"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="بازگشت مشتریان غیرفعال"
          required
        />
        <Select
          label="گروه هدف"
          value={segment}
          onChange={(e) => setSegment(e.target.value)}
          options={Object.entries(SEGMENT_LABEL).map(([value, label]) => ({
            value,
            label,
          }))}
        />
        <Textarea
          label="متن پیام"
          rows={4}
          maxLength={480}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          hint="با {name} نام مشتری در پیام قرار می‌گیرد."
        />

        <div className="rounded-xl border border-line bg-surface-sunken p-3 text-xs text-ink-muted">
          <p>
            گیرندگان: <span className="tabular-nums">{toPersianDigits(recipients)}</span>
          </p>
          {remaining !== null ? (
            <p className="mt-1">
              باقی‌مانده سهمیه این ماه:{' '}
              <span className="tabular-nums">{toPersianDigits(remaining)}</span>
            </p>
          ) : null}
          {recipients === 0 ? (
            <p className="mt-1 text-caution">
              هیچ مشتری‌ای در این گروه رضایت دریافت پیامک نداده است.
            </p>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
