'use client';

import {
  ORDER_TRANSITION_ACTION_FA,
  OrderStatus,
  PaymentMethod,
  PAYMENT_METHOD_LABELS_FA,
  PaymentStatus,
  RealtimeEvent,
} from '@restaurant-os/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Ban,
  CreditCard,
  Printer,
  Receipt as ReceiptIcon,
  User,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  ErrorState,
  Input,
  Modal,
  OrderStatusBadge,
  OrderTypeBadge,
  PaymentStatusBadge,
  Skeleton,
  useToast,
} from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { Receipt, type ReceiptWidth } from '@/features/admin/receipt';
import { useRealtime } from '@/hooks/use-realtime';
import { ApiError } from '@/lib/api-client';
import {
  formatDateTimeFa,
  formatMoney,
  formatTimeFa,
  toPersianDigits,
} from '@/lib/format';
import { orderService, paymentService, restaurantService } from '@/services';

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const orderId = params.id;
  const { accessToken, can } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [paymentOpen, setPaymentOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [receiptWidth, setReceiptWidth] = useState<ReceiptWidth>('80');

  const orderQuery = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => orderService.get(orderId),
  });

  const restaurantQuery = useQuery({
    queryKey: ['restaurant'],
    queryFn: () => restaurantService.get(),
    staleTime: 5 * 60_000,
  });

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['order', orderId] });
    void queryClient.invalidateQueries({ queryKey: ['orders'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  }, [queryClient, orderId]);

  useRealtime({
    token: accessToken,
    handlers: {
      [RealtimeEvent.ORDER_STATUS_CHANGED]: refresh,
      [RealtimeEvent.PAYMENT_UPDATED]: refresh,
      [RealtimeEvent.ORDER_UPDATED]: refresh,
    },
  });

  const advance = useMutation({
    mutationFn: ({ status, note }: { status: OrderStatus; note?: string }) =>
      orderService.updateStatus(orderId, status, note),
    onSuccess: (updated) => {
      toast.success('وضعیت سفارش به‌روزرسانی شد');
      queryClient.setQueryData(['order', orderId], updated);
      refresh();
    },
    onError: (error) =>
      toast.error(
        'تغییر وضعیت انجام نشد',
        error instanceof ApiError ? error.message : undefined,
      ),
  });

  if (orderQuery.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-5 lg:grid-cols-3">
          <Skeleton className="h-96 rounded-2xl lg:col-span-2" />
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (orderQuery.isError || !orderQuery.data) {
    return <ErrorState title="سفارش یافت نشد" onRetry={() => orderQuery.refetch()} />;
  }

  const order = orderQuery.data;
  const restaurant = restaurantQuery.data;
  const outstanding = order.total - order.paidTotal;

  // The state machine is the server's; the UI simply renders what it permits.
  const forwardTransitions = order.allowedTransitions.filter(
    (status) => status !== OrderStatus.CANCELLED,
  );
  const canCancel = order.allowedTransitions.includes(OrderStatus.CANCELLED);

  return (
    <div className="space-y-5">
      {/* Screen header - hidden when printing. */}
      <div className="no-print flex flex-wrap items-center gap-3">
        <Link
          href="/admin/orders"
          className="flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
        >
          <ArrowRight className="size-4" />
          سفارش‌ها
        </Link>
        <h1 className="text-xl font-bold tabular-nums text-ink">
          #{toPersianDigits(order.orderNumber)}
        </h1>
        <OrderStatusBadge status={order.status} />
        <PaymentStatusBadge status={order.paymentStatus} />
        <OrderTypeBadge type={order.type} />

        <div className="ms-auto flex flex-wrap gap-2">
          <select
            value={receiptWidth}
            onChange={(e) => setReceiptWidth(e.target.value as ReceiptWidth)}
            aria-label="اندازه رسید"
            className="h-9 rounded-lg border border-line bg-surface-sunken px-2 text-sm text-ink"
          >
            <option value="80">۸۰ میلی‌متر</option>
            <option value="58">۵۸ میلی‌متر</option>
            <option value="a4">A4</option>
          </select>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Printer className="size-4" />}
            onClick={() => window.print()}
          >
            چاپ رسید
          </Button>
        </div>
      </div>

      <div className="no-print grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader
              title="اقلام سفارش"
              description={`${toPersianDigits(order.itemCount)} قلم`}
            />
            <ul className="divide-y divide-line">
              {order.items.map((item) => (
                <li key={item.id} className="flex items-start gap-3 px-5 py-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-raised text-sm font-semibold tabular-nums text-ink-muted">
                    {toPersianDigits(item.quantity)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">{item.productNameFa}</p>
                    {item.modifiers.length > 0 ? (
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {item.modifiers.map((m) => m.nameFa).join('، ')}
                      </p>
                    ) : null}
                    {item.notes ? (
                      <p className="mt-1 text-xs text-caution">{item.notes}</p>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-sm font-medium tabular-nums text-ink">
                    {formatMoney(item.lineTotal, order.currency, { withUnit: false })}
                  </span>
                </li>
              ))}
            </ul>

            <div className="space-y-2 border-t border-line px-5 py-4 text-sm">
              <TotalRow
                label="جمع اقلام"
                value={formatMoney(order.subtotal, order.currency)}
              />
              {order.discountTotal > 0 ? (
                <TotalRow
                  label="تخفیف"
                  value={`- ${formatMoney(order.discountTotal, order.currency)}`}
                  tone="positive"
                />
              ) : null}
              {order.serviceChargeTotal > 0 ? (
                <TotalRow
                  label="حق سرویس"
                  value={formatMoney(order.serviceChargeTotal, order.currency)}
                />
              ) : null}
              {order.taxTotal > 0 ? (
                <TotalRow
                  label="مالیات بر ارزش افزوده"
                  value={formatMoney(order.taxTotal, order.currency)}
                />
              ) : null}
              <div className="flex items-center justify-between border-t border-line pt-3">
                <span className="font-semibold text-ink">مبلغ کل</span>
                <span className="text-lg font-bold text-gold">
                  {formatMoney(order.total, order.currency)}
                </span>
              </div>
              {order.paidTotal > 0 ? (
                <TotalRow
                  label="پرداخت‌شده"
                  value={formatMoney(order.paidTotal, order.currency)}
                  tone="positive"
                />
              ) : null}
              {outstanding > 0 ? (
                <TotalRow
                  label="مانده"
                  value={formatMoney(outstanding, order.currency)}
                  tone="caution"
                />
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHeader title="تاریخچه وضعیت" />
            <CardBody className="p-0">
              <ol className="divide-y divide-line">
                {order.statusHistory.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-center gap-3 px-5 py-2.5 text-sm"
                  >
                    <OrderStatusBadge status={entry.toStatus} />
                    <span className="flex-1 text-ink-muted">
                      {entry.changedByName ?? 'سیستم'}
                      {entry.note ? ` — ${entry.note}` : ''}
                    </span>
                    <time className="text-xs text-ink-subtle">
                      {formatTimeFa(entry.createdAt)}
                    </time>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="اقدامات" />
            <CardBody className="space-y-2.5">
              {forwardTransitions.length === 0 && !canCancel ? (
                <p className="text-sm text-ink-muted">
                  این سفارش به وضعیت نهایی رسیده و تغییر دیگری ممکن نیست.
                </p>
              ) : null}

              {forwardTransitions.map((status) => (
                <Button
                  key={status}
                  variant="primary"
                  size="lg"
                  fullWidth
                  loading={advance.isPending && advance.variables?.status === status}
                  onClick={() => advance.mutate({ status })}
                >
                  {ORDER_TRANSITION_ACTION_FA[status]}
                </Button>
              ))}

              {outstanding > 0 && can('payment:create') ? (
                <Button
                  variant="secondary"
                  size="lg"
                  fullWidth
                  leftIcon={<CreditCard className="size-4" />}
                  onClick={() => setPaymentOpen(true)}
                >
                  ثبت پرداخت • {formatMoney(outstanding, order.currency)}
                </Button>
              ) : null}

              {canCancel && can('order:cancel') ? (
                <Button
                  variant="danger"
                  fullWidth
                  leftIcon={<Ban className="size-4" />}
                  onClick={() => setCancelOpen(true)}
                >
                  لغو سفارش
                </Button>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="اطلاعات سفارش" />
            <CardBody className="space-y-2.5 text-sm">
              <InfoRow
                label="میز / مشتری"
                value={
                  order.table
                    ? `میز ${toPersianDigits(order.table.number)}`
                    : (order.customerName ?? 'مهمان')
                }
              />
              {order.customerPhone ? (
                <InfoRow
                  label="موبایل"
                  value={toPersianDigits(order.customerPhone)}
                />
              ) : null}
              <InfoRow label="ثبت" value={formatDateTimeFa(order.createdAt)} />
              {order.estimatedReadyAt ? (
                <InfoRow
                  label="آماده‌سازی تا"
                  value={formatTimeFa(order.estimatedReadyAt)}
                />
              ) : null}
              {order.notes ? (
                <div className="rounded-lg bg-caution/10 p-3 text-xs text-caution">
                  {order.notes}
                </div>
              ) : null}
            </CardBody>
          </Card>

          {order.payments.length > 0 ? (
            <Card>
              <CardHeader title="پرداخت‌ها" />
              <ul className="divide-y divide-line">
                {order.payments.map((payment) => (
                  <li
                    key={payment.id}
                    className="flex items-center justify-between gap-3 px-5 py-3 text-sm"
                  >
                    <div>
                      <p className="text-ink">
                        {PAYMENT_METHOD_LABELS_FA[payment.method]}
                      </p>
                      <p className="text-xs text-ink-subtle">
                        {payment.paidAt
                          ? formatDateTimeFa(payment.paidAt)
                          : 'در انتظار تأیید'}
                      </p>
                    </div>
                    <div className="text-end">
                      <p className="font-medium tabular-nums text-ink">
                        {formatMoney(payment.amount, order.currency, {
                          withUnit: false,
                        })}
                      </p>
                      <Badge
                        tone={
                          payment.status === PaymentStatus.PAID ? 'positive' : 'caution'
                        }
                      >
                        {payment.status === PaymentStatus.PAID ? 'موفق' : 'در انتظار'}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>

      {/* Print-only receipt. */}
      <div className="print-only">
        {restaurant ? (
          <Receipt
            order={order}
            restaurantName={restaurant.name}
            branchName={restaurant.branches[0]?.name}
            branchAddress={restaurant.branches[0]?.address}
            branchPhone={restaurant.branches[0]?.phone}
            width={receiptWidth}
          />
        ) : null}
      </div>

      <PaymentModal
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        orderId={orderId}
        outstanding={outstanding}
        onPaid={() => {
          setPaymentOpen(false);
          refresh();
        }}
      />

      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => {
          advance.mutate({ status: OrderStatus.CANCELLED, note: 'لغو توسط صندوق' });
          setCancelOpen(false);
        }}
        title="لغو سفارش"
        message={`آیا از لغو سفارش #${toPersianDigits(order.orderNumber)} مطمئن هستید؟ این عملیات قابل بازگشت نیست.`}
        confirmLabel="بله، لغو کن"
        loading={advance.isPending}
      />
    </div>
  );
}

function PaymentModal({
  open,
  onClose,
  orderId,
  outstanding,
  onPaid,
}: {
  open: boolean;
  onClose: () => void;
  orderId: string;
  outstanding: number;
  onPaid: () => void;
}) {
  const toast = useToast();
  const [method, setMethod] = useState<PaymentMethod>(PaymentMethod.CASH);
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');

  const pay = useMutation({
    mutationFn: () =>
      paymentService.create(orderId, {
        method,
        amount: amount.trim() ? Number(amount.replace(/\D/g, '')) : undefined,
        reference: reference.trim() || undefined,
      }),
    onSuccess: (result) => {
      // An online gateway hands back a redirect instead of settling inline.
      if (result.redirectUrl) {
        window.location.href = result.redirectUrl;
        return;
      }
      toast.success('پرداخت ثبت شد', formatMoney(result.payment.amount));
      setAmount('');
      setReference('');
      onPaid();
    },
    onError: (error) =>
      toast.error(
        'ثبت پرداخت انجام نشد',
        error instanceof ApiError ? error.message : undefined,
      ),
  });

  const methods: PaymentMethod[] = [
    PaymentMethod.CASH,
    PaymentMethod.CARD,
    PaymentMethod.ONLINE,
    PaymentMethod.OTHER,
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="ثبت پرداخت"
      description={`مانده قابل پرداخت: ${formatMoney(outstanding)}`}
      size="sm"
      footer={
        <Button
          variant="primary"
          size="lg"
          fullWidth
          loading={pay.isPending}
          onClick={() => pay.mutate()}
        >
          ثبت پرداخت
        </Button>
      }
    >
      <div className="space-y-4 pt-1">
        <div>
          <p className="mb-2 text-sm font-medium text-ink-muted">روش پرداخت</p>
          <div className="grid grid-cols-2 gap-2">
            {methods.map((option) => (
              <button
                key={option}
                onClick={() => setMethod(option)}
                className={
                  option === method
                    ? 'rounded-xl border border-gold/50 bg-gold/[0.08] p-3 text-sm font-medium text-ink'
                    : 'rounded-xl border border-line bg-surface-sunken p-3 text-sm text-ink-muted'
                }
              >
                {PAYMENT_METHOD_LABELS_FA[option]}
              </button>
            ))}
          </div>
        </div>

        <Input
          label="مبلغ"
          hint="خالی بگذارید تا کل مانده تسویه شود"
          dir="ltr"
          inputMode="numeric"
          placeholder={String(outstanding)}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          rightAddon="تومان"
        />

        <Input
          label="شماره پیگیری (اختیاری)"
          placeholder="کد رهگیری کارتخوان"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
        />
      </div>
    </Modal>
  );
}

function TotalRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'positive' | 'caution';
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink-muted">{label}</span>
      <span
        className={
          tone === 'positive'
            ? 'text-positive'
            : tone === 'caution'
              ? 'text-caution'
              : 'text-ink'
        }
      >
        {value}
      </span>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-ink-muted">{label}</span>
      <span className="text-ink">{value}</span>
    </div>
  );
}
