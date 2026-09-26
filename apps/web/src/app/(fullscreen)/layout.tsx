'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Spinner } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { PanelTheme } from '@/features/theme/panel-theme';

/**
 * Full-screen surfaces (POS, kitchen display).
 *
 * No sidebar, no breadcrumbs: these run on a dedicated tablet or screen where
 * every pixel of chrome is a pixel not showing orders.
 */
export default function FullscreenLayout({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === 'anonymous') router.replace('/login');
  }, [status, router]);

  if (status !== 'authenticated') {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner className="size-8" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-canvas">
      {/* The restaurant's own palette, here too: a till in the dining room is
          the screen guests are most likely to see over the counter. */}
      <PanelTheme />
      {children}
    </div>
  );
}
