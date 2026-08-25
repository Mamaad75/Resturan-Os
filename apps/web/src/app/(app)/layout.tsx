import { AppShell } from '@/features/admin/app-shell';

/**
 * Route group for every authenticated surface. POS and KDS opt out of the
 * shell with their own layouts, because a full-screen counter or kitchen
 * display should not carry a sidebar.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
