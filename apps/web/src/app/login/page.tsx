'use client';

import { loginSchema } from '@restaurant-os/validation';
import { AlertCircle, ChefHat, Lock, Mail } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Button, Input } from '@/components/ui';
import { homeRouteForUser, useAuth } from '@/features/auth/auth-context';
import { ApiError } from '@/lib/api-client';

const DEMO_ACCOUNTS = [
  { label: 'مالک', email: 'owner@caferoz.ir', password: 'Owner12345' },
  { label: 'مدیر', email: 'manager@caferoz.ir', password: 'Manager12345' },
  { label: 'صندوق', email: 'cashier@caferoz.ir', password: 'Cashier12345' },
  { label: 'آشپزخانه', email: 'kitchen@caferoz.ir', password: 'Kitchen12345' },
];

export default function LoginPage() {
  const router = useRouter();
  const { login, status, user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === 'authenticated' && user) {
      router.replace(homeRouteForUser(user));
    }
  }, [status, user, router]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setErrors({});

    // Same schema the API enforces, used here purely for instant feedback.
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        fieldErrors[String(issue.path[0])] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setSubmitting(true);
    try {
      const authenticated = await login(parsed.data.email, parsed.data.password);
      router.replace(homeRouteForUser(authenticated));
    } catch (error) {
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
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      {/* Ambient gold wash - subtle, never the focus. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 start-1/2 size-[38rem] -translate-x-1/2 rounded-full bg-gold/[0.07] blur-3xl"
      />

      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl border border-gold/25 bg-gold/10">
            <ChefHat className="size-7 text-gold" />
          </div>
          <h1 className="text-2xl font-bold text-ink">ورود به سیستم</h1>
          <p className="mt-1.5 text-sm text-ink-muted">
            سامانه مدیریت رستوران و کافه
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

          <Input
            label="ایمیل"
            type="email"
            dir="ltr"
            autoComplete="username"
            placeholder="owner@caferoz.ir"
            leftAddon={<Mail className="size-4" />}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errors.email}
            required
          />

          <Input
            label="رمز عبور"
            type="password"
            dir="ltr"
            autoComplete="current-password"
            placeholder="••••••••"
            leftAddon={<Lock className="size-4" />}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
            required
          />

          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            loading={submitting}
          >
            ورود
          </Button>
        </form>

        {/* Development convenience; the seeded accounts are public by design. */}
        <div className="mt-6 rounded-2xl border border-line bg-surface-sunken/60 p-4">
          <p className="mb-3 text-xs font-medium text-ink-subtle">
            حساب‌های نمایشی (فقط برای محیط توسعه)
          </p>
          <div className="grid grid-cols-2 gap-2">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.email}
                type="button"
                onClick={() => {
                  setEmail(account.email);
                  setPassword(account.password);
                }}
                className="rounded-lg border border-line px-3 py-2 text-start text-xs text-ink-muted transition-colors hover:border-gold/40 hover:text-ink"
              >
                <span className="block font-medium text-ink">{account.label}</span>
                <span className="ltr-nums block truncate text-[0.7rem] text-ink-subtle">
                  {account.email}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
