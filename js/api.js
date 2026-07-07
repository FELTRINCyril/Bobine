// TMDB API - lecture seule, jeton v4
const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI2Y2ZjMWMxYzE0MWJlZTQ2MzQ4MjViMGJmMGVhYTY2ZCIsIm5iZiI6MTc2NTczMDg1OC40OTgsInN1YiI6IjY5M2VlYTJhYzZlODlkNGJjOTVlMDEwYiIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.q82kBAs_M70_U2hSrd0Z-sNm1jzgNgoVHchhy03DPJ0';
const BASE = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p/';

const cache = new Map();

async function get(path, params = {}) {
  const url = new URL(BASE + path);
  url.searchParams.set('language', 'fr-FR');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const key = url.toString();
  if (cache.has(key)) return cache.get(key);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${TOKEN}`, accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`TMDB ${res.status} sur ${path}`);
  const data = await res.json();
  cache.set(key, data);
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
    get(`/${type}/${id}`, { append_to_response: 'credits,recommendations,keywords' }),

  collection: (id) => get(`/collection/${id}`),

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
