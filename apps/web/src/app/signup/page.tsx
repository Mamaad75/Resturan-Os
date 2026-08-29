'use client';

import { signupSchema } from '@restaurant-os/validation';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  Check,
  ChefHat,
  Coffee,
  Loader2,
  Pizza,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Button, Input } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { ApiError } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { signupService } from '@/services';

type BusinessType = 'cafe' | 'restaurant' | 'fastfood';

const BUSINESS_TYPES: Array<{
  id: BusinessType;
  label: string;
  hint: string;
  icon: typeof Coffee;
}> = [
  { id: 'cafe', label: 'کافه', hint: 'قهوه، دسر، نوشیدنی', icon: Coffee },
  { id: 'restaurant', label: 'رستوران', hint: 'غذای اصلی، پیش‌غذا', icon: UtensilsCrossed },
  { id: 'fastfood', label: 'فست‌فود', hint: 'برگر، پیتزا، ساندویچ', icon: Pizza },
];

/** Latinises a Persian restaurant name into a usable URL suggestion. */
function suggestSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[‌\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
}

export default function SignupPage() {
  const router = useRouter();
  const { status } = useAuth();

  const [restaurantName, setRestaurantName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [businessType, setBusinessType] = useState<BusinessType>('cafe');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'authenticated') router.replace('/admin');
  }, [status, router]);

  // Derive the address from the name until the owner edits it themselves.
  useEffect(() => {
    if (!slugTouched) setSlug(suggestSlug(restaurantName));
  }, [restaurantName, slugTouched]);

  // Debounced availability check; only meaningful once it could be valid.
  const [debouncedSlug, setDebouncedSlug] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSlug(slug), 450);
    return () => window.clearTimeout(timer);
  }, [slug]);

  const slugQuery = useQuery({
    queryKey: ['slug-available', debouncedSlug],
    queryFn: () => signupService.checkSlug(debouncedSlug),
    enabled: debouncedSlug.length >= 2,
    staleTime: 30_000,
  });

  const signup = useMutation({
    mutationFn: () =>
      signupService.create({
        restaurantName: restaurantName.trim(),
        slug,
        ownerName: ownerName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        password,
        confirmPassword,
        businessType,
        acceptedTerms,
      }),
    onSuccess: () => {
      // The API signs the owner in, so go straight to the setup wizard.
      window.location.href = '/admin/onboarding';
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        setFormError(error.message);
        if (error.details) {
          setErrors(
            Object.fromEntries(
              Object.entries(error.details).map(([key, list]) => [key, list[0]]),
            ),
          );
        }
      } else {
        setFormError('ارتباط با سرور برقرار نشد.');
      }
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setErrors({});

    const parsed = signupSchema.safeParse({
      restaurantName: restaurantName.trim(),
      slug,
      ownerName: ownerName.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      password,
      confirmPassword,
      businessType,
      acceptedTerms,
    });

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        fieldErrors[String(issue.path[0])] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    if (slugQuery.data && !slugQuery.data.available) {
      setErrors({ slug: 'این نشانی قبلاً استفاده شده است.' });
      return;
    }

    signup.mutate();
  }

  const slugState =
    slug.length < 2
      ? 'idle'
      : slugQuery.isFetching
        ? 'checking'
        : slugQuery.data?.available
          ? 'free'
          : slugQuery.data
            ? 'taken'
            : 'idle';

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-48 start-1/2 size-[42rem] -translate-x-1/2 rounded-full bg-gold/[0.07] blur-3xl"
      />

      <div className="relative w-full max-w-lg">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl border border-gold/25 bg-gold/10">
            <ChefHat className="size-7 text-gold" />
          </div>
          <h1 className="text-2xl font-bold text-ink">رستوران خود را بسازید</h1>
          <p className="mt-1.5 text-sm text-ink-muted">
            کمتر از دو دقیقه — منوی دیجیتال و کد QR بلافاصله آماده می‌شود.
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="glass space-y-5 rounded-2xl p-6 shadow-panel"
          noValidate
        >
          {formError ? (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-xl border border-critical/30 bg-critical/10 p-3.5 text-sm text-critical"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{formError}</span>
            </div>
          ) : null}

          <div>
            <p className="mb-2 text-sm font-medium text-ink-muted">نوع کسب‌وکار</p>
            <div className="grid grid-cols-3 gap-2">
              {BUSINESS_TYPES.map((type) => (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => setBusinessType(type.id)}
                  aria-pressed={businessType === type.id}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-xl border p-3 transition-colors',
                    businessType === type.id
                      ? 'border-gold/50 bg-gold/[0.08]'
                      : 'border-line bg-surface-sunken hover:border-line-strong',
                  )}
                >
                  <type.icon
                    className={cn(
                      'size-5',
                      businessType === type.id ? 'text-gold' : 'text-ink-subtle',
                    )}
                  />
                  <span className="text-sm font-medium text-ink">{type.label}</span>
                  <span className="text-[0.65rem] leading-tight text-ink-subtle">
                    {type.hint}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <Input
            label="نام رستوران"
            placeholder="کافه رُز"
            value={restaurantName}
            onChange={(e) => setRestaurantName(e.target.value)}
            error={errors.restaurantName}
            required
          />

          <div>
            <Input
              label="نشانی عمومی منو"
              dir="ltr"
              placeholder="cafe-roz"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(suggestSlug(e.target.value));
              }}
              error={errors.slug}
              hint={
                slugState === 'taken'
                  ? undefined
                  : 'این نشانی روی کدهای QR چاپ می‌شود و بعداً تغییرش کدهای قبلی را بی‌اعتبار می‌کند.'
              }
              rightAddon={
                slugState === 'checking' ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : slugState === 'free' ? (
                  <Check className="size-4 text-positive" />
                ) : slugState === 'taken' ? (
                  <X className="size-4 text-critical" />
                ) : null
              }
              required
            />
            <p
              className={cn(
                'mt-1.5 text-xs',
                slugState === 'taken' ? 'text-critical' : 'text-ink-subtle',
              )}
            >
              {slugState === 'taken'
                ? 'این نشانی قبلاً استفاده شده است.'
                : slug
                  ? `منوی شما: /r/${slug}`
                  : ' '}
            </p>
          </div>

          <div className="h-px bg-line" />

          <Input
            label="نام و نام خانوادگی شما"
            placeholder="سارا رضایی"
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
            error={errors.ownerName}
            required
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="ایمیل"
              type="email"
              dir="ltr"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={errors.email}
              required
            />
            <Input
              label="شماره موبایل"
              type="tel"
              dir="ltr"
              inputMode="numeric"
              placeholder="۰۹۱۲۱۲۳۴۵۶۷"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              error={errors.phone}
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="رمز عبور"
              type="password"
              dir="ltr"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={errors.password}
              hint="حداقل ۱۰ کاراکتر شامل حرف و عدد"
              required
            />
            <Input
              label="تکرار رمز عبور"
              type="password"
              dir="ltr"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              error={errors.confirmPassword}
              required
            />
          </div>

          <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink-muted">
            <input
              type="checkbox"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-[rgb(var(--gold))]"
            />
            <span>
              قوانین و شرایط استفاده از سرویس را می‌پذیرم.
              {errors.acceptedTerms ? (
                <span className="mt-0.5 block text-xs text-critical">
                  {errors.acceptedTerms}
                </span>
              ) : null}
            </span>
          </label>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            loading={signup.isPending}
            disabled={slugState === 'taken'}
          >
            ساخت رستوران
          </Button>

          <p className="text-center text-sm text-ink-muted">
            قبلاً ثبت‌نام کرده‌اید؟{' '}
            <Link href="/login" className="font-medium text-gold hover:text-gold-bright">
              وارد شوید
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
