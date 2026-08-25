'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Spinner } from '@/components/ui';
import { homeRouteForUser, useAuth } from '@/features/auth/auth-context';

/** Sends each signed-in role to the surface it actually works in. */
export default function RootPage() {
  const router = useRouter();
  const { status, user } = useAuth();

  useEffect(() => {
    if (status === 'loading') return;
    router.replace(user ? homeRouteForUser(user) : '/login');
  }, [status, user, router]);

  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Spinner className="size-8" />
    </div>
  );
}
