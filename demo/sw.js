/* HASEEB AUTOS — offline-first service worker (static hosting only)
 * - app shell (index.html + assets) cache-first  → app bina internet ke bhi khulti hai
 * - API calls (google.script.run / API_URL) hamesha network se
 * Naya build? CACHE name badlo → purana cache auto-clear ho jayega.            */
const CACHE = 'haseeb-autos-v2.29.2';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                       // POST/API → network hi
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;             // cross-origin API → network
  if (/\/exec|\/dev|macro|api\?/i.test(url.pathname)) return;

  e.respondWith(
    fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
  );
});
