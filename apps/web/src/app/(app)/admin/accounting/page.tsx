'use client';

import { Permission } from '@restaurant-os/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Receipt,
  ShoppingCart,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useEffect, useState } from 'react';
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
  Skeleton,
  Textarea,
  useToast,
} from '@/components/ui';
import { AppShell } from '@/features/admin/app-shell';
import { PurchaseForm } from '@/features/admin/purchase-form';
import { useAuth } from '@/features/auth/auth-context';
import { ApiError } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { formatMoney, formatMoneyCompact, toPersianDigits } from '@/lib/format';
import { accountingService, type ExpenseDto } from '@/services';

const RANGES = [
  ['today', 'امروز'],
  ['week', '۷ روز'],
  ['month', '۳۰ روز'],
] as const;

const METHODS = [
  ['CASH', 'نقدی'],
  ['CARD', 'کارتخوان'],
  ['TRANSFER', 'کارت به کارت / انتقال'],
  ['CHEQUE', 'چک'],
  ['OTHER', 'سایر'],
] as const;

const RECURRENCES = [
  ['ONCE', 'یک‌بار'],
  ['WEEKLY', 'هفتگی'],
  ['MONTHLY', 'ماهانه'],
  ['QUARTERLY', 'سه‌ماهه'],
  ['YEARLY', 'سالانه'],
] as const;

export default function AccountingPage() {
  return (
    <AppShell>
      <Accounting />
    </AppShell>
  );
}

/**
 * The money screen.
 *
 * Built around the question an owner actually asks - "did I make anything this
 * month?" - so the profit line comes first and the detail sits under it.
 */
