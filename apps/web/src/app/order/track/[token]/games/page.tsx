import { GameHub } from '@/features/games/game-hub';
export const metadata = {
  title: 'بازی و پاداش',
  robots: { index: false, follow: false },
  referrer: 'no-referrer' as const,
};
export default async function RewardGamesPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <GameHub token={token} />;
}
