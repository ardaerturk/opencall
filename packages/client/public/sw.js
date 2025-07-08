/**
 * Advanced Service Worker for OpenCall
 * Features: Advanced caching, offline support, background sync, push notifications
 */

const CACHE_VERSION = 'opencall-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;
const MEDIA_CACHE = `${CACHE_VERSION}-media`;
const API_CACHE = `${CACHE_VERSION}-api`;

// Cache configuration
const CACHE_CONFIG = {
  static: {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    maxEntries: 100
  },
  dynamic: {
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    maxEntries: 50
  },
  media: {
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    maxEntries: 20
  },
  api: {
    maxAge: 5 * 60 * 1000, // 5 minutes
    maxEntries: 100
  }
};

// Assets to cache immediately
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/offline.html',
  '/src/main.tsx',
  '/src/App.tsx',
  '/workers/encryptionWorker.js',
  '/workers/mediasoupEncryption.js'
];

// Offline meeting state
const offlineMeetingState = new Map();

// Install event - cache static assets
self.addEventListener('install', event => {
  console.log('Service Worker installing...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        console.log('Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean old caches
self.addEventListener('activate', event => {
  console.log('Service Worker activating...');
  
  event.waitUntil(
    Promise.all([
      // Clean old caches
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(name => name.startsWith('opencall-') && !name.startsWith(CACHE_VERSION))
            .map(name => caches.delete(name))
        );
      }),
      // Take control of all clients
      self.clients.claim()
    ])
  );
});

// Fetch strategies
const strategies = {
  // Cache first, network fallback
  cacheFirst: async (request, cacheName) => {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    
    if (cached) {
      // Update cache in background
      fetch(request)
        .then(response => {
          if (response.status === 200) {
            cache.put(request, response.clone());
          }
        })
        .catch(() => {});
      
      return cached;
    }
    
    try {
      const response = await fetch(request);
      if (response.status === 200) {
        cache.put(request, response.clone());
      }
      return response;
    } catch (error) {
      // Return offline page for navigation requests
      if (request.mode === 'navigate') {
        return cache.match('/offline.html');
      }
      throw error;
    }
  },
  
  // Network first, cache fallback
  networkFirst: async (request, cacheName) => {
    try {
      const response = await fetch(request);
      if (response.status === 200) {
        const cache = await caches.open(cacheName);
        cache.put(request, response.clone());
      }
      return response;
    } catch (error) {
      const cached = await caches.match(request);
      if (cached) return cached;
      
      if (request.mode === 'navigate') {
        return caches.match('/offline.html');
      }
      throw error;
    }
  },
  
  // Stale while revalidate
  staleWhileRevalidate: async (request, cacheName) => {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    
    const fetchPromise = fetch(request)
      .then(response => {
        if (response.status === 200) {
          cache.put(request, response.clone());
        }
        return response;
      })
      .catch(() => cached);
    
    return cached || fetchPromise;
  }
};

// Fetch event handler
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') return;
  
  // Skip chrome-extension and other non-http(s) protocols
  if (!url.protocol.startsWith('http')) return;
  
  // Handle different request types
  if (url.pathname.match(/\.(jpg|jpeg|png|gif|webp|svg|ico)$/i)) {
    // Images - cache first
    event.respondWith(strategies.cacheFirst(request, MEDIA_CACHE));
  } else if (url.pathname.match(/\.(js|css|woff2?)$/i)) {
    // Static assets - cache first
    event.respondWith(strategies.cacheFirst(request, STATIC_CACHE));
  } else if (url.pathname.startsWith('/api/')) {
    // API calls - network first with cache fallback
    event.respondWith(strategies.networkFirst(request, API_CACHE));
  } else if (request.mode === 'navigate') {
    // Navigation - stale while revalidate
    event.respondWith(strategies.staleWhileRevalidate(request, DYNAMIC_CACHE));
  } else {
    // Default - stale while revalidate
    event.respondWith(strategies.staleWhileRevalidate(request, DYNAMIC_CACHE));
  }
});

// Background sync for offline actions
self.addEventListener('sync', event => {
  console.log('Background sync event:', event.tag);
  
  if (event.tag === 'sync-messages') {
    event.waitUntil(syncOfflineMessages());
  } else if (event.tag === 'sync-meeting-state') {
    event.waitUntil(syncMeetingState());
  } else if (event.tag.startsWith('rejoin-meeting-')) {
    const meetingId = event.tag.replace('rejoin-meeting-', '');
    event.waitUntil(rejoinMeeting(meetingId));
  }
});

// Sync offline messages
async function syncOfflineMessages() {
  const db = await openIndexedDB();
  const messages = await getOfflineMessages(db);
  
  for (const message of messages) {
    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message)
      });
      
      if (response.ok) {
        await deleteOfflineMessage(db, message.id);
      }
    } catch (error) {
      console.error('Failed to sync message:', error);
    }
  }
}

// Sync meeting state
async function syncMeetingState() {
  for (const [meetingId, state] of offlineMeetingState) {
    try {
      const response = await fetch(`/api/meetings/${meetingId}/state`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state)
      });
      
      if (response.ok) {
        offlineMeetingState.delete(meetingId);
      }
    } catch (error) {
      console.error('Failed to sync meeting state:', error);
    }
  }
}

