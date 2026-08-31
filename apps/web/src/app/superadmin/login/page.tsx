'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Button, Input, useToast } from '@/components/ui';
import { usePlatformAuth } from '@/features/platform/platform-auth';
import { ApiError } from '@/lib/api-client';

export default function PlatformLoginPage() {
  const router = useRouter();
  const toast = useToast();
  const { login, status } = usePlatformAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status === 'authenticated') router.replace('/superadmin');
  }, [status, router]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await login(email, password);
      router.replace('/superadmin');
    } catch (error) {
      toast.error(
        'ورود ناموفق',
        error instanceof ApiError ? error.message : 'دوباره تلاش کنید.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-xs font-medium tracking-widest text-gold">FoodOS</p>
          <h1 className="mt-1 text-2xl font-bold text-ink">مدیریت پلتفرم</h1>
          <p className="mt-1 text-sm text-ink-subtle">
            این بخش فقط برای تیم فوداواس است.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <Input
            label="ایمیل"
            type="email"
            dir="ltr"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            label="رمز عبور"
            type="password"
            dir="ltr"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <Button type="submit" variant="primary" fullWidth loading={busy}>
            ورود
          </Button>
        </form>
      </div>
    </div>
  );
}
