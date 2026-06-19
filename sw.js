/* Service Worker — Mafasih Allocation PWA
   Caches the app SHELL (html/css/js) so it loads instantly offline.
   Data (GAS API calls) is always fetched live — never cached — so you
   never see stale allocations or reports. */

const CACHE = 'mafasih-shell-v1';
const SHELL = [
  './index.html',
  './styles.css',
  './app.js',
  './config.js',
  './manifest.json'
];

// Install: pre-cache the shell
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

// Activate: drop old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch strategy:
//  - API calls (script.google.com) → always network, never cache
//  - Everything else (the shell) → cache-first, fall back to network
self.addEventListener('fetch', e => {
  const url = e.request.url;
  if (url.includes('script.google.com') || url.includes('script.googleusercontent.com')) {
    // Live data — go to network, no caching
    e.respondWith(fetch(e.request).catch(() => new Response(
      JSON.stringify({ error: 'You appear to be offline.' }),
      { headers: { 'Content-Type': 'application/json' } }
    )));
    return;
  }
  // App shell — cache first
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(resp => {
      // Cache newly fetched shell files
      if (e.request.method === 'GET' && resp.status === 200 && url.startsWith(self.location.origin)) {
        const copy = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return resp;
    }))
  );
});
