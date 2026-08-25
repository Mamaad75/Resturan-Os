import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MenuView } from '@/features/customer/menu-view';
import { fetchPublicMenu } from './fetch-menu';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const menu = await fetchPublicMenu(slug);
  if (!menu) return { title: 'رستوران یافت نشد' };
  return {
    title: menu.restaurant.name,
    description:
      menu.restaurant.description ??
      menu.restaurant.branding.tagline ??
      `منوی ${menu.restaurant.name}`,
  };
}

/**
 * The menu is server-rendered so the first paint over a mobile connection is
 * immediate, and it never pulls in the admin bundle.
 */
export default async function RestaurantMenuPage({ params }: PageProps) {
  const { slug } = await params;
  const menu = await fetchPublicMenu(slug);
  if (!menu) notFound();
  return <MenuView menu={menu} slug={slug} />;
}
