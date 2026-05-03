// ════════════════════════════════════════════════════════
//  Chef Santosh — Service Worker
//  Bump CACHE_VERSION whenever you deploy new changes!
// ════════════════════════════════════════════════════════

const CACHE_VERSION = 'chef-santosh-v1';

// Files to cache on install (your core app shell)
const CORE_ASSETS = [
  './index.html',
  './manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
];

// Google Fonts — cached on first use (runtime caching)
const FONT_ORIGINS = [
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com'
];

// ════════════════════════════════════════════════════════
//  INSTALL — pre-cache core assets
// ════════════════════════════════════════════════════════
self.addEventListener('install', event => {
  console.log('[SW] Installing cache:', CACHE_VERSION);
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => {
      return cache.addAll(CORE_ASSETS).then(() => {
        console.log('[SW] Core assets cached ✅');
        return self.skipWaiting(); // Activate immediately
      });
    }).catch(err => console.warn('[SW] Cache addAll failed (some assets may be unavailable):', err))
  );
});

// ════════════════════════════════════════════════════════
//  ACTIVATE — clean up old caches
// ════════════════════════════════════════════════════════
self.addEventListener('activate', event => {
  console.log('[SW] Activating:', CACHE_VERSION);
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_VERSION)
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim()) // Take control immediately
  );
});

// ════════════════════════════════════════════════════════
//  FETCH — serve from cache, fall back to network
// ════════════════════════════════════════════════════════
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests (POST, etc.)
  if (request.method !== 'GET') return;

  // Skip chrome-extension and other non-http requests
  if (!request.url.startsWith('http')) return;

  // ── Strategy: Cache First (for fonts & CDN assets) ──
  const isFontOrCDN =
    FONT_ORIGINS.some(origin => url.origin === new URL(origin).origin) ||
    url.hostname === 'cdnjs.cloudflare.com';

  if (isFontOrCDN) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then(cache => cache.put(request, clone));
          }
          return response;
        });
      }).catch(() => {
        console.warn('[SW] Offline: font/CDN resource unavailable:', request.url);
      })
    );
    return;
  }

  // ── Strategy: Network First, fallback to Cache (for app HTML) ──
  event.respondWith(
    fetch(request)
      .then(response => {
        // Cache fresh response for later offline use
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => {
        // Network failed — serve from cache
        return caches.match(request).then(cached => {
          if (cached) {
            console.log('[SW] Offline: serving from cache:', request.url);
            return cached;
          }
          // Nothing in cache either — return offline page if it's a navigation
          if (request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
      })
  );
});

// ════════════════════════════════════════════════════════
//  MESSAGE — support manual cache refresh from app
// ════════════════════════════════════════════════════════
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
