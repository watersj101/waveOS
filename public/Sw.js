// The Service Worker makes the browser recognize this as a PWA
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Simple pass-through for now. 
  // This satisfies the "offline capable" check required for installation.
  event.respondWith(fetch(event.request));
});
