'use client';

import { Download, Smartphone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, Card, CardBody, CardHeader, useToast } from '@/components/ui';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

/** PWA installation only. Push registration is automatic and has no app toggle. */
export function PwaDeviceCard() {
  const toast = useToast();
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;

    setInstalled(standalone);

    const handler = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  async function install() {
    if (!installPrompt) {
      toast.toast({
        tone: 'info',
        title: installed
          ? 'FoodOS روی این دستگاه نصب است'
          : 'نصب از منوی مرورگر',
        description:
          'در iPhone/iPad از Share → Add to Home Screen و در مرورگرهای دسکتاپ از Install app استفاده کنید.',
      });
      return;
    }

    await installPrompt.prompt();
    const result = await installPrompt.userChoice;

    if (result.outcome === 'accepted') {
      setInstalled(true);
    }

    setInstallPrompt(null);
  }

  return (
    <Card>
      <CardHeader
        title="نصب Restaurant OS روی دستگاه"
        description="پنل را مثل یک اپ مستقل روی صندوق، لپ‌تاپ، تبلت یا موبایل نصب کنید."
      />

      <CardBody>
        <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface-sunken/45 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/12 text-brand">
              <Smartphone className="size-5" />
            </span>

            <div>
              <p className="font-semibold text-ink">وب‌اپ قابل نصب</p>
              <p className="mt-1 text-xs leading-6 text-ink-muted">
                حالت مستقل، میانبر صندوق/KDS/سفارش‌ها و Service Worker فعال است.
              </p>
            </div>
          </div>

          <Button
            onClick={install}
            variant="secondary"
            className="shrink-0"
          >
            <Download className="size-4" />
            {installed ? 'نصب شده' : 'نصب Restaurant OS'}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
