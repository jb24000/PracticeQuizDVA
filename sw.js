// sw.js — DVA Ultra-Fixed v4 (patched)
/*
Fixes:
• Robust HTML detection on subpaths (GitHub Pages, e.g. /YourRepo/).
• Network-first for HTML (fresh shell after each deploy), cache-first for static binaries.
• Safer offline fallback path.
• Navigation Preload for quicker responses.
• CLEAR_CACHE message ACK + clients.claim().
• Never cache JS/CSS/JSON to avoid stale logic.
*/
const CACHE_NAME    = 'dva-quiz-v4p2';   // bump on each deploy
const RUNTIME_CACHE = 'dva-runtime-v4p2';

const OFFLINE_URL = new URL('./offline.html', self.location).toString();

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll([OFFLINE_URL]);
    } catch (e) {
      console.warn('[SW] offline addAll failed:', e);
    }
  })());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    if ('navigationPreload' in self.registration) {
      try { await self.registration.navigationPreload.enable(); } catch {}
    }
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k!==CACHE_NAME && k!==RUNTIME_CACHE) ? caches.delete(k) : Promise.resolve()));
    await self.clients.claim();
  })());
});

function isHTMLRequest(req, url) {
  const accept = req.headers.get('accept') || '';
  const path = url.pathname || '';
  return req.mode === 'navigate' ||
         accept.includes('text/html') ||
         path.endsWith('.html') ||
         path.endsWith('/') ||
         path === '';
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (!url.protocol.startsWith('http')) return;

  // HTML: always network-first (preload if available)
  if (isHTMLRequest(req, url)) {
    event.respondWith((async () => {
      try {
        const preloaded = 'navigationPreload' in event ? await event.preloadResponse : null;
        const fresh = preloaded || await fetch(req, { cache: 'no-store', credentials: 'same-origin' });
        return fresh;
      } catch {
        const cached = await caches.match(OFFLINE_URL);
        return cached || new Response('<h1>Offline</h1>', { headers: { 'Content-Type': 'text/html' } });
      }
    })());
    return;
  }

  // APIs / JSON: never cache
  if (url.pathname.includes('/api/') || url.pathname.endsWith('.json')) {
    event.respondWith(fetch(req, { cache: 'no-store' }));
    return;
  }

  // Static binaries: cache-first with background refresh
  const isStaticBinary = /\.(png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|eot)$/i.test(url.pathname);
  if (!isStaticBinary) {
    // For JS/CSS or other assets, use network (no-store) to avoid stale logic
    event.respondWith(fetch(req, { cache: 'no-store' }).catch(() => caches.match(req)));
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(req);
    const fetchAndCache = fetch(req).then(resp => {
      if (resp && resp.status === 200) {
        caches.open(RUNTIME_CACHE).then(c => c.put(req, resp.clone()));
      }
      return resp;
    }).catch(() => cached);
    return cached || fetchAndCache;
  })());
});

self.addEventListener('message', (event) => {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data.type === 'CLEAR_CACHE') {
    event.waitUntil((async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ type: 'CACHE_CLEARED', success: true });
      }
      await self.clients.claim();
    })());
  }
});
