// Service worker : app dispo hors ligne, cache des images TMDB
const VERSION = 'bobine-v31';
const SHELL = [
  './',
  './index.html',
  './css/app.css',
  './css/desktop.css',
  './js/app.js',
  './js/nav.js',
  './js/deskbar.js',
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

// L'app charge ses modules avec un suffixe de version ('./js/app.js?v=N').
// caches.match compare l'URL complete, query comprise : un pre-cache sans le
// suffixe ne repondait jamais (premier chargement hors ligne casse) et tout
// finissait stocke deux fois. On interroge donc le cache en ignorant la query.
const matchShell = (req) => caches.match(req, { ignoreSearch: true });

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== IMG_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// Le cache d'affiches n'avait aucune borne : chaque poster croise y restait a
// vie. Sur iOS, saturer le quota de l'origine peut faire evincer TOUT le
// stockage du site par Safari, IndexedDB comprise - donc les donnees de
// visionnage. On plafonne, en evacuant les entrees les plus anciennes.
const IMG_CACHE = 'tmdb-img';
const IMG_MAX = 400;
let trimming = false;

async function trimImageCache(cache) {
  if (trimming) return;
  trimming = true;
  try {
    const keys = await cache.keys();
    // keys() rend les entrees dans leur ordre d'insertion : les premieres
    // sont les plus anciennes.
    const excess = keys.length - IMG_MAX;
    for (let i = 0; i < excess; i++) await cache.delete(keys[i]);
  } catch { /* cache indisponible */ }
  finally { trimming = false; }
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Images TMDB : cache d'abord (les affiches ne changent pas)
  if (url.hostname === 'image.tmdb.org') {
    e.respondWith(
      caches.open(IMG_CACHE).then(async (c) => {
        const hit = await c.match(e.request);
        if (hit) return hit;
        const res = await fetch(e.request);
        if (res.ok) {
          await c.put(e.request, res.clone());
          trimImageCache(c);
        }
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

    // Coquille app : reseau d'abord (sans cache HTTP) pour recevoir les MAJ,
    // cache SW en secours hors ligne.
    if (isShell) {
      e.respondWith(
        fetch(e.request, { cache: 'no-store' })
          .then((res) => {
            if (res.ok) {
              caches.open(VERSION).then((c) => c.put(e.request, res.clone()));
            }
            return res;
          })
          .catch(() => matchShell(e.request))
      );
      return;
    }

    e.respondWith(matchShell(e.request).then((hit) => hit || fetch(e.request)));
  }
});
