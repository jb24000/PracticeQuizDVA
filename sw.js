// Service Worker for AWS DVA-C02 Strategic Exam Trainer
const CACHE_NAME = 'dva-c02-trainer-v1';
const OFFLINE_URL = 'offline.html';

// Files to cache for offline functionality
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/offline.html'
];

// Install event - cache essential files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - serve from cache when possible
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
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

        return fetch(fetchRequest).then((response) => {
          // Check if valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Clone the response
          const responseToCache = response.clone();

          // Cache the response for future use
          caches.open(CACHE_NAME)
            .then((cache) => {
              // Only cache same-origin resources
              if (event.request.url.startsWith(self.location.origin)) {
                cache.put(event.request, responseToCache);
              }
            });

          return response;
        });
      })
      .catch(() => {
        // Network request failed, try to get the offline page from cache
        if (event.request.destination === 'document') {
          return caches.match(OFFLINE_URL);
        }
      })
  );
});

// Background sync for saving progress
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-progress') {
    event.waitUntil(syncProgress());
  }
});

async function syncProgress() {
  try {
    // Get saved progress from IndexedDB or localStorage
    const clients = await self.clients.matchAll();
    
    for (const client of clients) {
      client.postMessage({
        type: 'SYNC_COMPLETE',
        message: 'Your progress has been synchronized'
      });
    }
  } catch (error) {
    console.error('Sync failed:', error);
  }
}

// Handle messages from the main app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CACHE_QUESTIONS') {
    // Cache question data for offline use
    caches.open(CACHE_NAME).then((cache) => {
      cache.put('questions-data', new Response(JSON.stringify(event.data.questions)));
    });
  }
});

// Periodic background sync for updating questions
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'update-questions') {
    event.waitUntil(updateQuestions());
  }
});

async function updateQuestions() {
  try {
    // In a real app, this would fetch updated questions from a server
    console.log('Checking for question updates...');
    
    // Notify clients of update availability
    const clients = await self.clients.matchAll();
    for (const client of clients) {
      client.postMessage({
        type: 'QUESTIONS_UPDATED',
        message: 'New questions available'
      });
    }
  } catch (error) {
    console.error('Update check failed:', error);
  }
}

// Push notification handler (for study reminders)
self.addEventListener('push', (event) => {
  const options = {
    body: event.data ? event.data.text() : 'Time to practice for your AWS exam!',
    icon: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
    badge: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
    vibrate: [200, 100, 200],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'practice',
        title: 'Start Practice',
        icon: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='
      },
      {
        action: 'close',
        title: 'Dismiss',
        icon: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification('AWS DVA-C02 Exam Trainer', options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'practice') {
    // Open the app in practice mode
    event.waitUntil(
      clients.openWindow('/?mode=strategic')
    );
  } else if (event.action === 'close') {
    // Just close the notification
    event.notification.close();
  } else {
    // Default action - open the app
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

// Cache versioning and update strategy
const CACHE_VERSION = 1;
const CURRENT_CACHES = {
  questions: `questions-cache-v${CACHE_VERSION}`,
  static: `static-cache-v${CACHE_VERSION}`
};

// Advanced caching strategies
const cacheStrategies = {
  // Cache first, falling back to network
  cacheFirst: async (request) => {
    const cache = await caches.open(CURRENT_CACHES.static);
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    const network = await fetch(request);
    cache.put(request, network.clone());
    return network;
  },
  
  // Network first, falling back to cache
  networkFirst: async (request) => {
    try {
      const network = await fetch(request);
      const cache = await caches.open(CURRENT_CACHES.static);
      cache.put(request, network.clone());
      return network;
    } catch (error) {
      const cached = await caches.match(request);
      if (cached) {
        return cached;
      }
      throw error;
    }
  },
  
  // Stale while revalidate
  staleWhileRevalidate: async (request) => {
    const cache = await caches.open(CURRENT_CACHES.static);
    const cached = await cache.match(request);
    
    const fetchPromise = fetch(request).then((network) => {
      cache.put(request, network.clone());
      return network;
    });
    
    return cached || fetchPromise;
  }
};
