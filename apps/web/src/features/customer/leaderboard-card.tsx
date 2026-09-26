'use client';

import { useQuery } from '@tanstack/react-query';
import { Medal, Trophy } from 'lucide-react';
import { Card } from '@/components/ui';
import { cn } from '@/lib/cn';
import { toPersianDigits } from '@/lib/format';
import { publicGameService } from '@/services';

/** Days left, in the words a guest would use. */
function remaining(endsAt: string): string {
  const days = Math.ceil((new Date(endsAt).getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return 'امروز آخرین روز است';
  if (days === 1) return 'یک روز مانده';
  return `${toPersianDigits(days)} روز مانده`;
}

/**
 * The season board.
 *
 * The point of a competition is that people can see it: a restaurant's
 * regulars playing for the top of a board all month is a reason to come back
 * that no single discount buys. Everyone on it is shown by the name they gave
 * or a masked number - the board is public to anyone who scans the QR code.
 *
 * Renders nothing until the restaurant switches the competition on.
 */
export function LeaderboardCard({ token }: { token: string }) {
  const query = useQuery({
    queryKey: ['leaderboard', token],
    queryFn: () => publicGameService.leaderboardByToken(token),
    staleTime: 60_000,
  });

  const board = query.data;
  if (!board?.enabled || !board.standings) return null;

  const prizeFor = (rank: number) =>
    board.prizes?.find((prize) => prize.rank === rank)?.label ?? null;

  return (
    <Card className="mt-4 overflow-hidden p-0">
      <div className="border-b border-line px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Trophy className="size-4 text-brand" aria-hidden />
            جدول مسابقه
          </p>
          {board.seasonEndsAt ? (
            <span className="text-xs text-ink-subtle">
              {remaining(board.seasonEndsAt)}
            </span>
          ) : null}
        </div>
      </div>

      <div className="p-4">
        {board.standings.length === 0 ? (
          <p className="text-center text-sm text-ink-muted">
            هنوز کسی امتیازی نگرفته. اولین نفر باشید!
          </p>
        ) : (
          <ol className="space-y-1.5">
            {board.standings.map((standing, index) => {
              const prize = prizeFor(standing.rank);
              return (
                <li
                  key={`${standing.rank}-${standing.displayName}-${index}`}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border px-3 py-2',
                    standing.isYou
                      ? 'border-brand/50 bg-brand/[0.08]'
                      : 'border-line bg-surface',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold tabular-nums',
                      standing.rank <= 3
                        ? 'bg-brand/15 text-brand'
                        : 'bg-surface-sunken text-ink-muted',
                    )}
                  >
                    {toPersianDigits(standing.rank)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">
                    {standing.displayName}
                    {standing.isYou ? (
                      <span className="text-xs text-brand"> (شما)</span>
                    ) : null}
                  </span>
                  {prize ? (
                    <span className="hidden items-center gap-1 text-xs text-ink-subtle sm:flex">
                      <Medal className="size-3" aria-hidden />
                      {prize}
                    </span>
                  ) : null}
                  <span className="shrink-0 text-sm font-bold tabular-nums text-ink">
                    {toPersianDigits(standing.score)}
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        {board.you && board.you.rank === null && board.standings.length > 0 ? (
          <p className="mt-3 text-center text-xs text-ink-subtle">
            شما هنوز در جدول این دوره نیستید. یک بازی کنید تا وارد شوید.
          </p>
        ) : null}

        {board.you?.rank != null && board.you.rank > board.standings.length ? (
          <p className="mt-3 text-center text-xs text-ink-muted">
            رتبهٔ شما: {toPersianDigits(board.you.rank)} با{' '}
            {toPersianDigits(board.you.score)} امتیاز
          </p>
        ) : null}
      </div>
    </Card>
  );
}
