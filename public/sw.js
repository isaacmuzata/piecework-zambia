// PieceWork Zambia service worker: offline shell for static assets only.
// API responses are NEVER cached — job listings are always fresh from the server.
const CACHE = 'pwz-v6';
// Deploy rule: bump BOTH CACHE and ASSET_V on every frontend deploy.
// The worker only reinstalls when sw.js bytes change, and versioned URLs are
// fresh cache keys — together they guarantee returning visitors (and any
// stale worker / HTTP cache) can never be stuck on a previous deploy's bundle.
const ASSET_V = 'v=6';
const CORE = [
  '/', '/index.html', `/styles.css?${ASSET_V}`, `/app.js?${ASSET_V}`,
  '/manifest.json', '/icon-192.png', '/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // never cache API
  // Stale-while-revalidate: show cached shell instantly, refresh in background.
  e.respondWith(
    caches.match(e.request).then((hit) => {
      const net = fetch(e.request).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
