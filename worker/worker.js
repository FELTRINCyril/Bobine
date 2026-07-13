// Cloudflare Worker - proxy TMDB + fusion AniList pour Bobine.
//
// Routes legacy (inchangées) : tout GET hors /bobine/fusion/* → proxy TMDB.
// Routes fusion : /bobine/fusion/detail/:type/:id et /bobine/fusion/search
//
// Secrets Cloudflare : TMDB_TOKEN (v4) ou TMDB_KEY (v3). Pas de secret AniList.

const TMDB = 'https://api.themoviedb.org/3';
const ANILIST = 'https://graphql.anilist.co';

const ALLOWED_ORIGIN = '*';

const CORS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }
    if (request.method !== 'GET') {
      return new Response('Method Not Allowed', { status: 405, headers: CORS });
    }

    const url = new URL(request.url);
    if (url.pathname.startsWith('/bobine/fusion/')) {
      return handleFusion(request, env, url);
    }
    return handleTmdbProxy(request, env, url);
  },
};

function json(data, status = 200, maxAge = 300) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS,
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${maxAge}`,
    },
  });
}

async function handleTmdbProxy(request, env, url) {
  const target = new URL(TMDB + url.pathname + url.search);
  const headers = { accept: 'application/json' };

  if (env.TMDB_TOKEN) {
    headers.Authorization = `Bearer ${env.TMDB_TOKEN}`;
  } else if (env.TMDB_KEY) {
    target.searchParams.set('api_key', env.TMDB_KEY);
  } else {
    return json({ error: 'Worker mal configure : definis TMDB_TOKEN ou TMDB_KEY.' }, 500, 0);
  }

  const res = await fetch(target, { headers });
  const body = await res.text();
  return new Response(body, {
    status: res.status,
    headers: {
      ...CORS,
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300',
    },
  });
}

async function handleFusion(request, env, url) {
  const cached = await caches.default.match(request);
  if (cached) return cached;

  let response;
  if (url.pathname.startsWith('/bobine/fusion/detail/')) {
    response = await fusionDetail(env, url);
  } else if (url.pathname.startsWith('/bobine/fusion/search')) {
    response = await fusionSearch(env, url);
  } else {
    response = json({ error: 'Route fusion inconnue' }, 404, 0);
  }

  if (response.ok) {
    const ttl = url.pathname.includes('/search') ? 900 : 3600;
    const copy = new Response(await response.clone().text(), {
      status: response.status,
      headers: {
        ...CORS,
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${ttl}`,
      },
    });
    await caches.default.put(request, copy);
    return copy;
  }
  return response;
}

async function tmdbFetch(env, path, params = {}) {
  const target = new URL(TMDB + path);
  for (const [k, v] of Object.entries(params)) target.searchParams.set(k, v);
  const headers = { accept: 'application/json' };
  if (env.TMDB_TOKEN) headers.Authorization = `Bearer ${env.TMDB_TOKEN}`;
  else if (env.TMDB_KEY) target.searchParams.set('api_key', env.TMDB_KEY);
  else throw new Error('TMDB non configure');
  const res = await fetch(target, { headers });
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  return res.json();
}

async function anilistQuery(query, variables) {
  const res = await fetch(ANILIST, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`AniList ${res.status}`);
  const data = await res.json();
  if (data.errors?.length) throw new Error(data.errors[0]?.message || 'AniList error');
  return data.data;
}

function isTmdbAnime(tmdb, type) {
  const genres = (tmdb.genres || []).map((g) => g.id);
  const origin = tmdb.origin_country
    || (tmdb.production_countries || []).map((c) => c.iso_3166_1);
  const lang = tmdb.original_language;
  return genres.includes(16) && (origin.includes('JP') || lang === 'ja');
}

function tmdbTitle(tmdb, type) {
  return type === 'movie'
    ? (tmdb.title || tmdb.original_title)
    : (tmdb.name || tmdb.original_name);
}

function tmdbYear(tmdb, type) {
  const d = type === 'movie' ? tmdb.release_date : tmdb.first_air_date;
  return d ? parseInt(d.slice(0, 4), 10) : null;
}

function stripHtml(s) {
  if (!s) return '';
  return s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
}

