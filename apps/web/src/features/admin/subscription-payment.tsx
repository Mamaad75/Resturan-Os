'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BadgeCheck,
  Clock,
  Copy,
  CreditCard,
  Receipt,
  XCircle,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ImageUpload,
  Input,
  Modal,
  Select,
  Textarea,
  useToast,
} from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { formatMoney, toPersianDigits } from '@/lib/format';
import {
  billingService,
  subscriptionService,
  type BankAccountDto,
  type InvoiceDto,
} from '@/services';

const MONTH_CHOICES = ['1', '3', '6', '12'] as const;

const INVOICE_STATUS: Record<
  InvoiceDto['status'],
  { label: string; tone: 'info' | 'positive' | 'critical' | 'neutral' }
> = {
  PENDING: { label: 'در انتظار بررسی', tone: 'info' },
  APPROVED: { label: 'تأیید شد', tone: 'positive' },
  REJECTED: { label: 'رد شد', tone: 'critical' },
  CANCELLED: { label: 'لغو شد', tone: 'neutral' },
};

/** "6104337812345678" -> "6104-3378-1234-5678", which is how a card is read aloud. */
function groupCard(card: string): string {
  return card.replace(/(\d{4})(?=\d)/g, '$1-');
}

/**
 * Paying for a plan by bank transfer.
 *
 * Card-to-card is settled by a person reading a receipt, so this screen's job
 * is to make that person's job easy: it shows the card to pay into, records
 * what the tenant says they sent, and then gets out of the way until the
 * platform decides. Nothing here activates a plan - only an approval does.
 */
