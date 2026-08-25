'use client';

import { Permission, type Permission as PermissionType } from '@restaurant-os/types';
import {
  BarChart3,
  Bell,
  ChefHat,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  type LucideIcon,
  Menu as MenuIcon,
  QrCode,
  Settings,
  ShoppingCart,
  Table2,
  UserCog,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Button, Spinner } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { cn } from '@/lib/cn';
import { NotificationBell } from './notification-bell';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  permissions: PermissionType[];
  /** Shown in the mobile bottom bar (space for five at most). */
  primary?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    href: '/admin',
    label: 'داشبورد',
    icon: LayoutDashboard,
    permissions: [Permission.REPORT_READ],
    primary: true,
  },
  {
    href: '/admin/orders',
    label: 'سفارش‌ها',
    icon: ClipboardList,
    permissions: [Permission.ORDER_READ],
    primary: true,
  },
  {
    href: '/admin/tables',
    label: 'میزها',
    icon: Table2,
    permissions: [Permission.TABLE_READ],
    primary: true,
  },
  {
    href: '/admin/menu',
    label: 'منو',
    icon: UtensilsCrossed,
    permissions: [Permission.MENU_READ],
    primary: true,
  },
  {
    href: '/pos',
    label: 'صندوق',
    icon: ShoppingCart,
    permissions: [Permission.ORDER_CREATE],
  },
  {
    href: '/kds',
    label: 'آشپزخانه',
    icon: ChefHat,
    permissions: [Permission.KITCHEN_READ],
  },
  {
    href: '/admin/reports',
    label: 'گزارش‌ها',
    icon: BarChart3,
    permissions: [Permission.REPORT_READ],
  },
  {
    href: '/admin/qr',
    label: 'کدهای QR',
    icon: QrCode,
    permissions: [Permission.QR_MANAGE],
  },
  {
    href: '/admin/staff',
    label: 'کارکنان',
    icon: UserCog,
    permissions: [Permission.STAFF_READ],
  },
  {
    href: '/admin/settings',
    label: 'تنظیمات',
    icon: Settings,
    permissions: [Permission.SETTINGS_READ],
  },
];

/**
 * Admin shell.
 *
 * Desktop gets a persistent sidebar; mobile gets a bottom navigation bar plus
 * a drawer for the rest, which is a different interaction pattern rather than
 * a shrunken desktop layout.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { user, tenant, status, logout, can } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (status === 'anonymous') router.replace('/login');
  }, [status, router]);

  // Close the drawer whenever navigation happens.
  useEffect(() => setDrawerOpen(false), [pathname]);

  if (status === 'loading' || !user) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner className="size-8" />
      </div>
    );
  }

  const visibleItems = NAV_ITEMS.filter((item) => can(...item.permissions));
  const primaryItems = visibleItems.filter((item) => item.primary).slice(0, 4);

  return (
    <div className="min-h-dvh bg-canvas">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 start-0 z-40 hidden w-64 flex-col border-e border-line bg-surface lg:flex">
        <div className="flex h-16 items-center gap-2.5 border-b border-line px-5">
          <span className="flex size-9 items-center justify-center rounded-xl border border-gold/25 bg-gold/10">
            <ChefHat className="size-4.5 text-gold" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">
              {tenant?.name ?? 'رستوران'}
            </p>
            <p className="text-xs text-ink-subtle">سیستم مدیریت</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {visibleItems.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
        </nav>

        <div className="border-t border-line p-3">
          <UserCard onLogout={logout} />
        </div>
      </aside>

      {/* Mobile drawer */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />
          <aside className="absolute inset-y-0 start-0 flex w-72 flex-col bg-surface shadow-lifted animate-fade-in">
            <div className="flex h-16 items-center justify-between border-b border-line px-4">
              <span className="font-semibold text-ink">{tenant?.name}</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDrawerOpen(false)}
                aria-label="بستن منو"
              >
                <X className="size-5" />
              </Button>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto p-3">
              {visibleItems.map((item) => (
                <NavLink key={item.href} item={item} pathname={pathname} />
              ))}
            </nav>
            <div className="border-t border-line p-3">
              <UserCard onLogout={logout} />
            </div>
          </aside>
        </div>
      ) : null}

      <div className="lg:ps-64">
        <header className="app-header sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-canvas/85 px-4 backdrop-blur-xl">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setDrawerOpen(true)}
            aria-label="باز کردن منو"
          >
            <MenuIcon className="size-5" />
          </Button>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold text-ink">
              {visibleItems.find((item) => isActive(pathname, item.href))?.label ??
                'داشبورد'}
            </h1>
          </div>

          <NotificationBell />

          <div className="hidden items-center gap-2.5 sm:flex">
            <div className="text-end">
              <p className="text-sm font-medium leading-tight text-ink">
                {user.fullName}
              </p>
              <p className="text-xs text-ink-subtle">{roleLabel(user.role)}</p>
            </div>
            <span className="flex size-9 items-center justify-center rounded-xl bg-gold/12 text-sm font-semibold text-gold">
              {user.fullName.charAt(0)}
            </span>
          </div>
        </header>

        <main className="px-4 pb-24 pt-5 lg:pb-8 lg:px-6">{children}</main>
      </div>

      {/* Mobile bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-surface/95 backdrop-blur-xl lg:hidden">
        {primaryItems.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex flex-1 flex-col items-center gap-1 py-2.5 text-xs transition-colors',
                active ? 'text-gold' : 'text-ink-subtle',
              )}
            >
              <item.icon className="size-5" />
              {item.label}
            </Link>
          );
        })}
        <button
          onClick={() => setDrawerOpen(true)}
          className="flex flex-1 flex-col items-center gap-1 py-2.5 text-xs text-ink-subtle"
        >
          <MenuIcon className="size-5" />
          بیشتر
        </button>
      </nav>
    </div>
  );
}

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
        active
          ? 'bg-gold/12 text-gold'
          : 'text-ink-muted hover:bg-surface-raised hover:text-ink',
      )}
    >
      <item.icon className="size-4.5 shrink-0" />
      {item.label}
    </Link>
  );
}

function UserCard({ onLogout }: { onLogout: () => void }) {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-surface-sunken p-2.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gold/12 text-sm font-semibold text-gold">
        {user.fullName.charAt(0)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{user.fullName}</p>
        <p className="truncate text-xs text-ink-subtle">{roleLabel(user.role)}</p>
      </div>
      <button
        onClick={onLogout}
        aria-label="خروج"
        className="rounded-lg p-1.5 text-ink-subtle transition-colors hover:bg-surface-raised hover:text-critical"
      >
        <LogOut className="size-4" />
      </button>
    </div>
  );
}

/** `/admin` must not stay highlighted while on `/admin/orders`. */
function isActive(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function roleLabel(role: string): string {
  const labels: Record<string, string> = {
    OWNER: 'مالک',
    MANAGER: 'مدیر',
    CASHIER: 'صندوق‌دار',
    KITCHEN: 'آشپزخانه',
    WAITER: 'گارسون',
    ACCOUNTANT: 'حسابدار',
  };
  return labels[role] ?? role;
}
