// Base locale (IndexedDB) - tout reste sur l'appareil.
// Stores : items (films/series suivis), playlists.

const DB_NAME = 'bobine';
const DB_VERSION = 1;

let dbp = null;

function openDb() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('items')) d.createObjectStore('items', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('playlists')) d.createObjectStore('playlists', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function idbAll(store) {
  const d = await openDb();
  return new Promise((resolve, reject) => {
    const req = d.transaction(store).objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(store, value) {
  const d = await openDb();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(store, 'readwrite');
    tx.objectStore(store).put(value);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDel(store, key) {
  const d = await openDb();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

// ---- Etat en memoire (source de verite apres load) ----

export const state = {
  items: new Map(), // id -> item
  playlists: new Map(), // id -> playlist
};

export async function loadState() {
  const [items, playlists] = await Promise.all([idbAll('items'), idbAll('playlists')]);
  for (const it of items) state.items.set(it.id, it);
  for (const pl of playlists) state.playlists.set(pl.id, pl);
}

// ---- Items ----
// item = { id, type: 'movie'|'tv', tmdbId, title, poster, backdrop, year,
//          isAnime, favorite, watchlist, plays, episodes: {'s:e': n},
//          seasonEpisodeTotals: {s: n}, episodeTotal, addedAt, updatedAt }

export const itemId = (type, tmdbId) => `${type}_${tmdbId}`;

export function getItem(type, tmdbId) {
  return state.items.get(itemId(type, tmdbId)) || null;
}

export function ensureItem(meta) {
  const id = itemId(meta.type, meta.tmdbId);
  let it = state.items.get(id);
  if (!it) {
    it = {
      id,
      type: meta.type,
      tmdbId: meta.tmdbId,
      title: meta.title || '',
      poster: meta.poster || null,
      backdrop: meta.backdrop || null,
      year: meta.year || '',
      isAnime: !!meta.isAnime,
      favorite: false,
      watchlist: false,
      plays: 0,
      episodes: {},
      seasonEpisodeTotals: {},
      episodeTotal: 0,
      addedAt: Date.now(),
      updatedAt: Date.now(),
    };
    state.items.set(id, it);
  } else {
    // rafraichit les metadonnees si on en a de plus recentes
    if (meta.title) it.title = meta.title;
    if (meta.poster) it.poster = meta.poster;
    if (meta.backdrop) it.backdrop = meta.backdrop;
    if (meta.year) it.year = meta.year;
    if (meta.isAnime !== undefined) it.isAnime = !!meta.isAnime;
  }
  return it;
}

function inAnyPlaylist(id) {
  for (const pl of state.playlists.values()) {
    if (pl.items.some((x) => x.id === id)) return true;
  }
  return false;
}

function isBlank(it) {
  return (
    !it.favorite &&
    !it.watchlist &&
    it.plays === 0 &&
    Object.keys(it.episodes).length === 0 &&
    !inAnyPlaylist(it.id)
  );
}

export async function saveItem(it) {
  it.updatedAt = Date.now();
  if (isBlank(it)) {
    state.items.delete(it.id);
    await idbDel('items', it.id);
  } else {
    await idbPut('items', it);
  }
}

// ---- Stats derivees ----

export function watchedEpisodeCount(it) {
  return Object.values(it.episodes).filter((n) => n > 0).length;
}

export function totalEpisodePlays(it) {
  return Object.values(it.episodes).reduce((a, b) => a + b, 0);
}

export function tvProgress(it) {
  const watched = watchedEpisodeCount(it);
  const total = it.episodeTotal || 0;
  return { watched, total, ratio: total ? Math.min(1, watched / total) : 0 };
}

export function isSeen(it) {
  if (it.type === 'movie') return it.plays > 0;
  const { watched, total } = tvProgress(it);
  return total > 0 && watched >= total;
}

export function isStarted(it) {
  if (it.type !== 'tv') return false;
  return watchedEpisodeCount(it) > 0;
}

// ---- Temps de visionnage (minutes) ----

export function movieWatchMinutes(it) {
  if (it.type !== 'movie' || !it.plays) return 0;
  const runtime = it.runtime || 100;
  return it.plays * runtime;
}

export function tvWatchMinutes(it) {
  if (it.type !== 'tv') return 0;
  let total = 0;
  for (const [key, plays] of Object.entries(it.episodes || {})) {
    if (plays <= 0) continue;
    const runtime = it.episodeRuntimes?.[key] || it.episodeRuntime || 50;
    total += plays * runtime;
  }
  return total;
}

export function itemWatchMinutes(it) {
  return movieWatchMinutes(it) + tvWatchMinutes(it);
}

export function formatDuration(totalMinutes) {
  if (!totalMinutes) return '0 min';
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const mins = Math.round(totalMinutes % 60);
  const parts = [];
  if (days) parts.push(`${days} j`);
  if (hours) parts.push(`${hours} h`);
  if (mins || !parts.length) parts.push(`${mins} min`);
  return parts.join(' ');
}

export function computeStats() {
  const items = [...state.items.values()];
  const moviesSeen = items.filter((i) => i.type === 'movie' && i.plays > 0);
  const moviePlays = moviesSeen.reduce((a, i) => a + i.plays, 0);
  const tvStarted = items.filter((i) => i.type === 'tv' && watchedEpisodeCount(i) > 0);
  const epsSeen = tvStarted.reduce((a, i) => a + watchedEpisodeCount(i), 0);
  const epPlays = tvStarted.reduce((a, i) => a + totalEpisodePlays(i), 0);
  const favs = items.filter((i) => i.favorite);
  const animes = items.filter((i) => i.isAnime && (i.plays > 0 || watchedEpisodeCount(i) > 0));
  const totalMinutes = items.reduce((a, i) => a + itemWatchMinutes(i), 0);
  const movieMinutes = moviesSeen.reduce((a, i) => a + movieWatchMinutes(i), 0);
  const tvMinutes = tvStarted.reduce((a, i) => a + tvWatchMinutes(i), 0);
  const animeMinutes = animes.reduce((a, i) => a + itemWatchMinutes(i), 0);
  const rewatches = (moviePlays - moviesSeen.length) + (epPlays - epsSeen);
  return {
    moviesSeen, moviePlays, tvStarted, epsSeen, epPlays, favs,
    animes, totalMinutes, movieMinutes, tvMinutes, animeMinutes, rewatches,
  };
}

// ---- Playlists ----
// playlist = { id, name, items: [{id, type, tmdbId, title, poster, year}], createdAt }

export function createPlaylist(name) {
  const pl = {
    id: 'pl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: name.trim(),
    items: [],
    createdAt: Date.now(),
  };
  state.playlists.set(pl.id, pl);
  idbPut('playlists', pl);
  return pl;
}

export async function savePlaylist(pl) {
  await idbPut('playlists', pl);
}

export async function deletePlaylist(id) {
  state.playlists.delete(id);
  await idbDel('playlists', id);
  // purge les items devenus orphelins
  for (const it of [...state.items.values()]) {
    if (isBlank(it)) {
      state.items.delete(it.id);
      await idbDel('items', it.id);
    }
  }
}

// ---- Export / import ----

export function exportJson() {
  return JSON.stringify(
    {
      app: 'bobine',
      version: 1,
      exportedAt: new Date().toISOString(),
      items: [...state.items.values()],
      playlists: [...state.playlists.values()],
    },
    null,
    2
  );
}

export async function importJson(text) {
  const data = JSON.parse(text);
  if (data.app !== 'bobine' || !Array.isArray(data.items)) {
    throw new Error('Fichier non reconnu');
  }
  for (const it of data.items) {
    state.items.set(it.id, it);
    await idbPut('items', it);
  }
  for (const pl of data.playlists || []) {
    state.playlists.set(pl.id, pl);
    await idbPut('playlists', pl);
  }
  return { items: data.items.length, playlists: (data.playlists || []).length };
}
