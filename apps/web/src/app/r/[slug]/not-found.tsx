import { UtensilsCrossed } from 'lucide-react';

export default function RestaurantNotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <div className="mb-5 flex size-16 items-center justify-center rounded-2xl border border-line bg-surface-raised">
        <UtensilsCrossed className="size-7 text-ink-subtle" />
      </div>
      <h1 className="text-xl font-bold text-ink">رستوران یافت نشد</h1>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-muted">
        آدرس وارد شده معتبر نیست یا این رستوران دیگر فعال نیست. لطفاً کد QR روی میز را
        دوباره اسکن کنید.
      </p>
    </main>
  );
}
