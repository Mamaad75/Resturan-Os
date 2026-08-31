import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { PlatformAuthProvider } from '@/features/platform/platform-auth';

export const metadata: Metadata = {
  title: 'مدیریت پلتفرم | فوداواس',
  // The platform console has no business in a search index.
  robots: { index: false, follow: false },
};

export default function SuperAdminLayout({ children }: { children: ReactNode }) {
  return <PlatformAuthProvider>{children}</PlatformAuthProvider>;
}
