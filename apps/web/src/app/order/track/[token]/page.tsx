import type { Metadata } from 'next';
import { TrackingView } from '@/features/customer/tracking-view';

export const metadata: Metadata = { title: 'پیگیری سفارش' };

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function TrackOrderPage({ params }: PageProps) {
  const { token } = await params;
  return <TrackingView token={token} />;
}
