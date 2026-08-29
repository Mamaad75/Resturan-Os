'use client';

import {
  RealtimeEvent,
  WAITER_CALL_REASON_LABELS_FA,
} from '@restaurant-os/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, Check } from 'lucide-react';
import { useCallback } from 'react';
import { Button, useToast } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { useRealtime } from '@/hooks/use-realtime';
import { cn } from '@/lib/cn';
import { toPersianDigits } from '@/lib/format';
import { guestService } from '@/services';

/**
 * Open service requests, shown across the top of the counter.
 *
 * Realtime pushes the alert the moment a guest taps; polling is the fallback
 * so a blocked WebSocket cannot leave a table waiting unseen.
 */
export function WaiterCallBar() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();

  const callsQuery = useQuery({
    queryKey: ['waiter-calls'],
    queryFn: () => guestService.openCalls(),
    refetchInterval: 30_000,
  });

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['waiter-calls'] });
  }, [queryClient]);

  const onCalled = useCallback(
    (payload: unknown) => {
      const call = payload as { tableNumber?: number };
      if (call?.tableNumber != null) {
        toast.toast({
          tone: 'warning',
          title: `میز ${toPersianDigits(call.tableNumber)} درخواست دارد`,
          durationMs: 8000,
        });
      }
      refresh();
    },
    [refresh, toast],
  );

  useRealtime({
    token: accessToken,
    handlers: {
      [RealtimeEvent.WAITER_CALLED]: onCalled,
      [RealtimeEvent.WAITER_CALL_RESOLVED]: refresh,
    },
  });

  const resolve = useMutation({
    mutationFn: (id: string) => guestService.updateCall(id, 'RESOLVED'),
    onSuccess: () => refresh(),
    onError: () => toast.error('ثبت انجام نشد'),
  });

  const calls = callsQuery.data ?? [];
  if (calls.length === 0) return null;

  return (
    <div className="flex gap-2 overflow-x-auto border-b border-caution/30 bg-caution/[0.07] px-4 py-2.5">
      {calls.map((call) => (
        <div
          key={call.id}
          className={cn(
            'flex shrink-0 items-center gap-2.5 rounded-xl border px-3 py-2',
            // A table waiting more than five minutes needs to shout louder.
            call.waitingMinutes >= 5
              ? 'animate-pulse-ring border-critical/50 bg-critical/10'
              : 'border-caution/40 bg-surface',
          )}
        >
          <BellRing
            className={cn(
              'size-4 shrink-0',
              call.waitingMinutes >= 5 ? 'text-critical' : 'text-caution',
            )}
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">
              میز {toPersianDigits(call.tableNumber)}
            </p>
            <p className="text-xs text-ink-muted">
              {WAITER_CALL_REASON_LABELS_FA[call.reason]}
              {' • '}
              {toPersianDigits(call.waitingMinutes)} دقیقه
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="رسیدگی شد"
            onClick={() => resolve.mutate(call.id)}
            disabled={resolve.isPending}
          >
            <Check className="size-4 text-positive" />
          </Button>
        </div>
      ))}
    </div>
  );
}
