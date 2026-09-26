'use client';

import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Button, Spinner } from '@/components/ui';
import { publicService } from '@/services';

export default function PaymentCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center">
          <Spinner className="size-8" />
        </div>
      }
    >
      <CallbackInner />
    </Suspense>
  );
}

/**
 * Where the gateway (or the sandbox) sends the customer back. The reference in
 * the URL is all we need: verifying it captures the money and flips the order
 * to paid, then we point the customer back at their tracking page.
 */
function CallbackInner() {
  const params = useSearchParams();
  const providerRef =
    params.get('ref') ?? params.get('Authority') ?? params.get('authority');
  const status = (params.get('Status') ?? params.get('status') ?? '').toUpperCase();
  const canceled = status === 'NOK';

  const verify = useQuery({
    queryKey: ['payment-verify', providerRef],
    queryFn: () => publicService.verifyPayment(providerRef as string),
    enabled: !!providerRef && !canceled,
    retry: false,
  });

  const trackHref = verify.data?.trackingToken
    ? `/order/track/${verify.data.trackingToken}`
    : null;

  let body: React.ReactNode;
  if (!providerRef || canceled) {
    body = (
      <Result
        ok={false}
        title="پرداخت انجام نشد"
        detail={canceled ? 'پرداخت توسط شما لغو شد.' : 'اطلاعات بازگشت از درگاه ناقص است.'}
      />
    );
  } else if (verify.isPending) {
    body = (
      <div className="flex flex-col items-center gap-3 text-center">
        <Spinner className="size-8" />
        <p className="text-sm text-ink-muted">در حال بررسی پرداخت…</p>
      </div>
    );
  } else if (verify.data?.verified) {
    body = (
      <Result
        ok
        title="پرداخت با موفقیت انجام شد"
        detail="سفارش شما پرداخت‌شده ثبت شد."
        trackHref={trackHref}
      />
    );
  } else {
    body = (
      <Result
        ok={false}
        title="پرداخت تأیید نشد"
        detail="اگر مبلغی از حساب شما کسر شده، طی ۷۲ ساعت بازمی‌گردد."
        trackHref={trackHref}
      />
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md items-center justify-center px-4">
      <div className="w-full rounded-2xl border border-line bg-surface p-6">{body}</div>
    </main>
  );
}

function Result({
  ok,
  title,
  detail,
  trackHref,
}: {
  ok: boolean;
  title: string;
  detail: string;
  trackHref?: string | null;
}) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      {ok ? (
        <CheckCircle2 className="size-12 text-positive" />
      ) : (
        <XCircle className="size-12 text-critical" />
      )}
      <p className="text-lg font-bold text-ink">{title}</p>
      <p className="text-sm text-ink-muted">{detail}</p>
      {trackHref ? (
        <Link href={trackHref} className="mt-2 w-full">
          <Button variant="primary" fullWidth>
            بازگشت به پیگیری سفارش
          </Button>
        </Link>
      ) : null}
    </div>
  );
}
