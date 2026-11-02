// Minimale service worker: maakt de app installeerbaar.
// Pushmeldingen komen hier in fase 2 bij.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
