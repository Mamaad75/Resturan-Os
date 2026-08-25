import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MenuView } from '@/features/customer/menu-view';
import { fetchPublicMenu } from '../../fetch-menu';

interface PageProps {
  params: Promise<{ slug: string; table: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const menu = await fetchPublicMenu(slug);
  return { title: menu?.restaurant.name ?? 'منو' };
}

/**
 * Table-scoped entry point: `/r/cafe-roz/t/12`.
 *
 * The QR code carries only this path, so the printed card stays valid no
 * matter how the menu changes.
 */
export default async function TableMenuPage({ params }: PageProps) {
  const { slug, table } = await params;
  const tableNumber = Number(table);
  if (!Number.isInteger(tableNumber) || tableNumber < 1) notFound();

  const menu = await fetchPublicMenu(slug, tableNumber);
  if (!menu) notFound();

  return <MenuView menu={menu} slug={slug} />;
}
