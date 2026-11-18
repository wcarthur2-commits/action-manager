/* App shell cache. Relative URLs keep scope correct on a subpath such as /action-manager/. */
const CACHE = 'action-manager-v3';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/app.css',
  './js/app.js',
  './js/b64.js',
  './js/errors.js',
  './js/time.js',
  './js/model.js',
  './js/parse.js',
  './js/crypto.js',
  './js/ics.js',
  './js/github.js',
  './js/synccore.js',
  './js/defaults.js',
  './js/i18n.js',
  './js/db.js',
  './js/sync.js',
  './js/dom.js',
  './js/ui.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.method !== 'GET') return;
  event.respondWith(networkFirst(event.request));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const copy = response.clone();
      const cacheRequest = request.mode === 'navigate' ? new Request(request.url) : request;
      cache.put(cacheRequest, copy).catch(() => {});
    }
    return response;
  } catch {
    const cached = await caches.match(request, { ignoreSearch: true })
      || await caches.match(new URL(request.url).pathname, { ignoreSearch: true });
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const fallback = await caches.match('./index.html') || await caches.match('./');
      if (fallback) return fallback;
    }
    return new Response('離線，而且未有快取。', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}