// Rejoin meeting after coming online
async function rejoinMeeting(meetingId) {
  const clients = await self.clients.matchAll();
  
  for (const client of clients) {
    client.postMessage({
      type: 'rejoin-meeting',
      meetingId
    });
  }
}

// Push notification handling
self.addEventListener('push', event => {
  const options = {
    body: 'You have a new notification',
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    vibrate: [100, 50, 100],
    data: {},
    actions: []
  };
  
  if (event.data) {
    try {
      const data = event.data.json();
      
      if (data.type === 'meeting-invite') {
        options.body = `You're invited to join: ${data.meetingName}`;
        options.data = { meetingId: data.meetingId };
        options.actions = [
          { action: 'join', title: 'Join Meeting' },
          { action: 'dismiss', title: 'Dismiss' }
        ];
      } else if (data.type === 'chat-message') {
        options.body = `${data.from}: ${data.message}`;
        options.data = { chatId: data.chatId };
        options.actions = [
          { action: 'reply', title: 'Reply' },
          { action: 'view', title: 'View' }
        ];
      }
    } catch (e) {
      options.body = event.data.text();
    }
  }
  
  event.waitUntil(
    self.registration.showNotification('OpenCall', options)
  );
});

// Notification click handling
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  if (event.action === 'join' && event.notification.data.meetingId) {
    event.waitUntil(
      clients.openWindow(`/meeting/${event.notification.data.meetingId}`)
    );
  } else if (event.action === 'view' && event.notification.data.chatId) {
    event.waitUntil(
      clients.openWindow(`/chat/${event.notification.data.chatId}`)
    );
  } else {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

// Message handling from clients
self.addEventListener('message', event => {
  const { type, data } = event.data;
  
  switch (type) {
    case 'save-meeting-state':
      offlineMeetingState.set(data.meetingId, data.state);
      event.ports[0].postMessage({ success: true });
      break;
      
    case 'get-meeting-state':
      const state = offlineMeetingState.get(data.meetingId);
      event.ports[0].postMessage({ state });
      break;
      
    case 'clear-cache':
      clearOldCache().then(() => {
        event.ports[0].postMessage({ success: true });
      });
      break;
      
    case 'cache-assets':
      cacheAssets(data.assets).then(() => {
        event.ports[0].postMessage({ success: true });
      });
      break;
  }
});

// IndexedDB helpers
function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('opencall-offline', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = event => {
      const db = event.target.result;
      
      if (!db.objectStoreNames.contains('messages')) {
        db.createObjectStore('messages', { keyPath: 'id', autoIncrement: true });
      }
      
      if (!db.objectStoreNames.contains('meetings')) {
        db.createObjectStore('meetings', { keyPath: 'id' });
      }
    };
  });
}

async function getOfflineMessages(db) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['messages'], 'readonly');
    const store = transaction.objectStore('messages');
    const request = store.getAll();
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function deleteOfflineMessage(db, id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['messages'], 'readwrite');
    const store = transaction.objectStore('messages');
    const request = store.delete(id);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Cache management
async function clearOldCache() {
  const caches = await self.caches.keys();
  const now = Date.now();
  
  for (const cacheName of caches) {
    const cache = await self.caches.open(cacheName);
    const requests = await cache.keys();
    
    for (const request of requests) {
      const response = await cache.match(request);
      const dateHeader = response.headers.get('sw-cache-date');
      
      if (dateHeader) {
        const cacheTime = parseInt(dateHeader);
        const config = getConfigForCache(cacheName);
        
        if (now - cacheTime > config.maxAge) {
          await cache.delete(request);
        }
      }
    }
  }
}

function getConfigForCache(cacheName) {
  if (cacheName.includes('static')) return CACHE_CONFIG.static;
  if (cacheName.includes('media')) return CACHE_CONFIG.media;
  if (cacheName.includes('api')) return CACHE_CONFIG.api;
  return CACHE_CONFIG.dynamic;
}

async function cacheAssets(assets) {
  const cache = await caches.open(DYNAMIC_CACHE);
  
  for (const asset of assets) {
    try {
      const response = await fetch(asset);
      if (response.ok) {
        // Add cache timestamp
        const headers = new Headers(response.headers);
        headers.set('sw-cache-date', Date.now().toString());
        
        const responseWithHeaders = new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers
        });
        
        await cache.put(asset, responseWithHeaders);
      }
    } catch (error) {
      console.error(`Failed to cache ${asset}:`, error);
    }
  }
}

// Performance monitoring
let performanceObserver;

if ('PerformanceObserver' in self) {
  performanceObserver = new PerformanceObserver(entries => {
    for (const entry of entries.getEntries()) {
      // Send performance data to analytics
      if (entry.entryType === 'resource' && entry.duration > 1000) {
        console.warn('Slow resource:', entry.name, entry.duration);
      }
    }
  });
  
  performanceObserver.observe({ entryTypes: ['resource'] });
}