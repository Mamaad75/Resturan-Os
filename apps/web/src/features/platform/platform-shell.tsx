'use client';

import { Building2, LayoutDashboard, LogOut, Package } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';
import { usePlatformAuth, usePlatformGuard } from './platform-auth';

const NAV = [
  { href: '/superadmin', label: 'داشبورد', icon: LayoutDashboard },
  { href: '/superadmin/tenants', label: 'کسب‌وکارها', icon: Building2 },
  { href: '/superadmin/plans', label: 'پلن‌ها', icon: Package },
];

/**
 * Chrome for the FoodOS platform console.
 *
 * Visually distinct from the restaurant admin on purpose: an operator with
 * both open should never be in doubt about which one they are acting in.
 */
export function PlatformShell({ children }: { children: ReactNode }) {
  const status = usePlatformGuard();
  const { admin, logout } = usePlatformAuth();
  const pathname = usePathname();
  const router = useRouter();

  if (status !== 'authenticated') {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner className="size-8" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-gold px-2 py-1 text-xs font-bold text-ink-inverse">
              FoodOS
            </span>
            <span className="text-sm text-ink-muted">مدیریت پلتفرم</span>
          </div>

          <nav className="flex flex-1 gap-1">
            {NAV.map((item) => {
              const active =
                item.href === '/superadmin'
                  ? pathname === '/superadmin'
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                    active
                      ? 'bg-gold/10 text-gold'
                      : 'text-ink-muted hover:bg-surface-raised hover:text-ink',
                  )}
                >
                  <item.icon className="size-4" />
                  <span className="hidden sm:inline">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-ink-subtle sm:inline">
              {admin?.fullName}
            </span>
            <button
              onClick={async () => {
                await logout();
                router.replace('/superadmin/login');
              }}
              aria-label="خروج"
              className="rounded-lg p-2 text-ink-subtle transition-colors hover:bg-surface-raised hover:text-ink"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-5">{children}</main>
    </div>
  );
}
