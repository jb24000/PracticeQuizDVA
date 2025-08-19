// sw.js — PracticeQuizDVA (v1-2025-08-19)
// Network-first for HTML (no stale shells). Cache-first only for truly static assets.

const VERSION = 'v1-2025-08-19';
const STATIC_CACHE  = `pq-dva-static-${VERSION}`;
const RUNTIME_CACHE = `pq-dva-runtime-${VERSION}`;

// We don't precache anything risky. (No addAll that can 404 on GH Pages.)
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k === STATIC_CACHE || k === RUNTIME_CACHE) ? null : caches.delete(k)));
    await self.clients.claim();
  })());
});

function isHTMLRequest(request) {
  return request.mode === 'navigate' ||
         request.headers.get('accept')?.includes('text/html') ||
         /\.html($|\?)/i.test(new URL(request.url).pathname);
}

function isStaticAsset(url) {
  return /\.(png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf|eot)$/i.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (!url.protocol.startsWith('http')) return;

  // Always get fresh HTML/navigations from the network
  if (isHTMLRequest(req)) {
    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .catch(() => new Response(
          '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:system-ui;padding:2rem;text-align:center"><h1>Offline</h1><p>The app will work offline after it has loaded once.</p></body>',
          { headers: { 'Content-Type': 'text/html; charset=UTF-8' } }
        ))
    );
    return;
  }

  // Cache-first for images/fonts/icons
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;
        return fetch(req).then(res => {
          if (res.ok) caches.open(RUNTIME_CACHE).then(c => c.put(req, res.clone()));
          return res;
        });
      })
    );
    return;
  }

  // JS/CSS/JSON/etc → network with fallback to cache
  event.respondWith(
    fetch(req).then(res => res).catch(() => caches.match(req))
  );
});

// Optional: let the page ask us to clear caches
self.addEventListener('message', (event) => {
  if (event.data === 'CLEAR_SW_CACHES') {
    event.waitUntil((async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
      event.source?.postMessage?.('CACHES_CLEARED');
    })());
  }
});