function normTitle(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function titlesSimilar(a, b) {
  const na = normTitle(a);
  const nb = normTitle(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

async function searchAnilist(title, type, year) {
  const data = await anilistQuery(`
    query ($search: String) {
      Page(page: 1, perPage: 8) {
        media(search: $search, type: ANIME, sort: SEARCH_MATCH, isAdult: false) {
          id
          format
          seasonYear
          title { romaji english native }
        }
      }
    }
  `, { search: title });

  const media = data.Page?.media || [];
  const filtered = media.filter((m) => {
    if (type === 'movie' && m.format !== 'MOVIE') return false;
    if (type === 'tv' && m.format === 'MOVIE') return false;
    if (year && m.seasonYear && Math.abs(m.seasonYear - year) > 1) return false;
    return true;
  });
  return filtered[0] || media[0] || null;
}

async function fetchAnilistMedia(anilistId) {
  const data = await anilistQuery(`
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
        id
        title { romaji english native }
        description(asHtml: false)
        averageScore
        studios(isMain: true) { nodes { name } }
        staff(perPage: 12, sort: RELEVANCE) {
          edges { role nodes { id name { full } image { large } } } }
        }
        externalLinks { site url type }
        format
        episodes
        seasonYear
      }
    }
  `, { id: anilistId });
  return data.Media;
}

function normalizeAnilist(media) {
  if (!media) return null;
  const staff = (media.staff?.edges || [])
    .filter((e) => /Director|Music|Creator|Original/i.test(e.role || ''))
    .map((e) => ({
      id: e.nodes?.id,
      name: e.nodes?.name?.full,
      role: e.role,
      image: e.nodes?.image?.large,
    }));
  return {
    id: media.id,
    title: media.title?.english || media.title?.romaji || media.title?.native,
    description: stripHtml(media.description),
    averageScore: media.averageScore,
    studios: (media.studios?.nodes || []).map((s) => s.name),
    staff,
    streamingLinks: (media.externalLinks || [])
      .filter((l) => l.url)
      .map((l) => ({ site: l.site, url: l.url })),
    episodes: media.episodes,
    format: media.format,
    seasonYear: media.seasonYear,
  };
}

function buildMerged(tmdb, anilist, type) {
  const merged = {};
  if (!tmdb.overview && anilist?.description) {
    merged.overview = { value: anilist.description, from: 'anilist' };
  }
  if (anilist?.studios?.length) {
    merged.studios = { value: anilist.studios, from: 'anilist' };
  }
  if (anilist?.staff?.length) {
    merged.staff = { value: anilist.staff, from: 'anilist' };
  }
  if (anilist?.averageScore) {
    merged.scoreAnilist = { value: anilist.averageScore, from: 'anilist' };
  }
  if (anilist?.streamingLinks?.length) {
    merged.streamingLinks = { value: anilist.streamingLinks, from: 'anilist' };
  }
  if (type === 'tv' && anilist?.episodes && !tmdb.number_of_episodes) {
    merged.episodeCount = { value: anilist.episodes, from: 'anilist' };
  }
  return merged;
}

async function fusionDetail(env, url) {
  const parts = url.pathname.split('/').filter(Boolean);
  const type = parts[3];
  const id = parts[4];
  if (!type || !id || !['movie', 'tv'].includes(type)) {
    return json({ error: 'Type invalide' }, 400, 0);
  }

  const language = url.searchParams.get('language') || 'fr-FR';
  const isAnimeHint = url.searchParams.get('is_anime') === '1';

  try {
    const tmdb = await tmdbFetch(env, `/${type}/${id}`, {
      language,
      append_to_response: 'credits,recommendations,keywords,translations,watch/providers',
    });

    const anime = isAnimeHint || isTmdbAnime(tmdb, type);
    let anilist = null;

    if (anime) {
      const hit = await searchAnilist(tmdbTitle(tmdb, type), type, tmdbYear(tmdb, type));
      if (hit) {
        const raw = await fetchAnilistMedia(hit.id);
        anilist = normalizeAnilist(raw);
      }
    }

    return json({
      source: 'fusion',
      tmdb,
      anilist,
      merged: buildMerged(tmdb, anilist, type),
      ids: { tmdb: Number(id), anilist: anilist?.id || null },
    }, 200, 3600);
  } catch (e) {
    return json({ error: String(e.message || e) }, 502, 0);
  }
}

async function fusionSearch(env, url) {
  const q = (url.searchParams.get('q') || '').trim();
  const page = url.searchParams.get('page') || '1';
  const language = url.searchParams.get('language') || 'fr-FR';
  if (!q) return json({ page: 1, results: [], anilist_only: [] }, 200, 300);

  try {
    const [tmdbData, anilistData] = await Promise.all([
      tmdbFetch(env, '/search/multi', {
        query: q,
        page,
        include_adult: 'false',
        language,
      }),
      anilistQuery(`
        query ($search: String) {
          Page(page: 1, perPage: 10) {
            media(search: $search, type: ANIME, sort: SEARCH_MATCH, isAdult: false) {
              id
              format
              seasonYear
              title { romaji english native }
              coverImage { large medium }
            }
          }
        }
      `, { search: q }),
    ]);

    const tmdbResults = (tmdbData.results || []).filter((r) => r.media_type !== 'person');
    const anilistMedia = anilistData.Page?.media || [];
    const matchedAnilistIds = new Set();

    for (const r of tmdbResults) {
      const title = r.title || r.name;
      for (const m of anilistMedia) {
        const at = m.title?.english || m.title?.romaji || m.title?.native;
        if (titlesSimilar(title, at)) matchedAnilistIds.add(m.id);
      }
    }

    const anilist_only = anilistMedia
      .filter((m) => !matchedAnilistIds.has(m.id))
      .map((m) => ({
        source: 'anilist',
        anilistId: m.id,
        title: m.title?.english || m.title?.romaji || m.title?.native,
        poster: m.coverImage?.large || m.coverImage?.medium,
        year: m.seasonYear,
        format: m.format,
        media_type: m.format === 'MOVIE' ? 'movie' : 'tv',
      }));

    return json({
      page: Number(page),
      total_pages: tmdbData.total_pages,
      results: tmdbResults,
      anilist_only,
    }, 200, 900);
  } catch (e) {
    return json({ error: String(e.message || e) }, 502, 0);
  }
}
