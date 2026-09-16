// HighFy TV Service Worker
const CACHE_NAME = 'highfy-tv-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/manifest.json',
  '/highfy_clean_badge.png',
  '/highfy_badge_logo.png',
  '/highfy_logo_official.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Cache addAll warning:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip caching for video streams, m3u8, ts, or live APIs
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.includes('.m3u8') ||
    url.pathname.includes('.ts') ||
    url.hostname.includes('aynaott.com') ||
    url.hostname.includes('itcnbd.live') ||
    url.hostname.includes('allsportsapi.com') ||
    event.request.method !== 'GET'
  ) {
    return;
  }

  // Network first with cache fallback for static app assets
  event.respondWith(
    fetch(event.request)
      .then((networkRes) => {
        if (networkRes.status === 200 && event.request.method === 'GET') {
          const resClone = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, resClone);
          });
        }
        return networkRes;
      })
      .catch(() => {
        return caches.match(event.request).then((cached) => {
          return cached || caches.match('/');
        });
      })
  );
});
