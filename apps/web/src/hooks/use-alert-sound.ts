'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * A short attention chime, synthesised rather than loaded.
 *
 * No audio file: the Web Audio API produces the tone, so there is no asset to
 * ship, cache or 404, and the sound works offline. Two notes a fifth apart read
 * as "something needs you" without the alarm quality of a single harsh beep.
 *
 * Browsers block audio until the page has been interacted with. The context is
 * therefore created lazily and resumed on the first gesture; until then
 * `play()` is a no-op rather than an error, and the visual notification carries
 * the alert on its own.
 */
export function useAlertSound(enabled = true) {
  const contextRef = useRef<AudioContext | null>(null);
  const lastPlayedAt = useRef(0);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    // Autoplay policy: the context can only start inside a user gesture.
    const unlock = () => {
      if (!contextRef.current) {
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (Ctor) contextRef.current = new Ctor();
      }
      void contextRef.current?.resume();
    };

    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [enabled]);

  return useCallback(() => {
    if (!enabled) return;
    const context = contextRef.current;
    if (!context || context.state !== 'running') return;

    /*
     * Rate limit. Three tables calling at once should sound like one alert,
     * not three overlapping ones - and a reconnect that replays events must
     * not turn into a burst.
     */
    const now = Date.now();
    if (now - lastPlayedAt.current < 1500) return;
    lastPlayedAt.current = now;

    const start = context.currentTime;
    // G5 then D6: a rising fifth, which reads as a summons rather than a fault.
    for (const [index, frequency] of [784, 1175].entries()) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;

      const at = start + index * 0.16;
      // Ramped rather than switched: an abrupt gain change clicks.
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.18, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.32);

      oscillator.connect(gain).connect(context.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.34);
    }
  }, [enabled]);
}

/**
 * Desktop notifications, as progressive enhancement.
 *
 * Permission is never requested on load - that prompt, unasked for, is how
 * people learn to click "block". It is requested the first time staff turn the
 * option on, and everything works without it.
 */
export function useBrowserNotification(enabled: boolean) {
  const granted = useRef(false);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || !('Notification' in window)) {
      return;
    }
    if (Notification.permission === 'granted') {
      granted.current = true;
      return;
    }
    if (Notification.permission === 'default') {
      void Notification.requestPermission().then((result) => {
        granted.current = result === 'granted';
      });
    }
  }, [enabled]);

  return useCallback(
    (title: string, body: string) => {
      if (!enabled || typeof window === 'undefined') return;
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      // Only worth interrupting for when the tab is not the one being watched.
      if (document.visibilityState === 'visible') return;
      try {
        new Notification(title, { body, tag: 'foodos-waiter-call', icon: '/icon.svg' });
      } catch {
        // Some browsers refuse construction outside a service worker; the
        // in-app alert has already fired, so this is genuinely optional.
      }
    },
    [enabled],
  );
}
