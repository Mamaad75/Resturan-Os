'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Printer, QrCode, RefreshCw } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  Skeleton,
  useToast,
} from '@/components/ui';
import { API_BASE } from '@/lib/api-client';
import { toPersianDigits } from '@/lib/format';
import { qrService } from '@/services';

/**
 * QR management.
 *
 * The printable sheet is rendered from data URLs the API returns, so printing
 * needs no extra tooling - the browser's own print dialog produces a page of
 * table cards ready to cut.
 */
export default function QrPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [showSheet, setShowSheet] = useState(false);

  const codesQuery = useQuery({
    queryKey: ['qr-codes'],
    queryFn: () => qrService.list(),
  });

  const sheetQuery = useQuery({
    queryKey: ['qr-print-sheet'],
    queryFn: () => qrService.printSheet(),
    enabled: showSheet,
  });

  const sync = useMutation({
    mutationFn: () => qrService.sync(),
    onSuccess: (result) => {
      toast.success(
        result.created > 0
          ? `${toPersianDigits(result.created)} کد جدید ساخته شد`
          : 'همه میزها کد QR دارند',
        `مجموع: ${toPersianDigits(result.total)} کد`,
      );
      void queryClient.invalidateQueries({ queryKey: ['qr-codes'] });
      void queryClient.invalidateQueries({ queryKey: ['qr-print-sheet'] });
    },
    onError: () => toast.error('همگام‌سازی انجام نشد'),
  });

  const codes = codesQuery.data ?? [];

  return (
    <div className="space-y-5">
      <Card className="no-print">
        <CardHeader
          title="کدهای QR"
          description="هر کد فقط به یک آدرس ثابت اشاره می‌کند؛ تغییر قیمت یا منو، کد چاپ‌شده را بی‌اعتبار نمی‌کند."
          action={
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<RefreshCw className="size-4" />}
                loading={sync.isPending}
                onClick={() => sync.mutate()}
              >
                همگام‌سازی
              </Button>
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Printer className="size-4" />}
                onClick={() => {
                  setShowSheet(true);
                  // Give the sheet a beat to fetch and paint before printing.
                  window.setTimeout(() => window.print(), 900);
                }}
              >
                چاپ همه
              </Button>
            </div>
          }
        />
        <CardBody>
          {codesQuery.isPending ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
              {Array.from({ length: 12 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square rounded-xl" />
              ))}
            </div>
          ) : codesQuery.isError ? (
            <ErrorState onRetry={() => codesQuery.refetch()} />
          ) : codes.length === 0 ? (
            <EmptyState
              icon={<QrCode className="size-6" />}
              title="کدی ساخته نشده"
              description="با همگام‌سازی، برای رستوران و هر میز یک کد QR ساخته می‌شود."
              action={
                <Button variant="primary" onClick={() => sync.mutate()}>
                  ساخت کدها
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
              {codes.map((code) => (
                <div
                  key={code.id}
                  className="rounded-xl border border-line bg-surface-sunken p-3 text-center"
                >
                  <div className="mb-2 flex aspect-square items-center justify-center rounded-lg bg-white p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`${API_BASE}/qr/${code.id}/png?size=320`}
                      alt={`کد QR ${code.label}`}
                      className="size-full object-contain"
                      loading="lazy"
                    />
                  </div>
                  <p className="truncate text-xs font-medium text-ink">{code.label}</p>
                  <p className="mt-0.5 text-[0.65rem] text-ink-subtle">
                    {toPersianDigits(code.scanCount)} اسکن
                  </p>
                  <div className="mt-2 flex gap-1">
                    <a
                      href={`${API_BASE}/qr/${code.id}/png?size=1024`}
                      className="flex flex-1 items-center justify-center gap-1 rounded-md border border-line py-1 text-[0.65rem] text-ink-muted hover:text-ink"
                    >
                      <Download className="size-3" />
                      PNG
                    </a>
                    <a
                      href={`${API_BASE}/qr/${code.id}/svg`}
                      className="flex flex-1 items-center justify-center gap-1 rounded-md border border-line py-1 text-[0.65rem] text-ink-muted hover:text-ink"
                    >
                      <Download className="size-3" />
                      SVG
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Print-only sheet: one card per table, cut lines implied by the border. */}
      {showSheet && sheetQuery.data ? (
        <div className="print-only">
          <div className="receipt--a4 mx-auto grid grid-cols-3 gap-4 bg-white p-4 text-black">
            {sheetQuery.data.codes.map((code) => (
              <div
                key={code.id}
                className="flex flex-col items-center gap-2 rounded-lg border border-black/25 p-3 text-center"
                style={{ breakInside: 'avoid' }}
              >
                <p className="text-sm font-bold">{sheetQuery.data.restaurant.name}</p>
                <Image
                  src={code.dataUrl}
                  alt={code.label}
                  width={140}
                  height={140}
                  unoptimized
                />
                <p className="text-xs font-semibold">{code.label}</p>
                <p className="text-[0.6rem] opacity-70">
                  برای دیدن منو، کد را اسکن کنید
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
