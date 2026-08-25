import '@fontsource-variable/vazirmatn';
import '@/styles/globals.css';
import type { Metadata, Viewport } from 'next';
import { AppProviders } from '@/lib/providers';

export const metadata: Metadata = {
  title: {
    default: 'رستوران‌ اواس | سیستم مدیریت رستوران و کافه',
    template: '%s | رستوران‌ اواس',
  },
  description:
    'سامانه یکپارچه مدیریت رستوران و کافه: منوی دیجیتال، سفارش‌گیری با QR، صندوق، آشپزخانه و گزارش‌های فروش.',
  applicationName: 'Restaurant OS',
  formatDetection: { telephone: false },
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
