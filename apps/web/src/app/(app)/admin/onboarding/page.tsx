'use client';

import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Check,
  ExternalLink,
  PartyPopper,
  QrCode,
  Table2,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { Button, Card, CardBody, Skeleton } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { cn } from '@/lib/cn';
import { toPersianDigits } from '@/lib/format';
import { menuService, qrService, restaurantService, tableService } from '@/services';

interface Step {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  href: string;
  cta: string;
  done: boolean;
  detail: string;
}

/**
 * First-run checklist.
 *
 * Every step reads real data rather than a stored "completed" flag, so it
 * stays honest: delete all your products and the menu step reopens.
 */
export default function OnboardingPage() {
  const { tenant } = useAuth();

  const restaurantQuery = useQuery({
    queryKey: ['restaurant'],
    queryFn: () => restaurantService.get(),
  });
  const productsQuery = useQuery({
    queryKey: ['admin-products', 'onboarding'],
    queryFn: () => menuService.products({ pageSize: 1 }),
  });
  const tablesQuery = useQuery({
    queryKey: ['tables'],
    queryFn: () => tableService.list(),
  });
  const qrQuery = useQuery({ queryKey: ['qr-codes'], queryFn: () => qrService.list() });

  const loading =
    restaurantQuery.isPending ||
    productsQuery.isPending ||
    tablesQuery.isPending ||
    qrQuery.isPending;

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-24 rounded-2xl" />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
    );
  }

  const productCount = productsQuery.data?.meta.total ?? 0;
  const tableCount = tablesQuery.data?.length ?? 0;
  const qrCount = qrQuery.data?.length ?? 0;
  const publicUrl = restaurantQuery.data?.publicUrl ?? '/';

  const steps: Step[] = [
    {
      id: 'menu',
      title: 'محصولات منو را اضافه کنید',
      description:
        'دسته‌بندی‌های اولیه ساخته شده‌اند. حالا غذاها و نوشیدنی‌ها را با قیمت وارد کنید.',
      icon: UtensilsCrossed,
      href: '/admin/menu',
      cta: 'رفتن به منو',
      done: productCount > 0,
      detail:
        productCount > 0
          ? `${toPersianDigits(productCount)} محصول ثبت شده`
          : 'هنوز محصولی ثبت نشده',
    },
    {
      id: 'tables',
      title: 'چیدمان میزها را بسازید',
      description:
        'برای سفارش سر میز، شماره میزها را وارد کنید. می‌توانید یک بازه را یک‌جا بسازید.',
      icon: Table2,
      href: '/admin/tables',
      cta: 'ساخت میزها',
      done: tableCount > 0,
      detail:
        tableCount > 0
          ? `${toPersianDigits(tableCount)} میز ثبت شده`
          : 'هنوز میزی ثبت نشده',
    },
    {
      id: 'qr',
      title: 'کدهای QR را چاپ کنید',
      description:
        'برای هر میز یک کد QR ساخته می‌شود. کد چاپ‌شده با تغییر قیمت یا منو بی‌اعتبار نمی‌شود.',
      icon: QrCode,
      href: '/admin/qr',
      cta: 'ساخت و چاپ QR',
      done: tableCount > 0 && qrCount > tableCount,
      detail:
        qrCount > 0 ? `${toPersianDigits(qrCount)} کد ساخته شده` : 'هنوز کدی ساخته نشده',
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Card className="overflow-hidden">
        <div className="relative p-6">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 start-1/2 size-72 -translate-x-1/2 rounded-full bg-gold/[0.09] blur-3xl"
          />
          <div className="relative">
            <div className="mb-3 flex items-center gap-2.5">
              <span className="flex size-10 items-center justify-center rounded-xl border border-gold/25 bg-gold/10">
                <PartyPopper className="size-5 text-gold" />
              </span>
              <div>
                <h1 className="text-lg font-bold text-ink">
                  {tenant?.name ?? 'رستوران شما'} ساخته شد
                </h1>
                <p className="text-sm text-ink-muted">
                  سه قدم تا دریافت اولین سفارش
                </p>
              </div>
            </div>

            {/* Progress */}
            <div className="mt-4 flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-sunken">
                <div
                  className="h-full rounded-full bg-gold transition-all duration-500"
                  style={{ width: `${(doneCount / steps.length) * 100}%` }}
                />
              </div>
              <span className="shrink-0 text-sm font-medium tabular-nums text-ink-muted">
                {toPersianDigits(doneCount)} از {toPersianDigits(steps.length)}
              </span>
            </div>
          </div>
        </div>
      </Card>

      {steps.map((step, index) => (
        <Card key={step.id} className={cn(step.done && 'opacity-75')}>
          <CardBody className="flex items-start gap-4">
            <span
              className={cn(
                'flex size-10 shrink-0 items-center justify-center rounded-xl border',
                step.done
                  ? 'border-positive/30 bg-positive/12 text-positive'
                  : 'border-line bg-surface-raised text-ink-subtle',
              )}
            >
              {step.done ? (
                <Check className="size-5" strokeWidth={3} />
              ) : (
                <step.icon className="size-5" />
              )}
            </span>

            <div className="min-w-0 flex-1">
              <h2 className="flex items-center gap-2 font-semibold text-ink">
                <span className="text-ink-subtle">{toPersianDigits(index + 1)}.</span>
                {step.title}
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                {step.description}
              </p>
              <p
                className={cn(
                  'mt-1.5 text-xs',
                  step.done ? 'text-positive' : 'text-ink-subtle',
                )}
              >
                {step.detail}
              </p>
            </div>

            <Link href={step.href} className="shrink-0">
              <Button variant={step.done ? 'ghost' : 'primary'} size="sm">
                {step.done ? 'ویرایش' : step.cta}
              </Button>
            </Link>
          </CardBody>
        </Card>
      ))}

      {allDone ? (
        <Card className="border-positive/30">
          <CardBody className="text-center">
            <p className="font-semibold text-positive">همه چیز آماده است</p>
            <p className="mt-1 text-sm text-ink-muted">
              کد QR را روی میزها بگذارید و اولین سفارش را دریافت کنید.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <a href={publicUrl} target="_blank" rel="noreferrer">
                <Button variant="secondary" leftIcon={<ExternalLink className="size-4" />}>
                  دیدن منوی مشتری
                </Button>
              </a>
              <Link href="/admin">
                <Button variant="primary" leftIcon={<ArrowLeft className="size-4" />}>
                  رفتن به داشبورد
                </Button>
              </Link>
            </div>
          </CardBody>
        </Card>
      ) : (
        <div className="text-center">
          <Link
            href="/admin"
            className="text-sm text-ink-subtle transition-colors hover:text-ink"
          >
            فعلاً رد شو، بعداً تکمیل می‌کنم
          </Link>
        </div>
      )}
    </div>
  );
}
