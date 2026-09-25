'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Loader2, Plus, Receipt, Trash2, TriangleAlert, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  Badge,
  Button,
  Input,
  Modal,
  Select,
  Textarea,
  useToast,
} from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { formatMoney, toPersianDigits } from '@/lib/format';
import { accountingService, type ScannedLine } from '@/services';

interface DraftLine extends ScannedLine {
  /** Local key so React keeps focus while a row is edited. */
  key: string;
}

const blankLine = (): DraftLine => ({
  key: Math.random().toString(36).slice(2),
  name: '',
  unit: 'UNIT',
  quantity: 1,
  unitCost: 0,
});

const UNITS = [
  ['UNIT', 'عدد'],
  ['KG', 'کیلوگرم'],
  ['G', 'گرم'],
  ['L', 'لیتر'],
  ['ML', 'میلی‌لیتر'],
  ['PACK', 'بسته'],
  ['BOX', 'کارتن'],
  ['TRAY', 'شانه'],
] as const;

/**
 * Recording a purchase.
 *
 * Two ways in: photograph the invoice, or type it. The photograph path never
 * writes anything on its own - what the camera read lands in the same editable
 * table as a typed purchase, and the owner confirms it. A misread digit should
 * cost a correction, not a wrong stock level.
 */
export function PurchaseForm({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [supplierName, setSupplierName] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([blankLine()]);
  const [mismatch, setMismatch] = useState<number | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);

  const scanAvailable = useQuery({
    queryKey: ['scan-status'],
    queryFn: () => accountingService.scanStatus(),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    setSupplierName('');
    setInvoiceNumber('');
    setNote('');
    setLines([blankLine()]);
    setMismatch(null);
    setConfidence(null);
  }, [open]);

  const total = lines.reduce(
    (sum, line) => sum + Math.round(line.quantity * line.unitCost),
    0,
  );

  const scan = useMutation({
    mutationFn: (file: File) => accountingService.scanInvoice(file),
    onSuccess: (review) => {
      if (review.supplierName) setSupplierName(review.supplierName);
      if (review.invoiceNumber) setInvoiceNumber(review.invoiceNumber);
      setLines(
        review.lines.map((line) => ({
          ...line,
          unit: line.unit ?? 'UNIT',
          key: Math.random().toString(36).slice(2),
        })),
      );
      setMismatch(review.totalMismatch);
      setConfidence(review.confidence);
      toast.success(
        `${toPersianDigits(review.lines.length)} ردیف خوانده شد`,
        'قبل از ذخیره، مقادیر را بررسی کنید.',
      );
    },
    onError: (error) =>
      toast.error(
        'اسکن انجام نشد',
        error instanceof ApiError ? error.message : undefined,
      ),
  });

  const save = useMutation({
    mutationFn: () =>
      accountingService.purchase({
        supplierName: supplierName.trim() || null,
        invoiceNumber: invoiceNumber.trim() || null,
        note: note.trim() || null,
        lines: lines
          .filter((line) => line.name.trim() && line.quantity > 0)
          .map((line) => ({
            name: line.name.trim(),
            unit: line.unit ?? 'UNIT',
            quantity: line.quantity,
            unitCost: line.unitCost,
          })),
      }),
    onSuccess: (result) => {
      toast.success(
        'خرید ثبت شد',
        `${toPersianDigits(result.lineCount)} قلم به انبار اضافه شد.`,
      );
      onSaved();
    },
    onError: (error) =>
      toast.error(
        'ثبت نشد',
        error instanceof ApiError ? error.message : undefined,
      ),
  });

  const setLine = (key: string, patch: Partial<DraftLine>) =>
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );

  const digits = (value: string) => Number(value.replace(/[^\d.]/g, '')) || 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="ثبت خرید"
      description="فاکتور را عکس بگیرید یا ردیف‌ها را وارد کنید. هر قلم به انبار اضافه می‌شود."
      size="lg"
      footer={
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-ink-subtle">جمع</p>
            <p className="truncate text-base font-bold text-gold">
              {formatMoney(total, 'IRT')}
            </p>
          </div>
          <Button variant="ghost" onClick={onClose}>
            انصراف
          </Button>
          <Button
            variant="primary"
            loading={save.isPending}
            disabled={total <= 0}
            onClick={() => save.mutate()}
          >
            ثبت و افزودن به انبار
          </Button>
        </div>
      }
    >
      <div className="space-y-4 pt-1">
        {/*
          `capture="environment"` opens the rear camera straight away on a
          phone, while still allowing a gallery pick on a desktop.
        */}
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) scan.mutate(file);
            event.target.value = '';
          }}
        />

        {scanAvailable.data?.available === false ? (
          <p className="rounded-xl border border-line bg-surface-sunken p-3 text-xs leading-relaxed text-ink-muted">
            اسکن خودکار فاکتور روی این سرور فعال نیست. ردیف‌ها را دستی وارد کنید،
            یا کلید سرویس را در تنظیمات سرور ثبت کنید.
          </p>
        ) : (
          <Button
            variant="secondary"
            fullWidth
            loading={scan.isPending}
            leftIcon={<Camera className="size-4" />}
            onClick={() => fileRef.current?.click()}
          >
            {scan.isPending ? 'در حال خواندن فاکتور…' : 'اسکن فاکتور با دوربین'}
          </Button>
        )}

        {confidence != null && confidence < 0.7 ? (
          <p className="flex items-start gap-2 rounded-xl border border-caution/30 bg-caution/10 p-3 text-xs leading-relaxed text-caution">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            خوانایی عکس پایین بود. لطفاً همه ردیف‌ها را با فاکتور مقابله کنید.
          </p>
        ) : null}

        {mismatch != null && mismatch !== 0 ? (
          <p className="flex items-start gap-2 rounded-xl border border-critical/30 bg-critical/10 p-3 text-xs leading-relaxed text-critical">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            جمع ردیف‌ها با مبلغ نوشته‌شده روی فاکتور{' '}
            {formatMoney(Math.abs(mismatch), 'IRT')} اختلاف دارد. احتمالاً یک عدد
            اشتباه خوانده شده است.
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="فروشنده"
            placeholder="نام مغازه یا پخش"
            value={supplierName}
            onChange={(e) => setSupplierName(e.target.value)}
          />
          <Input
            label="شماره فاکتور"
            dir="ltr"
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-ink-muted">اقلام</p>
          {lines.map((line) => (
            <div
              key={line.key}
              className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-[1fr_5rem_6rem_7rem_auto]"
            >
              <Input
                aria-label="نام کالا"
                placeholder="نام کالا"
                value={line.name}
                onChange={(e) => setLine(line.key, { name: e.target.value })}
              />
              <Select
                aria-label="واحد"
                value={line.unit ?? 'UNIT'}
                onChange={(e) => setLine(line.key, { unit: e.target.value })}
                options={UNITS.map(([value, label]) => ({ value, label }))}
              />
              <Input
                aria-label="تعداد"
                dir="ltr"
                inputMode="decimal"
                value={String(line.quantity)}
                onChange={(e) =>
                  setLine(line.key, { quantity: digits(e.target.value) })
                }
              />
              <Input
                aria-label="قیمت واحد"
                dir="ltr"
                inputMode="numeric"
                rightAddon="ت"
                value={String(line.unitCost)}
                onChange={(e) =>
                  setLine(line.key, { unitCost: digits(e.target.value) })
                }
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label={`حذف ${line.name || 'ردیف'}`}
                onClick={() =>
                  setLines((current) =>
                    current.length === 1
                      ? [blankLine()]
                      : current.filter((row) => row.key !== line.key),
                  )
                }
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<Plus className="size-4" />}
            onClick={() => setLines((current) => [...current, blankLine()])}
          >
            افزودن ردیف
          </Button>
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
