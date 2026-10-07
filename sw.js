// Service worker: makes the app work offline after the first visit.
// Strategy: serve from cache instantly, refresh the cache in the background,
// so a new version you upload is picked up on the next launch.
// Bump VERSION if you ever need to force every file to be re-downloaded.

const VERSION = 'caught-up-v3';
const FILES = [
  './',
  'css/app.css',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'index.html',
  'js/app.js',
  'js/backup.js',
  'js/calendar.js',
  'js/data.js',
  'js/seed.js',
  'js/sessions.js',
  'js/store.js',
  'js/ui/chart.js',
  'js/ui/dom.js',
  'js/ui/icons.js',
  'js/ui/log.js',
  'js/ui/session-card.js',
  'js/ui/toast.js',
  'js/views/backups.js',
  'js/views/catchup.js',
  'js/views/editors.js',
  'js/views/settings.js',
  'js/views/setup.js',
  'js/views/stats.js',
  'js/views/terms.js',
  'js/views/today.js',
  'js/views/types.js',
  'js/views/week.js',
  'manifest.webmanifest',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const key = req.mode === 'navigate' ? './' : req;
      const cached = await cache.match(key, { ignoreSearch: true });
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) cache.put(key, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
