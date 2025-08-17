// sw.js - Service Worker for DVA Quiz (Ultra-Fixed v4)
const CACHE_NAME = 'dva-quiz-v4'; // INCREMENT THIS each time you update!
const RUNTIME_CACHE = 'dva-runtime-v4';

// Only cache the absolute minimum
const STATIC_ASSETS = [
  './offline.html'
  // Removed manifest.json - let's be ultra-safe
];

// Install event - cache only offline page
self.addEventListener('install', (event) => {
  console.log('[SW v4] Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW v4] Cache opened');
        return cache.addAll(STATIC_ASSETS);
      })
      .catch((error) => {
        console.error('[SW v4] Cache installation failed:', error);
      })
  );
  
  // Force immediate activation
  self.skipWaiting();
});

// Activate event - aggressively clean ALL old caches
self.addEventListener('activate', (event) => {
  console.log('[SW v4] Activating...');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Delete ALL caches that aren't the current version
          if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
            console.log('[SW v4] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[SW v4] Claiming all clients');
      return self.clients.claim();
    })
  );
});

// Fetch event - Ultra-conservative caching
self.addEventListener('fetch', (event) => {
  // Skip non-HTTP(S) requests
  if (!event.request.url.startsWith('http')) {
    return;
  }

  const requestUrl = new URL(event.request.url);
  
  // CRITICAL: Never cache ANY HTML or the root path
  if (event.request.mode === 'navigate' || 
      event.request.headers.get('accept')?.includes('text/html') ||
      requestUrl.pathname === '/' || 
      requestUrl.pathname === '/index.html' ||
      requestUrl.pathname.endsWith('.html') ||
      requestUrl.pathname === '') {
    
    // ALWAYS fetch fresh HTML from network
    event.respondWith(
      fetch(event.request, {
        cache: 'no-store', // Force no caching
        credentials: 'same-origin'
      })
      .then(response => {
        // Add cache-control headers to prevent browser caching
        const modifiedResponse = new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: new Headers(response.headers)
        });
        
        modifiedResponse.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        modifiedResponse.headers.set('Pragma', 'no-cache');
        modifiedResponse.headers.set('Expires', '0');
        
        return modifiedResponse;
      })
      .catch(error => {
        console.log('[SW v4] Network failed, serving offline page:', error);
        return caches.match('./offline.html');
      })
    );
    return;
  }

  // Never cache JSON or API requests
  if (requestUrl.pathname.includes('/api/') || 
      requestUrl.pathname.endsWith('.json')) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
    );
    return;
  }

  // For static assets, use cache but with version checking
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        // Always fetch in background to check for updates
        const fetchPromise = fetch(event.request).then(networkResponse => {
          // Only cache successful responses
          if (networkResponse && networkResponse.status === 200) {
            // Only cache truly static assets
            const isStaticAsset = 
              requestUrl.pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/i);
            
            // Don't cache JS or CSS to avoid state issues
            if (isStaticAsset) {
              const responseToCache = networkResponse.clone();
              caches.open(RUNTIME_CACHE).then(cache => {
                cache.put(event.request, responseToCache);
              });
            }
          }
          return networkResponse;
        });

        // Return cached version if available, otherwise wait for network
        return cachedResponse || fetchPromise;
      })
      .catch(error => {
        console.log('[SW v4] Both cache and network failed:', error);
        
        if (event.request.mode === 'navigate') {
          return caches.match('./offline.html');
        }
        
        return new Response('Offline', {
          status: 503,
          statusText: 'Service Unavailable'
        });
      })
  );
});

// Handle messages from the client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    console.log('[SW v4] Clearing all caches on request');
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            console.log('[SW v4] Deleting cache:', cacheName);
            return caches.delete(cacheName);
          })
        );
      }).then(() => {
        if (event.ports[0]) {
          event.ports[0].postMessage({ 
            type: 'CACHE_CLEARED', 
            success: true 
          });
        }
      })
    );
  }
});

console.log('[SW v4] Service Worker loaded successfully');

