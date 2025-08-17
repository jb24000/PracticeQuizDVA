// sw.js - Service Worker for DVA Quiz (Fixed)
const CACHE_NAME = 'dva-quiz-v2'; // Increment version to force update
const RUNTIME_CACHE = 'dva-runtime-v2';

// Only cache truly static assets
const STATIC_ASSETS = [
  './offline.html',
  './manifest.json'
  // Do NOT cache index.html or root path to avoid state issues
];

// Install event - cache only essential static files
self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(STATIC_ASSETS);
      })
      .catch((error) => {
        console.error('Cache installation failed:', error);
      })
  );
  
  // Force the waiting service worker to become active immediately
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Delete old caches
          if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Take control of all pages immediately
      return self.clients.claim();
    })
  );
});

// Fetch event - Network First for HTML, Cache First for assets
self.addEventListener('fetch', (event) => {
  // Skip non-HTTP(S) requests (like chrome-extension://)
  if (!event.request.url.startsWith('http')) {
    return;
  }

  // Parse the request URL
  const requestUrl = new URL(event.request.url);
  
  // Handle navigation requests (HTML pages) - NETWORK FIRST
  if (event.request.mode === 'navigate' || 
      event.request.headers.get('accept')?.includes('text/html') ||
      requestUrl.pathname === '/' || 
      requestUrl.pathname.endsWith('.html')) {
    
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Don't cache HTML to avoid state persistence issues
          return response;
        })
        .catch(error => {
          console.log('Navigation request failed, serving offline page:', error);
          return caches.match('./offline.html');
        })
    );
    return;
  }

  // Handle API requests - NETWORK ONLY (never cache)
  if (requestUrl.pathname.includes('/api/') || 
      requestUrl.pathname.includes('.json') && !requestUrl.pathname.includes('manifest')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Handle static assets (CSS, JS, images) - CACHE FIRST
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }

        // Not in cache, fetch from network
        return fetch(event.request).then(networkResponse => {
          // Check if valid response
          if (!networkResponse || 
              networkResponse.status !== 200 || 
              networkResponse.type !== 'basic') {
            return networkResponse;
          }

          // Cache static assets only (images, fonts, etc.)
          const isStaticAsset = 
            requestUrl.pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/i) ||
            requestUrl.hostname.includes('cdn') ||
            requestUrl.hostname.includes('googleapis') ||
            requestUrl.hostname.includes('cloudflare');

          if (isStaticAsset) {
            const responseToCache = networkResponse.clone();
            caches.open(RUNTIME_CACHE)
              .then(cache => {
                cache.put(event.request, responseToCache)
                  .catch(err => console.log('Cache put failed:', err));
              });
          }

          return networkResponse;
        });
      })
      .catch(error => {
        console.log('Fetch failed:', error);
        
        // Return offline page for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match('./offline.html');
        }
        
        // Return a basic offline response for other requests
        return new Response('Resource not available offline', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: new Headers({
            'Content-Type': 'text/plain'
          })
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
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            console.log('Clearing cache:', cacheName);
            return caches.delete(cacheName);
          })
        );
      }).then(() => {
        // Send a message back to the client
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

console.log('Service Worker v2 loaded successfully');
