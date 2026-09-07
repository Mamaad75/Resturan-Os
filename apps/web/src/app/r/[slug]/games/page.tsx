import { GameHub } from '@/features/games/game-hub';
export const metadata = { title: 'بازی‌های دور میز' };
export default async function GamesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <GameHub slug={slug} />;
}
