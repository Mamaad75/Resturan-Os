'use client';

import { useCallback, useEffect } from 'react';
import { useAuth } from '@/features/auth/auth-context';
import { notificationService } from '@/services';

/**
 * Global PWA + operational push bootstrap.
 *
 * Push is intentionally not exposed as a tenant preference. Once the browser
 * grants notification permission, this device is registered for the signed-in
 * staff member automatically and refreshed again after every sign-in.
 *
 * Browsers do not allow a website to bypass their permission prompt. When the
 * permission is still `default`, we request it on the first real staff gesture
 * (pointer/keyboard), which satisfies browser anti-spam/user-activation rules
 * without adding a second FoodOS toggle/button.
 */
export function PwaBootstrap() {
  const { status, user } = useAuth();

  const ensurePushSubscription = useCallback(async (requestPermission: boolean) => {
    if (
      typeof window === 'undefined' ||
      !('serviceWorker' in navigator) ||
      !('PushManager' in window) ||
      !('Notification' in window)
    ) return;

    try {
      // Permission must be requested before any unrelated await; otherwise the
      // browser may consider the initiating click/keypress user-activation lost.
      let permission = Notification.permission;
      if (permission === 'default' && requestPermission) {
        permission = await Notification.requestPermission();
      }
      if (permission !== 'granted') return;

      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      void registration.update();

      const config = await notificationService.pushConfig();
      if (!config.enabled || !config.publicKey) return;

      let subscription = await registration.pushManager.getSubscription();
      subscription ??= await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToArrayBuffer(config.publicKey),
      });

      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return;

      await notificationService.subscribePush({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        userAgent: navigator.userAgent,
      });
    } catch (error) {
      // Push must never make the main application unusable. Delivery failures
      // remain visible in the server logs; the inbox/realtime path still works.
      console.warn('FoodOS push bootstrap failed', error);
    }
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    void navigator.serviceWorker.register('/sw.js', { scope: '/' }).then((registration) => {
      void registration.update();
    }).catch((error) => {
      console.warn('FoodOS service worker registration failed', error);
    });
  }, []);

  useEffect(() => {
    if (status !== 'authenticated' || !user) return;
    if (!('Notification' in window)) return;

    // Already granted: silently repair/re-register the backend subscription.
    if (Notification.permission === 'granted') {
      void ensurePushSubscription(false);
    }

    // Not decided yet: request at the first browser-legal user activation.
    const activate = () => {
      window.removeEventListener('pointerdown', activate, true);
      window.removeEventListener('keydown', activate, true);
      void ensurePushSubscription(true);
    };

    if (Notification.permission === 'default') {
      window.addEventListener('pointerdown', activate, { once: true, capture: true });
      window.addEventListener('keydown', activate, { once: true, capture: true });
    }

    // If staff changes notification permission in browser/OS settings and
    // returns to FoodOS, repair the subscription without another UI control.
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && Notification.permission === 'granted') {
        void ensurePushSubscription(false);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('pointerdown', activate, true);
      window.removeEventListener('keydown', activate, true);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [status, user?.id, ensurePushSubscription]);

  return null;
}

function urlBase64ToArrayBuffer(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i += 1) bytes[i] = rawData.charCodeAt(i);
  return buffer;
}
