'use client';

import {
  RealtimeEvent,
  WAITER_CALL_REASON_LABELS_FA,
} from '@restaurant-os/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, Check, Hand, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button, useToast } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { useAlertSound, useBrowserNotification } from '@/hooks/use-alert-sound';
import { useRealtime } from '@/hooks/use-realtime';
import { cn } from '@/lib/cn';
import { toPersianDigits } from '@/lib/format';
import { guestService } from '@/services';

/** Remembered per device: a counter tablet and a manager's laptop differ. */
const SOUND_PREFERENCE_KEY = 'foodos.waiterCall.sound';

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

  /*
   * Sound is on by default - an unheard call is the failure this feature
   * exists to prevent - but a manager working beside the counter can mute it,
   * and the choice sticks on that device.
   */
  const [soundOn, setSoundOn] = useState(true);
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SOUND_PREFERENCE_KEY);
      if (stored !== null) setSoundOn(stored === 'true');
    } catch {
      // Private browsing can throw on access; the default stands.
    }
  }, []);

  const playAlert = useAlertSound(soundOn);
  const notify = useBrowserNotification(soundOn);

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
      const call = payload as { tableNumber?: number; reason?: string };
      if (call?.tableNumber != null) {
        const table = `میز ${toPersianDigits(call.tableNumber)}`;
        const reason =
          WAITER_CALL_REASON_LABELS_FA[
            call.reason as keyof typeof WAITER_CALL_REASON_LABELS_FA
          ] ?? 'درخواست خدمات';

        // Three channels, deliberately: the sound reaches someone not looking
        // at the screen, the toast reaches someone who is, and the browser
        // notification reaches someone on another tab. None of them depends on
        // the others working.
        playAlert();
        toast.toast({
          tone: 'warning',
          title: `${table} درخواست دارد`,
          description: reason,
          durationMs: 10_000,
        });
        notify(`${table} گارسون خواست`, reason);
      }
      refresh();
    },
    [refresh, toast, playAlert, notify],
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

  /**
   * Acknowledge is not the same as resolve: it tells the rest of the floor
   * somebody is on their way, without claiming the table has been served.
   */
  const acknowledge = useMutation({
    mutationFn: (id: string) => guestService.updateCall(id, 'ACKNOWLEDGED'),
    onSuccess: () => refresh(),
    onError: () => toast.error('ثبت انجام نشد'),
  });

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    try {
      window.localStorage.setItem(SOUND_PREFERENCE_KEY, String(next));
    } catch {
      // Preference is a convenience; failing to persist it is not an error.
    }
  }

  const calls = callsQuery.data ?? [];
  if (calls.length === 0) return null;

  return (
    <div className="flex items-center gap-2 overflow-x-auto border-b border-caution/30 bg-caution/[0.07] px-4 py-2.5">
      <button
        type="button"
        onClick={toggleSound}
        aria-label={soundOn ? 'قطع صدای هشدار' : 'فعال‌سازی صدای هشدار'}
        title={soundOn ? 'صدای هشدار روشن است' : 'صدای هشدار خاموش است'}
        className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-caution/30 text-caution transition-colors hover:bg-caution/10"
      >
        {soundOn ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
      </button>

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
              {call.status === 'ACKNOWLEDGED' ? ' • در حال رسیدگی' : ''}
            </p>
          </div>
          {call.status === 'OPEN' ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label="در حال رسیدگی"
              title="در حال رسیدگی"
              onClick={() => acknowledge.mutate(call.id)}
              disabled={acknowledge.isPending}
            >
              <Hand className="size-4 text-caution" />
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            aria-label="رسیدگی شد"
            title="رسیدگی شد"
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
