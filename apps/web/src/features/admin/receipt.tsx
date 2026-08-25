'use client';

import {
  PAYMENT_METHOD_LABELS_FA,
  ORDER_TYPE_LABELS_FA,
  type OrderDto,
} from '@restaurant-os/types';
import { formatDateTimeFa, formatMoney, toPersianDigits } from '@/lib/format';
import { cn } from '@/lib/cn';

export type ReceiptWidth = '58' | '80' | 'a4';

/**
 * Thermal receipt.
 *
 * Laid out for a 58mm or 80mm roll with an A4 fallback; the actual sizing and
 * the hiding of app chrome live in the `@media print` block in globals.css, so
 * the browser's own print dialog produces a clean receipt with no extra
 * tooling.
 */
export function Receipt({
  order,
  restaurantName,
  branchName,
  branchAddress,
  branchPhone,
  width = '80',
}: {
  order: OrderDto;
  restaurantName: string;
  branchName?: string | null;
  branchAddress?: string | null;
  branchPhone?: string | null;
  width?: ReceiptWidth;
}) {
  const paidPayments = order.payments.filter((p) => p.status === 'PAID');

  return (
    <div
      className={cn(
        'receipt mx-auto bg-white text-black',
        width === '58' && 'receipt--58',
        width === 'a4' && 'receipt--a4',
      )}
      dir="rtl"
    >
      <header className="text-center">
        <h1 className="text-base font-bold">{restaurantName}</h1>
        {branchName ? <p className="text-xs">{branchName}</p> : null}
        {branchAddress ? <p className="text-[0.65rem] leading-snug">{branchAddress}</p> : null}
        {branchPhone ? (
          <p className="text-[0.65rem]">تلفن: {toPersianDigits(branchPhone)}</p>
        ) : null}
      </header>

      <div className="my-2 border-t border-dashed border-black/40" />

      <div className="space-y-0.5 text-xs">
        <Line label="شماره سفارش" value={`#${toPersianDigits(order.orderNumber)}`} />
        <Line label="تاریخ" value={formatDateTimeFa(order.createdAt)} />
        <Line label="نوع" value={ORDER_TYPE_LABELS_FA[order.type]} />
        {order.table ? (
          <Line label="میز" value={toPersianDigits(order.table.number)} />
        ) : null}
        {order.customerName ? <Line label="مشتری" value={order.customerName} /> : null}
        {order.customerPhone ? (
          <Line label="موبایل" value={toPersianDigits(order.customerPhone)} />
        ) : null}
      </div>

      <div className="my-2 border-t border-dashed border-black/40" />

      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-black/30">
            <th className="pb-1 text-start font-semibold">شرح</th>
            <th className="pb-1 text-center font-semibold">تعداد</th>
            <th className="pb-1 text-end font-semibold">مبلغ</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item) => (
            <tr key={item.id} className="align-top">
              <td className="py-1">
                {item.productNameFa}
                {item.modifiers.length > 0 ? (
                  <span className="block text-[0.65rem] opacity-80">
                    {item.modifiers.map((m) => m.nameFa).join('، ')}
                  </span>
                ) : null}
                {item.notes ? (
                  <span className="block text-[0.65rem] opacity-80">{item.notes}</span>
                ) : null}
              </td>
              <td className="py-1 text-center tabular-nums">
                {toPersianDigits(item.quantity)}
              </td>
              <td className="py-1 text-end tabular-nums">
                {formatMoney(item.lineTotal, order.currency, { withUnit: false })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="my-2 border-t border-dashed border-black/40" />

      <div className="space-y-0.5 text-xs">
        <Line
          label="جمع اقلام"
          value={formatMoney(order.subtotal, order.currency, { withUnit: false })}
        />
        {order.discountTotal > 0 ? (
          <Line
            label="تخفیف"
            value={`(${formatMoney(order.discountTotal, order.currency, { withUnit: false })})`}
          />
        ) : null}
        {order.serviceChargeTotal > 0 ? (
          <Line
            label="حق سرویس"
            value={formatMoney(order.serviceChargeTotal, order.currency, {
              withUnit: false,
            })}
          />
        ) : null}
        {order.taxTotal > 0 ? (
          <Line
            label="مالیات بر ارزش افزوده"
            value={formatMoney(order.taxTotal, order.currency, { withUnit: false })}
          />
        ) : null}
      </div>

      <div className="my-1.5 border-t border-black/60" />

      <div className="flex items-center justify-between text-sm font-bold">
        <span>مبلغ قابل پرداخت</span>
        <span className="tabular-nums">{formatMoney(order.total, order.currency)}</span>
      </div>

      {paidPayments.length > 0 ? (
        <>
          <div className="my-2 border-t border-dashed border-black/40" />
          <div className="space-y-0.5 text-xs">
            {paidPayments.map((payment) => (
              <Line
                key={payment.id}
                label={PAYMENT_METHOD_LABELS_FA[payment.method]}
                value={formatMoney(payment.amount, order.currency, { withUnit: false })}
              />
            ))}
          </div>
        </>
      ) : null}

      <div className="my-2 border-t border-dashed border-black/40" />

      <footer className="text-center text-[0.65rem] leading-relaxed">
        <p className="font-medium">از انتخاب شما سپاسگزاریم</p>
        <p className="opacity-75">نوش جان!</p>
      </footer>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="opacity-80">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
