// Client TMDB - lecture seule. L'acces (cle perso ou proxy) est resolu au
// runtime via config.js : aucun secret n'est ecrit dans ce fichier.
import { getConfig, isV4Token } from './config.js';
import { touch } from './db.js';

const BASE = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p/';

// Cache memoire des reponses TMDB (session). Borne en FIFO pour ne pas croitre
// indefiniment sur une longue session de navigation.
const cache = new Map();
const CACHE_MAX = 300;

// Langue du contenu TMDB (titres, synopsis...), reglable dans les parametres
const LANG_KEY = 'bobine_lang';
export const getLang = () => localStorage.getItem(LANG_KEY) || 'fr-FR';
export function setLang(lang) {
  localStorage.setItem(LANG_KEY, lang);
  touch();
  cache.clear();
}

async function get(path, params = {}) {
  const cfg = getConfig();
  if (!cfg) throw new Error('TMDB non configure');
  const root = cfg.mode === 'proxy' ? cfg.base : BASE;
  const url = new URL(root + path);
  url.searchParams.set('language', getLang());
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  // Cle de cache stable, independante du mode d'auth (et sans y stocker la cle)
  const cacheKey = url.toString();
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  // Mode cle perso : jeton v4 en Bearer, ou cle v3 en query. Mode proxy : le
  // Worker ajoute l'auth cote serveur, rien a faire ici.
  const headers = { accept: 'application/json' };
  if (cfg.mode === 'key') {
    if (isV4Token(cfg.key)) headers.Authorization = `Bearer ${cfg.key}`;
    else url.searchParams.set('api_key', cfg.key);
  }
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`TMDB ${res.status} sur ${path}`);
  const data = await res.json();
  cache.set(cacheKey, data);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return data;
}

export const img = (path, size = 'w342') => (path ? `${IMG}${size}${path}` : null);

export const api = {
  trending: (type, page = 1) => get(`/trending/${type}/week`, { page }),

  discoverMovies: (sort, page = 1) =>
    get('/discover/movie', { sort_by: sort, page, 'vote_count.gte': 100 }),

  discoverTv: (sort, page = 1) =>
    get('/discover/tv', { sort_by: sort, page, 'vote_count.gte': 50 }),

  discoverByGenre: (type, genreId, page = 1, extra = {}) =>
    get(`/discover/${type}`, {
      with_genres: genreId,
      sort_by: 'popularity.desc',
      page,
      ...(type === 'movie' ? { 'vote_count.gte': 80 } : { 'vote_count.gte': 40 }),
      ...extra,
    }),

  discoverProvider: (type, providerId, page = 1) =>
    get(`/discover/${type}`, {
      with_watch_providers: providerId,
      watch_region: 'FR',
      sort_by: 'popularity.desc',
      page,
      ...(type === 'movie' ? { 'vote_count.gte': 80 } : { 'vote_count.gte': 40 }),
    }),

  genreList: (type) => get(`/genre/${type}/list`),

  discoverAnime: (page = 1, sort = 'popularity.desc') =>
    get('/discover/tv', {
      with_genres: 16,
      with_origin_country: 'JP',
      sort_by: sort,
      'vote_count.gte': 100,
      page,
    }),

  discoverAnimeMovies: (page = 1) =>
    get('/discover/movie', {
      with_genres: 16,
      with_origin_country: 'JP',
      sort_by: 'popularity.desc',
      'vote_count.gte': 100,
      page,
    }),

  airingAnime: (page = 1) =>
    get('/discover/tv', {
      with_genres: 16,
      with_origin_country: 'JP',
      sort_by: 'popularity.desc',
      'air_date.gte': new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10),
      'air_date.lte': new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10),
      page,
    }),

  detail: (type, id) =>
    get(`/${type}/${id}`, {
      append_to_response: 'credits,recommendations,keywords,translations,watch/providers',
    }),

  person: (id) => get(`/person/${id}`, { append_to_response: 'combined_credits' }),

  searchPerson: (q) => get('/search/person', { query: q, include_adult: 'false' }),

  searchKeyword: (q) => get('/search/keyword', { query: q }),

  discover: (type, params, page = 1) =>
    get(`/discover/${type}`, { ...params, page }),

  collection: (id) => get(`/collection/${id}`),

  // Films/series d'un univers via mot-cle TMDB (ex: 180547 = MCU).
  // Le filtre vote_count ecarte les courts promo et documentaires confidentiels.
  discoverKeyword: (type, keywordId, page = 1) =>
    get(`/discover/${type}`, {
      with_keywords: keywordId,
      sort_by: type === 'movie' ? 'primary_release_date.asc' : 'first_air_date.asc',
      'vote_count.gte': 30,
      page,
    }),

  keywordMovies: (id, page = 1) =>
    get(`/keyword/${id}/movies`, { page, sort_by: 'release_date.asc' }),

  keywordTv: (id, page = 1) =>
    get(`/keyword/${id}/tv`, { page, sort_by: 'first_air_date.asc' }),

  season: (tvId, num) => get(`/tv/${tvId}/season/${num}`),

  search: (query, page = 1) =>
    get('/search/multi', { query, page, include_adult: 'false' }),
};

// Un media TMDB est-il un anime ? (animation + origine JP)
export function isAnime(media) {
  const genres = media.genre_ids || (media.genres || []).map((g) => g.id);
  const origin = media.origin_country || [];
  const lang = media.original_language;
  return genres.includes(16) && (origin.includes('JP') || lang === 'ja');
}
