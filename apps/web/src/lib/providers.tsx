'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ApiError } from '@/lib/api-client';
import { ToastProvider } from '@/components/ui';
import { AuthProvider } from '@/features/auth/auth-context';
import { ThemeProvider } from '@/features/theme/theme-context';
import { PwaBootstrap } from '@/features/pwa-bootstrap';
import { TenantThemeBootstrap } from '@/features/tenant-theme-bootstrap';

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 20_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: true,
            retry: (failureCount, error) => {
              // Auth and validation failures will never succeed on retry.
              if (error instanceof ApiError) {
                if (error.isAuthError || error.status < 500) return false;
              }
              return failureCount < 2;
            },
          },
          mutations: { retry: false },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider><PwaBootstrap /><TenantThemeBootstrap />{children}</AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
