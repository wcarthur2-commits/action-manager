/* Action Manager service worker.
 * Keep this file at the same URL (./sw.js) forever: old installs find updates by re-fetching it.
 * BUILD is stamped by build.sh; every app file URL carries ?v=BUILD so one version is always served
 * together (no mixing of old/new modules from HTTP or CDN caches).
 * This worker only ever touches Cache Storage entries named with PREFIX. It never touches
 * IndexedDB or localStorage, where the user's items and sync settings live. */
const BUILD = 'v4';
const PREFIX = 'action-manager-';
const CACHE = `${PREFIX}${BUILD}`;
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json?v=v4",
  "./css/app.css?v=v4",
  "./js/app.js?v=v4",
  "./js/b64.js?v=v4",
  "./js/crypto.js?v=v4",
  "./js/db.js?v=v4",
  "./js/defaults.js?v=v4",
  "./js/dom.js?v=v4",
  "./js/errors.js?v=v4",
  "./js/github.js?v=v4",
  "./js/i18n.js?v=v4",
  "./js/ics.js?v=v4",
  "./js/model.js?v=v4",
  "./js/parse.js?v=v4",
  "./js/sync.js?v=v4",
  "./js/synccore.js?v=v4",
  "./js/time.js?v=v4",
  "./js/ui.js?v=v4",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png"
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // cache: 'reload' bypasses the browser HTTP cache so the precache is one consistent version.
    await Promise.all(ASSETS.map(async (url) => {
      const response = await fetch(new Request(url, { cache: 'reload' }));
      if (!response.ok) throw new Error(`precache ${url} ${response.status}`);
      await cache.put(url, response);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  let legacy = false;
  const ready = (async () => {
    const keys = await caches.keys();
    // Caches from v1/v2 (before versioned URLs). Pages still open from those builds may be stuck
    // on a blank screen and have no update listener, so they get reloaded once (below).
    legacy = keys.some((key) => key === `${PREFIX}v2` || key === `${PREFIX}v3`);
    await Promise.all(keys.filter((key) => key.startsWith(PREFIX) && key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })();
  event.waitUntil(ready);
  // Must run after activation finishes: a reload started inside waitUntil would wait on this worker forever.
  ready.then(() => {
    if (!legacy) return;
    setTimeout(async () => {
      const windows = await self.clients.matchAll({ type: 'window' });
      for (const client of windows) if (client.navigate) client.navigate(client.url).catch(() => {});
    }, 50);
  }).catch(() => {});
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(new URL('./', self.location).pathname)) return;
  if (url.pathname.endsWith('/sw.js')) return;
  if (request.mode === 'navigate') {
    event.respondWith(navigation(request));
    return;
  }
  if (/\.(png|ico|svg|webp)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }
  event.respondWith(networkFirst(request));
});

function storable(response) {
  return response && response.ok && response.type === 'basic' && !response.redirected;
}

async function navigation(request) {
  const cache = await caches.open(CACHE);
  try {
    // no-cache: always revalidate with the server (cheap 304), never a stale HTTP-cache copy.
    const response = await fetch(request.url, { cache: 'no-cache', credentials: 'same-origin' });
    if (storable(response)) {
      cache.put('./', response.clone()).catch(() => {});
      return response;
    }
    if (response.ok && response.redirected) {
      // Safari refuses redirected responses for navigations; rebuild a clean one.
      const body = await response.blob();
      return new Response(body, { status: 200, headers: response.headers });
    }
    return response;
  } catch {
    const cached = await cache.match('./') || await cache.match('./index.html')
      || await caches.match('./', { ignoreSearch: true }) || await caches.match('./index.html', { ignoreSearch: true });
    if (cached) return cached;
    return offlinePage();
  }
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request, { cache: 'no-cache' });
    if (storable(response)) cache.put(request, response.clone()).catch(() => {});
    return response;
  } catch (err) {
    const cached = await cache.match(request) || await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (storable(response)) cache.put(request, response.clone()).catch(() => {});
  return response;
}

function offlinePage() {
  const html = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>離線 / Offline</title><body style="font:16px -apple-system,system-ui,sans-serif;padding:24px">'
    + '<h1>離線 / Offline</h1><p>未有快取，請連上網再開。你部機嘅資料冇受影響。</p>'
    + '<p>Nothing cached yet. Connect and reopen. Your data on this device is safe.</p>'
    + '<p><a href="./">重新載入 / Reload</a></p></body>';
  return new Response(html, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
