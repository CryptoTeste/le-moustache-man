// Le Moustache Man — service worker: shows notifications and opens the app when one is tapped.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data && event.data.text() }; }
  const title = data.title || 'Le Moustache Man';
  const options = {
    body: data.body || '',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: data.tag || undefined,
    renotify: !!data.tag,
    data: { url: data.url || '' }
  };
  event.waitUntil(Promise.all([
    self.registration.showNotification(title, options),
    // A mark on the home-screen icon until the app is opened
    (self.navigator && self.navigator.setAppBadge) ? self.navigator.setAppBadge().catch(() => {}) : Promise.resolve()
  ]));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const hash = (event.notification.data && event.notification.data.url) || '';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if ('focus' in c) {
        try { if (hash) c.postMessage({ type: 'open', hash }); } catch (e) {}
        return c.focus();
      }
    }
    // The app keeps the member's personal code on its own, so the plain address is enough here.
    return self.clients.openWindow(self.registration.scope + hash);
  })());
});
