// sw.js - Service Worker for DVA Quiz (Corrected)
const CACHE_NAME = 'dva-quiz-v1';

// Only cache files that actually exist in your repository
const urlsToCache = [
  './',                    // Current directory
  './index.html',          // Main page
  './offline.html',        // Offline fallback
  './manifest.json'        // PWA manifest
];

// Install event - cache essential files
self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .catch((error) => {
        console.error('Cache installation failed:', error);
      })
  );
  
  // Force the waiting service worker to become the active service worker
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');
  
  const cacheWhitelist = [CACHE_NAME];
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (!cacheWhitelist.includes(cacheName)) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Claim all clients
      return self.clients.claim();
    })
  );
});

// Fetch event - serve from cache or network
self.addEventListener('fetch', (event) => {
  // Ignore non-HTTP(S) requests (like chrome-extension://, file://, etc.)
  if (!event.request.url.startsWith('http')) {
    return;
  }
  
  // Ignore cross-origin requests except for CDNs
  const requestUrl = new URL(event.request.url);
  const isLocalRequest = requestUrl.origin === location.origin;
  const isCDNRequest = requestUrl.hostname.includes('cdn') || 
                        requestUrl.hostname.includes('googleapis') ||
                        requestUrl.hostname.includes('cloudflare') ||
                        requestUrl.hostname.includes('jsdelivr');
  
  if (!isLocalRequest && !isCDNRequest) {
    // For external non-CDN requests, just fetch without caching
    event.respondWith(fetch(event.request));
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Cache hit - return response
        if (response) {
          return response;
        }
        
        // Clone the request
        const fetchRequest = event.request.clone();
        
        return fetch(fetchRequest)
          .then((response) => {
            // Check if we received a valid response
            if (!response || response.status !== 200 || response.type !== 'basic') {
              // For navigation requests that failed, show offline page
              if (event.request.mode === 'navigate') {
                return caches.match('./offline.html');
              }
              return response;
            }
            
            // Clone the response
            const responseToCache = response.clone();
            
            caches.open(CACHE_NAME)
              .then((cache) => {
                // Only cache HTTP(S) requests and avoid chrome-extension errors
                if (event.request.url.startsWith('http')) {
                  cache.put(event.request, responseToCache)
                    .catch((error) => {
                      // Silently fail if we can't cache (e.g., chrome-extension resources)
                      console.log('Could not cache:', event.request.url);
                    });
                }
              });
            
            return response;
          })
          .catch((error) => {
            console.log('Fetch failed, serving offline page:', error);
            
            // If offline and it's a navigation request, show offline page
            if (event.request.mode === 'navigate') {
              return caches.match('./offline.html');
            }
            
            // For other requests, return a basic offline response
            return new Response('Offline - Content not available', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: new Headers({
                'Content-Type': 'text/plain'
              })
            });
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

console.log('Service Worker loaded successfully');
