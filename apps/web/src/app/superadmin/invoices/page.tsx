'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CreditCard, ExternalLink, Plus, Receipt, X } from 'lucide-react';
import Link from 'next/link';
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
  Skeleton,
  Switch,
  Textarea,
  useToast,
} from '@/components/ui';
import { PlatformShell } from '@/features/platform/platform-shell';
import { ApiError } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { formatMoney, toPersianDigits } from '@/lib/format';
import { platformService, type PlatformInvoiceDto } from '@/services';

const STATUS_TABS = [
  { value: 'PENDING', label: 'در انتظار بررسی' },
  { value: 'APPROVED', label: 'تأییدشده' },
  { value: 'REJECTED', label: 'ردشده' },
  { value: 'CANCELLED', label: 'لغوشده' },
] as const;

const STATUS_TONE: Record<
  PlatformInvoiceDto['status'],
  'info' | 'positive' | 'critical' | 'neutral'
> = {
  PENDING: 'info',
  APPROVED: 'positive',
  REJECTED: 'critical',
  CANCELLED: 'neutral',
};

export default function InvoicesPage() {
  return (
    <PlatformShell>
      <Invoices />
    </PlatformShell>
  );
}

/**
 * The card-to-card review queue.
 *
 * Approving here is what activates a plan, so the row shows everything needed
 * to match a transfer against a bank statement - amount, reference code, payer
 * and the receipt image - without a second screen.
 */
