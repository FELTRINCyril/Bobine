// Service worker : app dispo hors ligne, cache des images TMDB
const VERSION = 'bobine-v24';
const SHELL = [
  './',
  './index.html',
  './css/app.css',
  './js/app.js',
  './js/api.js',
  './js/anilist.js',
  './js/config.js',
  './js/onboarding.js',
  './js/sync.js',
  './js/cloudConnect.js',
  './js/confirm.js',
  './js/themes.js',
  './js/scrollLoad.js',
  './css/themes.css',
  './js/storage/index.js',
  './js/storage/dropbox.js',
  './js/storage/googledrive.js',
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

self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
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

  // API TMDB / AniList : reseau uniquement
  if (url.hostname === 'api.themoviedb.org' || url.hostname === 'graphql.anilist.co') return;

  if (e.request.method === 'GET' && url.origin === location.origin) {
    const path = url.pathname;
    const isShell = path.endsWith('/') || path.endsWith('.html') || path.endsWith('.js')
      || path.endsWith('.css') || path.endsWith('.webmanifest');

    // Coquille app : reseau d'abord pour recevoir les MAJ, cache en secours hors ligne
    if (isShell) {
      e.respondWith(
        fetch(e.request)
          .then((res) => {
            if (res.ok) {
              caches.open(VERSION).then((c) => c.put(e.request, res.clone()));
            }
            return res;
          })
          .catch(() => caches.match(e.request))
      );
      return;
    }

    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
  }
});
