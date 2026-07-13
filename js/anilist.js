// Client AniList (GraphQL public, sans cle). Utilise pour enrichir les fiches
// anime en mode fusion, y compris avec une cle TMDB perso.
const ANILIST = 'https://graphql.anilist.co';
const cache = new Map();
const CACHE_MAX = 200;

export function clearAnilistCache() {
  cache.clear();
}

async function query(gql, variables) {
  const cacheKey = JSON.stringify({ gql, variables });
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  const res = await fetch(ANILIST, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: gql, variables }),
  });
  if (!res.ok) throw new Error(`AniList ${res.status}`);
  const data = await res.json();
  if (data.errors?.length) throw new Error(data.errors[0]?.message || 'AniList error');
  cache.set(cacheKey, data.data);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return data.data;
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

function tmdbTitle(tmdb, type) {
  return type === 'movie'
    ? (tmdb.title || tmdb.original_title)
    : (tmdb.name || tmdb.original_name);
}

function tmdbYear(tmdb, type) {
  const d = type === 'movie' ? tmdb.release_date : tmdb.first_air_date;
  return d ? parseInt(d.slice(0, 4), 10) : null;
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

async function searchAnilistByTitle(title, type, year) {
  const data = await query(`
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
  const data = await query(`
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

async function searchAnilistPage(q) {
  const data = await query(`
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
  `, { search: q });
  return data.Page?.media || [];
}

// Enrichit une fiche TMDB avec AniList (anime). Echec AniList = fiche TMDB seule.
export async function enrichTmdbDetail(tmdb, type) {
  try {
    const hit = await searchAnilistByTitle(tmdbTitle(tmdb, type), type, tmdbYear(tmdb, type));
    if (!hit) return tmdb;
    const raw = await fetchAnilistMedia(hit.id);
    const anilist = normalizeAnilist(raw);
    const merged = buildMerged(tmdb, anilist, type);
    const out = { ...tmdb };
    if (!out.overview && merged.overview?.value) out.overview = merged.overview.value;
    out._fusion = { merged, anilist, ids: { tmdb: tmdb.id, anilist: anilist?.id || null } };
    return out;
  } catch {
    return tmdb;
  }
}

export async function mergeSearchWithAnilist(tmdbData, q) {
  try {
    const anilistMedia = await searchAnilistPage(q);
    const tmdbResults = (tmdbData.results || []).filter((r) => r.media_type !== 'person');
    const matched = new Set();
    for (const r of tmdbResults) {
      const title = r.title || r.name;
      for (const m of anilistMedia) {
        const at = m.title?.english || m.title?.romaji || m.title?.native;
        if (titlesSimilar(title, at)) matched.add(m.id);
      }
    }
    const results = [...tmdbResults];
    for (const m of anilistMedia) {
      if (matched.has(m.id)) continue;
      results.push({
        source: 'anilist',
        anilistId: m.id,
        title: m.title?.english || m.title?.romaji || m.title?.native,
        poster: m.coverImage?.large || m.coverImage?.medium,
        year: m.seasonYear,
        format: m.format,
        media_type: m.format === 'MOVIE' ? 'movie' : 'tv',
        _anilistOnly: true,
      });
    }
    return { ...tmdbData, results };
  } catch {
    return tmdbData;
  }
}
