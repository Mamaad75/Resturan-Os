'use client';

import {
  WAITER_CALL_REASON_SHORT_FA,
  WaiterCallReason,
} from '@restaurant-os/types';
import { BellRing, Check, HandPlatter, Receipt, GlassWater } from 'lucide-react';
import { useState } from 'react';
import { Modal, useToast } from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { toPersianDigits } from '@/lib/format';
import { guestService } from '@/services';

const REASONS = [
  { id: WaiterCallReason.ASSISTANCE, icon: HandPlatter },
  { id: WaiterCallReason.BILL, icon: Receipt },
  { id: WaiterCallReason.SUPPLIES, icon: GlassWater },
] as const;

/**
 * Table-side service request.
 *
 * Only rendered when the guest arrived through a table QR code - there is no
 * one to call to a takeaway order.
 */
export function WaiterCallButton({
  slug,
  tableId,
  tableNumber,
}: {
  slug: string;
  tableId: string;
  tableNumber: number;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [sentReason, setSentReason] = useState<string | null>(null);

  async function call(reason: (typeof REASONS)[number]['id']) {
    setSending(reason);
    try {
      const result = await guestService.callWaiter(slug, { tableId, reason });
      setSentReason(reason);
      toast.success(
        result.alreadyOpen ? 'درخواست شما قبلاً ثبت شده' : 'گارسون خبر شد',
        `میز ${toPersianDigits(tableNumber)}`,
      );
      // Leave the confirmation visible briefly, then close.
      window.setTimeout(() => {
        setOpen(false);
        setSentReason(null);
      }, 1600);
    } catch (error) {
      toast.error(
        'ارسال درخواست انجام نشد',
        error instanceof ApiError ? error.message : undefined,
      );
    } finally {
      setSending(null);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="صدا زدن گارسون"
        className="flex items-center gap-1.5 rounded-full border border-line bg-surface-raised px-3 py-2 text-xs font-medium text-ink-muted transition-colors hover:border-gold/40 hover:text-ink"
      >
        <BellRing className="size-3.5" />
        صدا زدن گارسون
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="چه کمکی لازم دارید؟"
        description={`میز ${toPersianDigits(tableNumber)}`}
        size="sm"
      >
        <div className="grid gap-2 pt-1">
          {REASONS.map((reason) => {
            const isSent = sentReason === reason.id;
            return (
              <button
                key={reason.id}
                onClick={() => call(reason.id)}
                disabled={sending !== null}
                className={cn(
                  'flex items-center gap-3 rounded-xl border p-4 text-start transition-colors',
                  isSent
                    ? 'border-positive/50 bg-positive/[0.08]'
                    : 'border-line bg-surface-sunken hover:border-gold/40',
                  sending !== null && !isSent && 'opacity-50',
                )}
              >
                <span
                  className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-lg',
                    isSent ? 'bg-positive/15 text-positive' : 'bg-surface-raised text-gold',
                  )}
                >
                  {isSent ? <Check className="size-4" /> : <reason.icon className="size-4" />}
                </span>
                <span className="text-sm font-medium text-ink">
                  {isSent ? 'ثبت شد' : WAITER_CALL_REASON_SHORT_FA[reason.id]}
                </span>
              </button>
            );
          })}
        </div>
      </Modal>
    </>
  );
}
