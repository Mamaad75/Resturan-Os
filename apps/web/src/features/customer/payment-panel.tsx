'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Banknote, CheckCircle2, CreditCard, Globe } from 'lucide-react';
import { Button, Card, useToast } from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { formatMoney } from '@/lib/format';
import { publicService } from '@/services';

/**
 * The customer's pay step, shown once the order exists. Online payment sends
 * the customer to the gateway; cash and the in-person card reader are shown as
 * instructions because the money changes hands at the counter. Only methods
 * the restaurant enabled appear here.
 */
export function PaymentPanel({
  token,
  paymentStatus,
}: {
  token: string;
  paymentStatus: string;
}) {
  const toast = useToast();
  const alreadyPaid = paymentStatus === 'PAID';

  const query = useQuery({
    queryKey: ['pay-options', token],
    queryFn: () => publicService.payOptions(token),
    enabled: !alreadyPaid,
  });

  const startOnline = useMutation({
    mutationFn: () => publicService.startOnlinePayment(token),
    onSuccess: ({ redirectUrl }) => {
      if (redirectUrl) window.location.href = redirectUrl;
      else toast.error('شروع پرداخت ممکن نشد', 'درگاه پاسخ نداد.');
    },
    onError: (error) =>
      toast.error(
        'شروع پرداخت ممکن نشد',
        error instanceof ApiError ? error.message : undefined,
      ),
  });

  if (alreadyPaid) {
    return (
      <Card className="mt-4 flex items-center gap-3 border-positive/30 bg-positive/[0.06] p-4">
        <CheckCircle2 className="size-6 shrink-0 text-positive" />
        <div>
          <p className="text-sm font-semibold text-positive">این سفارش پرداخت شده است</p>
          <p className="mt-0.5 text-xs text-ink-muted">از خرید شما سپاسگزاریم.</p>
        </div>
      </Card>
    );
  }

  const opts = query.data;
  if (!opts || opts.outstanding <= 0) return null;

  const anyMethod = opts.methods.online || opts.methods.cash || opts.methods.cardOnSite;
  if (!anyMethod) return null;

  return (
    <Card className="mt-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-ink">پرداخت سفارش</p>
        <p className="tabular-nums text-brand">
          <span className="text-xs text-ink-subtle">قابل پرداخت: </span>
          {formatMoney(opts.outstanding, 'IRT')}
        </p>
      </div>

      <div className="mt-3 space-y-2">
        {opts.methods.online ? (
          <Button
            variant="primary"
            fullWidth
            leftIcon={<Globe className="size-4" />}
            loading={startOnline.isPending}
            onClick={() => startOnline.mutate()}
          >
            پرداخت آنلاین
          </Button>
        ) : null}

        {opts.methods.cash ? (
          <InPersonHint
            icon={<Banknote className="size-4" />}
            text="پرداخت نقدی هنگام تحویل، نزد صندوق."
          />
        ) : null}
        {opts.methods.cardOnSite ? (
          <InPersonHint
            icon={<CreditCard className="size-4" />}
            text="پرداخت با کارت‌خوانِ حضوری نزد صندوق."
          />
        ) : null}
      </div>
    </Card>
  );
}

function InPersonHint({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-sunken px-3 py-2.5 text-xs text-ink-muted">
      <span className="text-ink-subtle">{icon}</span>
      {text}
    </div>
  );
}