function Invoices() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<string>('PENDING');
  const [rejecting, setRejecting] = useState<PlatformInvoiceDto | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [accountsOpen, setAccountsOpen] = useState(false);

  const query = useQuery({
    queryKey: ['platform-invoices', status],
    queryFn: () => platformService.invoices({ status, pageSize: 50 }),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['platform-invoices'] });
    void queryClient.invalidateQueries({ queryKey: ['platform-dashboard'] });
  };

  const onError = (error: unknown) =>
    toast.error('انجام نشد', error instanceof ApiError ? error.message : undefined);

  const approve = useMutation({
    mutationFn: (id: string) => platformService.approveInvoice(id),
    onSuccess: ({ subscription }) => {
      toast.success(
        `پلن ${subscription.plan.nameFa} فعال شد`,
        subscription.expiresAt
          ? `تا ${new Date(subscription.expiresAt).toLocaleDateString('fa-IR')}`
          : undefined,
      );
      refresh();
    },
    onError,
  });

  const reject = useMutation({
    mutationFn: () =>
      platformService.rejectInvoice(rejecting!.id, rejectReason.trim()),
    onSuccess: () => {
      toast.success('درخواست رد شد');
      setRejecting(null);
      setRejectReason('');
      refresh();
    },
    onError,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="no-scrollbar flex flex-1 gap-1 overflow-x-auto">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatus(tab.value)}
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
        <Button
          variant="ghost"
          leftIcon={<CreditCard className="size-4" />}
          onClick={() => setAccountsOpen(true)}
        >
          حساب‌های بانکی
        </Button>
      </div>

      {query.isPending ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : query.isError ? (
        <ErrorState onRetry={() => query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          icon={<Receipt className="size-6" />}
          title="چیزی اینجا نیست"
          description={
            status === 'PENDING'
              ? 'هیچ درخواست پرداختی در انتظار بررسی نیست.'
              : 'در این وضعیت درخواستی ثبت نشده است.'
          }
        />
      ) : (
        <div className="space-y-3">
          {query.data.items.map((invoice) => (
            <Card key={invoice.id}>
              <CardBody className="space-y-3">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/superadmin/tenants/${invoice.tenant.id}`}
                      className="flex items-center gap-1.5 font-semibold text-ink hover:text-gold"
                    >
                      {invoice.tenant.name}
                      <ExternalLink className="size-3.5" />
                    </Link>
                    <p className="mt-0.5 text-xs text-ink-subtle">
                      {invoice.plan?.nameFa} · {toPersianDigits(invoice.months)} ماه ·{' '}
                      {new Date(invoice.createdAt).toLocaleDateString('fa-IR')}
                    </p>
                  </div>
                  <div className="text-end">
                    <p className="font-bold tabular-nums text-gold">
                      {formatMoney(invoice.amount, 'IRT')}
                    </p>
                    <Badge tone={STATUS_TONE[invoice.status]}>
                      {STATUS_TABS.find((tab) => tab.value === invoice.status)?.label}
                    </Badge>
                  </div>
                </div>

                <dl className="grid gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2">
                  <Row label="واریزکننده" value={invoice.payerName} />
                  <Row label="شماره پیگیری" value={invoice.referenceCode} ltr />
                  <Row
                    label="واریز به"
                    value={
                      invoice.bankAccount
                        ? `${invoice.bankAccount.bankName} — ${invoice.bankAccount.cardNumber}`
                        : null
                    }
                    ltr
                  />
                  <Row label="توضیح" value={invoice.note} />
                  {invoice.reviewNote ? (
                    <Row label="یادداشت بررسی" value={invoice.reviewNote} />
                  ) : null}
                </dl>

                {invoice.receiptUrl ? (
                  <a
                    href={invoice.receiptUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-gold hover:text-gold-bright"
                  >
                    مشاهده تصویر رسید
                    <ExternalLink className="size-3" />
                  </a>
                ) : null}

                {invoice.status === 'PENDING' ? (
                  <div className="flex flex-wrap gap-2 border-t border-line pt-3">
                    <Button
                      variant="primary"
                      size="sm"
                      leftIcon={<Check className="size-4" />}
                      loading={approve.isPending && approve.variables === invoice.id}
                      onClick={() => approve.mutate(invoice.id)}
                    >
                      تأیید و فعال‌سازی
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      leftIcon={<X className="size-4" />}
                      onClick={() => setRejecting(invoice)}
                    >
                      رد
                    </Button>
                  </div>
                ) : null}
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={!!rejecting}
        onClose={() => setRejecting(null)}
        title="رد درخواست پرداخت"
        description={rejecting?.tenant.name}
        footer={
          <div className="flex gap-3">
            <Button variant="ghost" fullWidth onClick={() => setRejecting(null)}>
              انصراف
            </Button>
            <Button
              variant="danger"
              fullWidth
              disabled={rejectReason.trim().length < 3}
              loading={reject.isPending}
              onClick={() => reject.mutate()}
            >
              رد کردن
            </Button>
          </div>
        }
      >
        <Textarea
          label="دلیل رد"
          rows={3}
          hint="این متن برای صاحب کسب‌وکار نمایش داده می‌شود."
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
        />
      </Modal>

      <BankAccountsModal open={accountsOpen} onClose={() => setAccountsOpen(false)} />
    </div>
  );
}

function Row({
  label,
  value,
  ltr,
}: {
  label: string;
  value: string | null | undefined;
  ltr?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-ink-subtle">{label}:</dt>
      <dd dir={ltr ? 'ltr' : undefined} className="min-w-0 break-words text-ink-muted">
        {value}
      </dd>
    </div>
  );
}

/** The cards tenants are told to transfer into. */
function BankAccountsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    bankName: '',
    holderName: '',
    cardNumber: '',
    iban: '',
    note: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const query = useQuery({
    queryKey: ['platform-bank-accounts'],
    queryFn: () => platformService.bankAccounts(),
    enabled: open,
  });

  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: ['platform-bank-accounts'] });

  const create = useMutation({
    mutationFn: () =>
      platformService.createBankAccount({
        bankName: form.bankName.trim(),
        holderName: form.holderName.trim(),
        cardNumber: form.cardNumber.trim(),
        iban: form.iban.trim() || null,
        note: form.note.trim() || null,
      }),
    onSuccess: () => {
      toast.success('حساب اضافه شد');
      setForm({ bankName: '', holderName: '', cardNumber: '', iban: '', note: '' });
      setErrors({});
      setAdding(false);
      refresh();
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

  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      platformService.updateBankAccount(id, { isActive }),
    onSuccess: refresh,
    onError: (error) =>
      toast.error('تغییر نکرد', error instanceof ApiError ? error.message : undefined),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="حساب‌های بانکی"
      description="کارت‌هایی که کسب‌وکارها به آن واریز می‌کنند."
      size="lg"
    >
      <div className="space-y-3 pt-1">
        {(query.data ?? []).map((account) => (
          <div
            key={account.id}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-sunken p-3"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">
                {account.bankName} · {account.holderName}
              </p>
              <p dir="ltr" className="font-mono text-sm tabular-nums text-ink-muted">
                {account.cardNumber}
              </p>
            </div>
            <Switch
              checked={account.isActive}
              onChange={(isActive) => toggle.mutate({ id: account.id, isActive })}
              label="فعال"
            />
          </div>
        ))}

        {adding ? (
          <div className="space-y-3 rounded-xl border border-line p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="نام بانک"
                value={form.bankName}
                onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                error={errors.bankName}
              />
              <Input
                label="صاحب حساب"
                value={form.holderName}
                onChange={(e) => setForm({ ...form, holderName: e.target.value })}
                error={errors.holderName}
              />
            </div>
            <Input
              label="شماره کارت"
              dir="ltr"
              inputMode="numeric"
              hint="۱۶ رقم؛ فاصله و خط تیره اشکالی ندارد."
              value={form.cardNumber}
              onChange={(e) => setForm({ ...form, cardNumber: e.target.value })}
              error={errors.cardNumber}
            />
            <Input
              label="شماره شبا"
              dir="ltr"
              placeholder="IR..."
              value={form.iban}
              onChange={(e) => setForm({ ...form, iban: e.target.value })}
              error={errors.iban}
            />
            <Input
              label="توضیح"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              error={errors.note}
            />
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
        ) : (
          <Button
            variant="ghost"
            leftIcon={<Plus className="size-4" />}
            onClick={() => setAdding(true)}
          >
            افزودن حساب
          </Button>
        )}
      </div>
    </Modal>
  );
}
