const VERSION = 'foodos-vnext-2';
const SHELL_CACHE = `${VERSION}-shell`;
const SHELL = ['/', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL)).catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== SHELL_CACHE).map((key) => caches.delete(key)))),
      self.clients.claim(),
    ]),
  );
});

// Conservative offline strategy: cache only same-origin static GET assets.
// Authenticated API responses, admin HTML and payment data are never cached.
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const staticAsset = url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/');
  if (!staticAsset) return;
  event.respondWith(
    caches.match(request).then((hit) => hit || fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    })),
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data?.text() ?? '' }; }
  event.waitUntil(
    self.registration.showNotification(data.title || 'FoodOS', {
      body: data.body || 'اعلان جدید',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag || 'foodos-notification',
      renotify: true,
      silent: false,
      vibrate: [180, 70, 180],
      requireInteraction: data.type === 'WAITER_CALLED' || data.type === 'ORDER_CREATED',
      data: { url: data.url || '/admin', entityId: data.entityId || null, type: data.type || null },
      actions: [
        { action: 'open', title: 'مشاهده' },
        { action: 'dismiss', title: 'بستن' }
      ]
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  const target = new URL(event.notification.data?.url || '/admin', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          if ('navigate' in client) await client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
