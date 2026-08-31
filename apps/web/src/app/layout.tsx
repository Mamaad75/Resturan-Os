import '@fontsource-variable/vazirmatn';
import '@/styles/globals.css';
import type { Metadata, Viewport } from 'next';
import { AppProviders } from '@/lib/providers';

export const metadata: Metadata = {
  title: {
    default: 'فوداواس | سیستم رشد فروش کافه و رستوران',
    template: '%s | فوداواس',
  },
  description:
    'فوداواس: منوی دیجیتال، سفارش‌گیری با QR، صندوق، آشپزخانه، باشگاه مشتریان و گزارش‌های رشد فروش برای کافه، رستوران و فست‌فود.',
  applicationName: 'FoodOS',
  formatDetection: { telephone: false },
  // PWA-facing identity, so an installed shortcut says FoodOS too.
  appleWebApp: { capable: true, title: 'FoodOS', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  themeColor: '#0B0B0D',
  width: 'device-width',
  initialScale: 1,
  // The POS and kitchen displays are touch surfaces; let staff zoom if needed.
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <body
        style={{ ['--font-vazirmatn' as string]: "'Vazirmatn Variable'" }}
        className="min-h-dvh bg-canvas font-sans text-ink"
      >
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
