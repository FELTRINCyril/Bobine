// Service worker : app dispo hors ligne, cache des images TMDB
const VERSION = 'bobine-v9';
const SHELL = [
  './',
  './index.html',
  './css/app.css',
  './js/app.js',
  './js/api.js',
  './js/db.js',
  './js/ui.js',
  './js/views.js',
  './js/actions.js',
  './js/universes.js',
  './js/version.js',
  './js/i18n.js',
  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== 'tmdb-img').map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Images TMDB : cache d'abord (les affiches ne changent pas)
  if (url.hostname === 'image.tmdb.org') {
    e.respondWith(
      caches.open('tmdb-img').then(async (c) => {
        const hit = await c.match(e.request);
        if (hit) return hit;
        const res = await fetch(e.request);
        if (res.ok) c.put(e.request, res.clone());
        return res;
      })
    );
    return;
  }

  // API TMDB : reseau uniquement (donnees fraiches), pas de cache SW
  if (url.hostname === 'api.themoviedb.org') return;

  // App shell : cache d'abord, reseau en secours
  if (e.request.method === 'GET' && url.origin === location.origin) {
    e.respondWith(
      caches.match(e.request).then((hit) => hit || fetch(e.request))
    );
  }
});