export function SubscriptionPayment({ editable }: { editable: boolean }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const plansQuery = useQuery({
    queryKey: ['subscription-plans'],
    queryFn: () => subscriptionService.plans(),
  });
  const accountsQuery = useQuery({
    queryKey: ['billing-accounts'],
    queryFn: () => billingService.bankAccounts(),
  });
  const invoicesQuery = useQuery({
    queryKey: ['billing-invoices'],
    queryFn: () => billingService.invoices(),
  });

  const pending = invoicesQuery.data?.find((invoice) => invoice.status === 'PENDING');

  const cancel = useMutation({
    mutationFn: (id: string) => billingService.cancel(id),
    onSuccess: () => {
      toast.success('درخواست لغو شد');
      void queryClient.invalidateQueries({ queryKey: ['billing-invoices'] });
    },
    onError: (error) =>
      toast.error('لغو نشد', error instanceof ApiError ? error.message : undefined),
  });

  return (
    <Card>
      <CardHeader
        title="پرداخت اشتراک"
        description="کارت به کارت کنید و رسید را ثبت کنید؛ پس از تأیید، پلن فعال می‌شود."
        action={
          editable ? (
            <Button
              variant="primary"
              size="sm"
              leftIcon={<CreditCard className="size-4" />}
              disabled={!!pending}
              onClick={() => setOpen(true)}
            >
              پرداخت
            </Button>
          ) : null
        }
      />
      <CardBody className="space-y-4">
        {accountsQuery.data?.length === 0 ? (
          <p className="rounded-xl border border-caution/30 bg-caution/10 p-3 text-xs leading-relaxed text-caution">
            هنوز حساب بانکی برای پرداخت ثبت نشده است. با پشتیبانی تماس بگیرید.
          </p>
        ) : null}

        {pending ? (
          <div className="rounded-xl border border-info/30 bg-info/10 p-3">
            <p className="flex items-center gap-2 text-sm font-medium text-info">
              <Clock className="size-4" />
              درخواست شما در انتظار بررسی است
            </p>
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">
              {pending.plan?.nameFa} · {toPersianDigits(pending.months)} ماه ·{' '}
              {formatMoney(pending.amount, 'IRT')}
            </p>
            {editable ? (
              <Button
                variant="ghost"
                size="sm"
                className="mt-2"
                loading={cancel.isPending}
                onClick={() => cancel.mutate(pending.id)}
              >
                لغو درخواست
              </Button>
            ) : null}
          </div>
        ) : null}

        {/* Cards to transfer into. */}
        <div className="space-y-2">
          {(accountsQuery.data ?? []).map((account) => (
            <BankCard key={account.id} account={account} />
          ))}
        </div>

        {/* History, so a rejected receipt says why. */}
        {invoicesQuery.data && invoicesQuery.data.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-line">
            {invoicesQuery.data.map((invoice) => {
              const status = INVOICE_STATUS[invoice.status];
              return (
                <div
                  key={invoice.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-3 py-2.5 last:border-b-0"
                >
                  <Receipt className="size-3.5 shrink-0 text-ink-subtle" />
                  <span className="text-xs text-ink">
                    {invoice.plan?.nameFa} · {toPersianDigits(invoice.months)} ماه
                  </span>
                  <span className="text-xs tabular-nums text-ink-muted">
                    {formatMoney(invoice.amount, 'IRT')}
                  </span>
                  <Badge tone={status.tone} className="ms-auto">
                    {status.label}
                  </Badge>
                  {invoice.reviewNote ? (
                    <p className="w-full text-xs leading-relaxed text-ink-subtle">
                      {invoice.status === 'REJECTED' ? 'دلیل رد: ' : 'یادداشت: '}
                      {invoice.reviewNote}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </CardBody>

      <PaymentModal
        open={open}
        onClose={() => setOpen(false)}
        plans={plansQuery.data ?? []}
        accounts={accountsQuery.data ?? []}
        onSubmitted={() => {
          setOpen(false);
          void queryClient.invalidateQueries({ queryKey: ['billing-invoices'] });
        }}
      />
    </Card>
  );
}

function BankCard({ account }: { account: BankAccountDto }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(account.cardNumber);
      setCopied(true);
    } catch {
      // Clipboard needs a secure context and permission; the number is on
      // screen either way, so this is a convenience, not the feature.
      toast.error('کپی نشد', 'شماره کارت را دستی بردارید.');
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-sunken p-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">
          {account.bankName} · {account.holderName}
        </p>
        <p dir="ltr" className="mt-0.5 font-mono text-sm tabular-nums text-gold">
          {groupCard(account.cardNumber)}
        </p>
        {account.iban ? (
          <p dir="ltr" className="mt-0.5 font-mono text-xs text-ink-subtle">
            {account.iban}
          </p>
        ) : null}
        {account.note ? (
          <p className="mt-1 text-xs leading-relaxed text-ink-subtle">{account.note}</p>
        ) : null}
      </div>
      <Button
        variant="ghost"
        size="sm"
        leftIcon={<Copy className="size-3.5" />}
        onClick={copy}
      >
        {copied ? 'کپی شد' : 'کپی'}
      </Button>
    </div>
  );
}

function PaymentModal({
  open,
  onClose,
  plans,
  accounts,
  onSubmitted,
}: {
  open: boolean;
  onClose: () => void;
  plans: Array<{ id: string; nameFa: string; monthlyPrice: number }>;
  accounts: BankAccountDto[];
  onSubmitted: () => void;
}) {
  const toast = useToast();
  const [planId, setPlanId] = useState('');
  const [months, setMonths] = useState<string>('1');
  const [bankAccountId, setBankAccountId] = useState('');
  const [payerName, setPayerName] = useState('');
  const [referenceCode, setReferenceCode] = useState('');
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setPlanId((current) => current || plans[0]?.id || '');
    setBankAccountId((current) => current || accounts[0]?.id || '');
  }, [open, plans, accounts]);

  const plan = plans.find((candidate) => candidate.id === planId);
  // Shown, never sent: the server prices the invoice from the plan itself.
  const total = plan ? plan.monthlyPrice * (Number(months) || 1) : 0;

  const submit = useMutation({
    mutationFn: () =>
      billingService.submit({
        planId,
        months: Number(months) || 1,
        bankAccountId: bankAccountId || undefined,
        payerName: payerName.trim() || null,
        referenceCode: referenceCode.trim() || null,
        receiptUrl,
        note: note.trim() || null,
      }),
    onSuccess: () => {
      toast.success('درخواست ثبت شد', 'پس از بررسی، پلن شما فعال می‌شود.');
      onSubmitted();
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        toast.error('ثبت نشد', error.message);
        if (error.details) {
          setErrors(
            Object.fromEntries(
              Object.entries(error.details).map(([key, list]) => [key, list[0]]),
            ),
          );
        }
      }
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="پرداخت کارت به کارت"
      description="ابتدا مبلغ را واریز کنید، سپس مشخصات واریز را اینجا ثبت کنید."
      size="lg"
      footer={
        <div className="flex gap-3">
          <Button variant="ghost" onClick={onClose} fullWidth>
            انصراف
          </Button>
          <Button
            variant="primary"
            fullWidth
            disabled={!planId}
            loading={submit.isPending}
            onClick={() => submit.mutate()}
          >
            ثبت رسید
          </Button>
        </div>
      }
    >
      <div className="space-y-4 pt-1">
        <Select
          label="پلن"
          value={planId}
          onChange={(e) => setPlanId(e.target.value)}
          options={plans.map((candidate) => ({
            value: candidate.id,
            label: `${candidate.nameFa} — ماهانه ${formatMoney(candidate.monthlyPrice, 'IRT', { withUnit: false })}`,
          }))}
          error={errors.planId}
        />

        <div>
          <p className="mb-2 text-sm font-medium text-ink-muted">مدت</p>
          <div className="flex flex-wrap gap-2">
            {MONTH_CHOICES.map((choice) => (
              <button
                key={choice}
                type="button"
                onClick={() => setMonths(choice)}
                className={cn(
                  'rounded-xl border px-4 py-2 text-sm transition-colors',
                  months === choice
                    ? 'border-gold/50 bg-gold/10 text-gold'
                    : 'border-line bg-surface-sunken text-ink-muted hover:text-ink',
                )}
              >
                {toPersianDigits(choice)} ماه
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-gold/30 bg-gold/[0.06] p-3">
          <p className="flex items-center justify-between text-sm">
            <span className="text-ink-muted">مبلغ قابل واریز</span>
            <span className="font-bold text-gold">{formatMoney(total, 'IRT')}</span>
          </p>
        </div>

        {accounts.length > 1 ? (
          <Select
            label="واریز به"
            value={bankAccountId}
            onChange={(e) => setBankAccountId(e.target.value)}
            options={accounts.map((account) => ({
              value: account.id,
              label: `${account.bankName} — ${groupCard(account.cardNumber)}`,
            }))}
          />
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="نام واریزکننده"
            value={payerName}
            onChange={(e) => setPayerName(e.target.value)}
            error={errors.payerName}
          />
          <Input
            label="شماره پیگیری"
            dir="ltr"
            inputMode="numeric"
            hint="کد رهگیری تراکنش در رسید بانکی"
            value={referenceCode}
            onChange={(e) => setReferenceCode(e.target.value)}
            error={errors.referenceCode}
          />
        </div>

        <ImageUpload
          value={receiptUrl}
          onChange={setReceiptUrl}
          folder="receipts"
          label="تصویر رسید"
          hint="اسکرین‌شات یا عکس رسید، بررسی را سریع‌تر می‌کند."
        />

        <Textarea
          label="توضیح"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          error={errors.note}
        />
      </div>
    </Modal>
  );
}

/** Small status pill used by the subscription card's header. */
export function InvoiceStatusIcon({ status }: { status: InvoiceDto['status'] }) {
  if (status === 'APPROVED') return <BadgeCheck className="size-4 text-positive" />;
  if (status === 'REJECTED') return <XCircle className="size-4 text-critical" />;
  return <Clock className="size-4 text-info" />;
}