function Accounting() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [preset, setPreset] = useState<string>('month');
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [purchaseOpen, setPurchaseOpen] = useState(false);

  const editable = can(Permission.ACCOUNTING_MANAGE);

  const summary = useQuery({
    queryKey: ['accounting-summary', preset],
    queryFn: () => accountingService.summary({ preset }),
  });
  const expenses = useQuery({
    queryKey: ['accounting-expenses', preset],
    queryFn: () => accountingService.expenses({ preset, pageSize: 50 }),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['accounting-summary'] });
    void queryClient.invalidateQueries({ queryKey: ['accounting-expenses'] });
  };

  const remove = useMutation({
    mutationFn: (id: string) => accountingService.deleteExpense(id),
    onSuccess: () => {
      toast.success('هزینه حذف شد');
      refresh();
    },
    onError: (error) =>
      toast.error('حذف نشد', error instanceof ApiError ? error.message : undefined),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="no-scrollbar flex flex-1 gap-1 overflow-x-auto">
          {RANGES.map(([value, label]) => (
            <button
              key={value}
              onClick={() => setPreset(value)}
              className={cn(
                'shrink-0 rounded-lg px-3 py-2 text-sm transition-colors',
                preset === value
                  ? 'bg-gold/10 text-gold'
                  : 'text-ink-muted hover:bg-surface-raised hover:text-ink',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {editable ? (
          <>
            <Button
              variant="secondary"
              leftIcon={<ShoppingCart className="size-4" />}
              onClick={() => setPurchaseOpen(true)}
            >
              ثبت خرید
            </Button>
            <Button
              variant="primary"
              leftIcon={<Plus className="size-4" />}
              onClick={() => setExpenseOpen(true)}
            >
              هزینه جدید
            </Button>
          </>
        ) : null}
      </div>

      {summary.isPending ? (
        <Skeleton className="h-40 rounded-2xl" />
      ) : summary.isError ? (
        <ErrorState onRetry={() => summary.refetch()} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Tile
              label="فروش"
              value={summary.data.revenue.total}
              hint={`${toPersianDigits(summary.data.revenue.orderCount)} سفارش پرداخت‌شده`}
              icon={<TrendingUp className="size-4" />}
              tone="positive"
            />
            <Tile
              label="خرید"
              value={summary.data.purchases.total}
              hint="کالایی که وارد انبار شد"
              icon={<ShoppingCart className="size-4" />}
              tone="neutral"
            />
            <Tile
              label="هزینه"
              value={summary.data.expenses.total}
              hint="اجاره، قبض، حقوق و…"
              icon={<Wallet className="size-4" />}
              tone="neutral"
            />
            <Tile
              label="سود"
              value={summary.data.profit}
              hint={`حاشیه ${toPersianDigits((summary.data.marginBps / 100).toFixed(1))}٪`}
              icon={
                summary.data.profit >= 0 ? (
                  <TrendingUp className="size-4" />
                ) : (
                  <TrendingDown className="size-4" />
                )
              }
              tone={summary.data.profit >= 0 ? 'positive' : 'critical'}
            />
          </div>

          {summary.data.expenses.byCategory.length > 0 ? (
            <Card>
              <CardHeader title="هزینه‌ها به تفکیک دسته" />
              <CardBody className="space-y-2">
                {summary.data.expenses.byCategory.map((row) => {
                  const share =
                    summary.data.expenses.total > 0
                      ? row.total / summary.data.expenses.total
                      : 0;
                  return (
                    <div key={row.categoryId} className="flex items-center gap-3">
                      <span className="w-32 shrink-0 truncate text-xs text-ink-muted">
                        {row.name}
                      </span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken">
                        <div
                          className="h-full rounded-full bg-gold"
                          style={{ width: `${Math.round(share * 100)}%` }}
                        />
                      </div>
                      <span className="shrink-0 text-xs tabular-nums text-ink">
                        {formatMoney(row.total, 'IRT')}
                      </span>
                    </div>
                  );
                })}
              </CardBody>
            </Card>
          ) : null}
        </>
      )}

      <Card>
        <CardHeader title="هزینه‌ها" description="هر پرداختی که بابت کالا نبوده." />
        <CardBody className="space-y-2">
          {expenses.isPending ? (
            <Skeleton className="h-24 rounded-xl" />
          ) : expenses.isError ? (
            <ErrorState onRetry={() => expenses.refetch()} />
          ) : expenses.data.items.length === 0 ? (
            <EmptyState
              icon={<Receipt className="size-6" />}
              title="هزینه‌ای ثبت نشده"
              description="اجاره، قبض برق، حقوق و هر پرداخت دیگری را اینجا ثبت کنید."
            />
          ) : (
            expenses.data.items.map((expense) => (
              <ExpenseRow
                key={expense.id}
                expense={expense}
                editable={editable}
                onRemove={() => remove.mutate(expense.id)}
              />
            ))
          )}
        </CardBody>
      </Card>

      <ExpenseForm
        open={expenseOpen}
        onClose={() => setExpenseOpen(false)}
        onSaved={() => {
          setExpenseOpen(false);
          refresh();
        }}
      />
      <PurchaseForm
        open={purchaseOpen}
        onClose={() => setPurchaseOpen(false)}
        onSaved={() => {
          setPurchaseOpen(false);
          refresh();
        }}
      />
    </div>
  );
}

function Tile({
  label,
  value,
  hint,
  icon,
  tone,
}: {
  label: string;
  value: number;
  hint: string;
  icon: React.ReactNode;
  tone: 'positive' | 'critical' | 'neutral';
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center gap-2 text-xs text-ink-subtle">
        <span
          className={cn(
            tone === 'positive' && 'text-positive',
            tone === 'critical' && 'text-critical',
          )}
        >
          {icon}
        </span>
        {label}
      </div>
      {/*
        Compact on a tile: "۵۴۹.۲ میلیون تومان" is the figure an owner reads
        at a glance, and the exact number is one hover away. Spelling it out in
        full simply overflowed the card.
      */}
      <p
        title={formatMoney(value, 'IRT')}
        className={cn(
          'mt-1 text-xl font-bold tabular-nums',
          tone === 'positive' && 'text-positive',
          tone === 'critical' && 'text-critical',
          tone === 'neutral' && 'text-ink',
        )}
      >
        {formatMoneyCompact(value, 'IRT')}
      </p>
      <p className="mt-0.5 truncate text-xs text-ink-subtle">{hint}</p>
    </div>
  );
}

function ExpenseRow({
  expense,
  editable,
  onRemove,
}: {
  expense: ExpenseDto;
  editable: boolean;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-sunken p-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{expense.title}</p>
        <p className="mt-0.5 truncate text-xs text-ink-subtle">
          {expense.category?.name ?? '—'} ·{' '}
          {new Date(expense.spentAt).toLocaleDateString('fa-IR')}
          {expense.recurrence !== 'ONCE' ? ' · تکرارشونده' : ''}
        </p>
      </div>
      <span className="shrink-0 font-semibold tabular-nums text-ink">
        {formatMoney(expense.amount, 'IRT')}
      </span>
      {editable ? (
        <Button
          variant="ghost"
          size="icon"
          aria-label={`حذف ${expense.title}`}
          onClick={onRemove}
        >
          <Trash2 className="size-4" />
        </Button>
      ) : null}
    </div>
  );
}

function ExpenseForm({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [categoryId, setCategoryId] = useState('');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CASH');
  const [recurrence, setRecurrence] = useState('ONCE');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const categories = useQuery({
    queryKey: ['accounting-categories'],
    queryFn: () => accountingService.categories(),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setAmount('');
    setNote('');
    setErrors({});
    setCategoryId((current) => current || categories.data?.[0]?.id || '');
  }, [open, categories.data]);

  const save = useMutation({
    mutationFn: () =>
      accountingService.createExpense({
        categoryId,
        title: title.trim(),
        amount: Number(amount.replace(/\D/g, '')) || 0,
        method,
        recurrence,
        note: note.trim() || null,
      }),
    onSuccess: () => {
      toast.success('هزینه ثبت شد');
      onSaved();
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
      title="هزینه جدید"
      description="اجاره، قبض، حقوق و هر پرداختی که بابت کالا نبوده."
      footer={
        <div className="flex gap-3">
          <Button variant="ghost" fullWidth onClick={onClose}>
            انصراف
          </Button>
          <Button
            variant="primary"
            fullWidth
            loading={save.isPending}
            disabled={!categoryId || !title.trim()}
            onClick={() => save.mutate()}
          >
            ثبت هزینه
          </Button>
        </div>
      }
    >
      <div className="space-y-4 pt-1">
        <Select
          label="دسته"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          options={(categories.data ?? [])
            .filter((category) => category.isActive)
            .map((category) => ({ value: category.id, label: category.name }))}
          error={errors.categoryId}
        />
        <Input
          label="عنوان"
          placeholder="اجاره شهریور"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={errors.title}
          required
        />
        <Input
          label="مبلغ"
          dir="ltr"
          inputMode="numeric"
          rightAddon="تومان"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          error={errors.amount}
          required
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="روش پرداخت"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            options={METHODS.map(([value, label]) => ({ value, label }))}
          />
          <Select
            label="تکرار"
            hint="برای هزینه‌های ثابت مثل اجاره"
            value={recurrence}
            onChange={(e) => setRecurrence(e.target.value)}
            options={RECURRENCES.map(([value, label]) => ({ value, label }))}
          />
        </div>
        <Textarea
          label="توضیح"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
    </Modal>
  );
}
