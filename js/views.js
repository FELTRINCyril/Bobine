// Vues / pages de l'app
import { api, img, isAnime, getLang, setLang, clearApiCache } from './api.js';
import { tr, isEn } from './i18n.js';
import { APP_VERSION } from './version.js';
import {
  state, getItem, saveItem, isSeen, isStarted, tvProgress,
  watchedEpisodeCount, totalEpisodePlays, computeStats, formatDuration,
  savePlaylist, deletePlaylist, createPlaylist,
  exportJson, importJson, ensureItem, isBackupHealthy, touch,
} from './db.js';
import { findUniverse } from './universes.js';
import { getConfig, resetConfig, getMetadataMode, setMetadataMode, canUseFusion } from './config.js';
import { SKINS, getSkin, getMode, getSkinInfo, openThemePicker } from './themes.js';
import { openConfirmSheet } from './confirm.js';
import { bindInfiniteScroll } from './scrollLoad.js';
import { disconnect, syncNow, syncStatus, resetAllData } from './sync.js';
import { hasSync } from './storage/index.js';
import { promptCloudConnect, downloadExport } from './cloudConnect.js';
import {
  h, esc, I, posterCard, castCard, crewCard, anilistOnlyCard, openSheet, toast, emptyState, spinner,
  mediaTitle, mediaYear, mediaType, typeLabel, isReleased,
} from './ui.js';
import {
  toggleFavorite, toggleAdd, setMoviePlays, setEpisodePlays,
  markSeason, updateItemTotals, openPlaylistSheet,
  cacheEpisodeRuntimes, syncTvRuntimes,
} from './actions.js';

const $view = () => document.getElementById('view');

const CREW_DEPARTMENTS = [
  { key: 'Directing', label: 'Realisation', jobs: ['Director', 'Co-Director'] },
  { key: 'Writing', label: 'Scenario', jobs: ['Writer', 'Screenplay', 'Story', 'Novel', 'Characters'] },
  { key: 'Production', label: 'Production', jobs: ['Producer', 'Executive Producer', 'Co-Producer'] },
  { key: 'Sound', label: 'Musique', jobs: ['Original Music Composer', 'Music', 'Composer'] },
];

function pickCrew(crew, department, jobs) {
  const seen = new Set();
  return (crew || [])
    .filter((c) => c.department === department && jobs.includes(c.job))
    .filter((c) => !seen.has(c.id) && seen.add(c.id));
}

function metaFrom(media, type) {
  return {
    type,
    tmdbId: media.id,
    title: mediaTitle(media),
    poster: media.poster_path || null,
    backdrop: media.backdrop_path || null,
    year: mediaYear(media),
    isAnime: type === 'tv' || type === 'movie' ? isAnime(media) : false,
  };
}

function pageHead(title, { back = false } = {}) {
  return h(`
    <div class="page-head">
      <div style="display:flex;align-items:center;gap:12px;min-width:0">
        ${back ? `<button class="head-btn" data-nav="back" aria-label="${tr('Retour')}">${I.back}</button>` : ''}
        <h1 class="page-title">${title}</h1>
      </div>
      <div class="head-actions">
        <a class="head-btn" href="#/search" aria-label="${tr('Rechercher')}">${I.search}</a>
      </div>
    </div>
  `);
}

function bindBack(root) {
  root.querySelector('[data-nav="back"]')?.addEventListener('click', () => history.back());
}

function hRow(medias, type, opts = {}) {
  const row = h('<div class="hscroll"><div class="hscroll-inner"></div></div>');
  const inner = row.firstElementChild;
  for (const m of medias) inner.appendChild(posterCard(m, { type, ...opts }));
  return row;
}

function hRowMixed(medias) {
  const row = h('<div class="hscroll"><div class="hscroll-inner"></div></div>');
  const inner = row.firstElementChild;
  for (const m of medias) {
    const t = m.media_type || (m.title ? 'movie' : 'tv');
    inner.appendChild(posterCard(m, { type: t }));
  }
  return row;
}

function section(title, contentEl, linkHash) {
  const s = h(`
    <section class="section">
      <div class="section-head">
        <h2 class="section-title">${title}</h2>
        ${linkHash ? `<a class="section-link" href="${linkHash}">${tr('Tout voir')}</a>` : ''}
      </div>
      <div class="section-pad"></div>
    </section>
  `);
  s.querySelector('.section-pad').appendChild(contentEl);
  return s;
}

const LISTING_PREFIX = 'bobine_lst_';

function stashListing(id, title, type, items) {
  try {
    sessionStorage.setItem(LISTING_PREFIX + id, JSON.stringify({ title, type, items }));
  } catch { /* quota */ }
  return `#/listing/${id}`;
}

function mediaSection(title, medias, mediaType, listingId) {
  if (!medias.length) return null;
  const display = medias.slice(0, 12);
  const link = medias.length > 3
    ? stashListing(listingId, title, mediaType, medias)
    : null;
  const row = mediaType === 'mixed' ? hRowMixed(display) : hRow(display, mediaType);
  return section(title, row, link);
}

// Section de l'accueil chargee en avance de phase pendant le scroll :
// la requete part quand la section approche du viewport (marge 1400px),
// donc le contenu est deja la quand elle devient visible.
function homeFetchSection(body, title, fetcher, type, listingId, { lazy = false } = {}) {
  const holder = h('<div class="row-slot"></div>');
  const sec = section(title, holder, `#/listing/${listingId}`);
  body.appendChild(sec);

  const load = () => {
    holder.appendChild(spinner());
    fetcher()
      .then((data) => {
        const results = (data.results || []).filter((m) => m.media_type !== 'person').slice(0, 20);
        stashListing(listingId, title, type, results);
        holder.innerHTML = '';
        holder.appendChild(hRow(results.slice(0, 10), type));
      })
      .catch(() => {
        holder.innerHTML = '';
        holder.appendChild(emptyState('film', tr('Hors ligne'), tr('Impossible de charger TMDB.')));
      });
  };

  if (!lazy || !('IntersectionObserver' in window)) {
    load();
    return;
  }
  const io = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    io.disconnect();
    load();
  }, { rootMargin: '1400px 0px' });
  io.observe(sec);
}

// Reconstruit un pseudo-media TMDB depuis un item local (pour posterCard)
function mediaFromItem(it) {
  return { id: it.tmdbId, title: it.title, poster_path: it.poster, year: it.year, isAnime: it.isAnime };
}

/* ---- Vue galerie / liste + filtre statut (watchlist, playlists, bibliotheque) ---- */

const VIEWMODE_KEY = 'bobine_viewmode';
const SECTIONS_KEY = 'bobine_sections';
const getViewMode = () => localStorage.getItem(VIEWMODE_KEY) || 'grid';
const getSectionsMode = () => localStorage.getItem(SECTIONS_KEY) !== 'flat';

function viewToggle(onChange) {
  const btn = h('<button class="head-btn" aria-label="Changer de vue"></button>');
  const sync = () => { btn.innerHTML = getViewMode() === 'grid' ? I.rows : I.grid; };
  sync();
  btn.addEventListener('click', () => {
    localStorage.setItem(VIEWMODE_KEY, getViewMode() === 'grid' ? 'list' : 'grid');
    sync();
    onChange();
  });
  return btn;
}

function sectionsToggle(onChange) {
  const btn = h('<button class="head-btn" aria-label="Grouper par statut"></button>');
  const sync = () => {
    const grouped = getSectionsMode();
    btn.innerHTML = grouped ? I.flat : I.sections;
    btn.setAttribute('aria-label', grouped ? tr('Afficher tout') : tr('Grouper par statut'));
  };
  sync();
  btn.addEventListener('click', () => {
    localStorage.setItem(SECTIONS_KEY, getSectionsMode() ? 'flat' : 'sections');
    sync();
    onChange();
  });
  return btn;
}

// Statut de suivi d'un item, facon TV Time
function itemStatus(it) {
  if (!it) return 'todo';
  if (it.type === 'movie') return (it.plays || 0) > 0 ? 'seen' : 'todo';
  if (isSeen(it)) return 'seen';
  if (isStarted(it)) return 'progress';
  return 'todo';
}

// Rendu en sections "En cours / A voir / Vus" avec en-tetes sticky
// (facon TV Time : tout est affiche, groupe par statut, et l'en-tete de la
// section courante reste visible en haut pendant le scroll).
const STATUS_ORDER = [
  ['progress', 'En cours'],
  ['todo', 'A voir'],
  ['seen', 'Vus'],
];

function renderByStatus(holder, entries, statusOf, renderGroup) {
  if (!getSectionsMode()) {
    if (!entries.length) return false;
    holder.appendChild(renderGroup(entries));
    return true;
  }
  let any = false;
  for (const [key, label] of STATUS_ORDER) {
    const group = entries.filter((e) => statusOf(e) === key);
    if (!group.length) continue;
    any = true;
    holder.appendChild(h(`
      <div class="list-section-head">
        <span>${tr(label)}</span>
        <span class="cnt">${group.length}</span>
      </div>
    `));
    holder.appendChild(renderGroup(group));
  }
  return any;
}

/* ============================== ACCUEIL ============================== */

export async function renderHome() {
  const v = $view();
  v.innerHTML = '';
  const page = h('<div class="page page-home"></div>');
  v.appendChild(page);

  // Hero plein ecran (style 5afterdark)
  const heroSlot = h('<div class="cine-hero-slot"></div>');
  heroSlot.appendChild(spinner());
  page.appendChild(heroSlot);

  Promise.all([api.trending('movie'), api.trending('tv')])
    .then(([movies, series]) => {
      const pick = movies.results?.[0] || series.results?.[0];
      if (!pick) { heroSlot.remove(); return; }
      const type = pick.title ? 'movie' : 'tv';
      const backdrop = img(pick.backdrop_path, 'w1280');
      const title = mediaTitle(pick);
      const overview = pick.overview || '';
      const detailHash = `#/detail/${type}/${pick.id}`;
      heroSlot.innerHTML = '';
      heroSlot.appendChild(h(`
        <div class="cine-hero">
          <div class="cine-hero-bg">${backdrop ? `<img src="${backdrop}" alt="" loading="eager">` : ''}</div>
          <div class="cine-hero-shade"></div>
          <div class="cine-hero-top">
            <span class="cine-brand">Bobine<span class="tick">.</span></span>
            <a class="head-btn cine-search" href="#/search" aria-label="${tr('Rechercher')}">${I.search}</a>
          </div>
          <div class="cine-hero-content">
            <h2 class="cine-title">${esc(title)}</h2>
            ${overview ? `<p class="cine-desc">${esc(overview)}</p>` : ''}
            <div class="cine-actions">
              <a class="cine-btn-play" href="${detailHash}">${I.play}<span>${tr('Voir la fiche')}</span></a>
              <a class="cine-btn-info" href="${detailHash}" aria-label="Plus d'infos">${I.info}</a>
            </div>
          </div>
        </div>
      `));
    })
    .catch(() => heroSlot.remove());

  const body = h('<div class="home-body"></div>');
  page.appendChild(body);

  // En cours (series commencees, pas terminees)
  const started = [...state.items.values()]
    .filter((i) => i.type === 'tv' && isStarted(i) && !isSeen(i))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 10);
  if (started.length) {
    const row = h('<div class="hscroll"><div class="hscroll-inner"></div></div>');
    const inner = row.firstElementChild;
    for (const it of started) {
      const p = tvProgress(it);
      const pct = p.total ? Math.round(p.ratio * 100) : 30;
      const src = img(it.backdrop || it.poster, 'w500');
      inner.appendChild(h(`
        <a class="resume-card" href="#/detail/tv/${it.tmdbId}">
          ${src ? `<img class="bg" src="${src}" alt="" loading="lazy">` : '<div class="bg"></div>'}
          <div class="info">
            <div class="t">${esc(it.title)}</div>
            <div class="s">${p.watched} ep.${p.total ? ` ${tr('sur')} ${p.total}` : ''}</div>
            <div class="progress"><i style="width:${pct}%"></i></div>
          </div>
        </a>
      `));
    }
    body.appendChild(section(tr('Reprendre'), row));
  }

  // Watchlist apercu
  const wl = [...state.items.values()]
    .filter((i) => i.watchlist)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 12);
  if (wl.length) {
    const row = hRow([], 'movie');
    for (const it of wl) {
      row.querySelector('.hscroll-inner').appendChild(
        posterCard(mediaFromItem(it), { type: it.type, sub: typeLabel(it.type, it.isAnime), noQuick: true })
      );
    }
    body.appendChild(section(tr('Ma liste'), row, '#/watchlist'));
  }

  // Rangees de contenu : les 2 premieres chargent tout de suite,
  // le reste charge en avance de phase pendant le scroll.
  const slots = [
    ['Tendances films', () => api.trending('movie'), 'movie', 'trend-movies'],
    ['Tendances series', () => api.trending('tv'), 'tv', 'trend-tv'],
    ['Top 10 Netflix - Films', () => api.discoverProvider('movie', 8), 'movie', 'netflix-movies'],
    ['Top 10 Netflix - Series', () => api.discoverProvider('tv', 8), 'tv', 'netflix-tv'],
    ['Populaire sur Disney+', () => api.discoverProvider('movie', 337), 'movie', 'disney-movies'],
    ['Populaire sur Prime Video', () => api.discoverProvider('movie', 119), 'movie', 'prime-movies'],
    ['Populaire sur Apple TV+', () => api.discoverProvider('tv', 350), 'tv', 'apple-tv'],
    ['Animes populaires', () => api.discoverAnime(), 'tv', 'anime-pop'],
    ['Films d\'animation', () => api.discoverAnimeMovies(), 'movie', 'anime-movies'],
    ['Action', () => api.discoverByGenre('movie', 28), 'movie', 'genre-action'],
    ['Comedie', () => api.discoverByGenre('movie', 35), 'movie', 'genre-comedy'],
    ['Science-Fiction', () => api.discoverByGenre('movie', 878), 'movie', 'genre-scifi'],
    ['Horreur', () => api.discoverByGenre('movie', 27), 'movie', 'genre-horror'],
    ['Thriller', () => api.discoverByGenre('movie', 53), 'movie', 'genre-thriller'],
    ['Series comedie', () => api.discoverByGenre('tv', 35), 'tv', 'genre-tv-comedy'],
    ['Series drame', () => api.discoverByGenre('tv', 18), 'tv', 'genre-tv-drama'],
    ['Films les mieux notes', () => api.discoverMovies('vote_average.desc'), 'movie', 'top-movies'],
    ['Series les mieux notees', () => api.discoverTv('vote_average.desc'), 'tv', 'top-tv'],
  ];
  slots.forEach(([title, fetcher, type, listingId], idx) => {
    homeFetchSection(body, tr(title), fetcher, type, listingId, { lazy: idx >= 2 });
  });
}

/* ============================== CATALOGUES ============================== */

const CATALOGS = {
  movies: {
    title: 'Films',
    type: 'movie',
    chips: [
      { key: 'trend', label: 'Tendances', fetch: (p) => api.trending('movie', p) },
      { key: 'pop', label: 'Populaires', fetch: (p) => api.discoverMovies('popularity.desc', p) },
      { key: 'top', label: 'Mieux notes', fetch: (p) => api.discoverMovies('vote_average.desc', p) },
      { key: 'seen', label: 'Vus', local: (i) => i.type === 'movie' && !i.isAnime && isSeen(i) },
      { key: 'fav', label: 'Favoris', local: (i) => i.type === 'movie' && !i.isAnime && i.favorite },
    ],
  },
  series: {
    title: 'Series',
    type: 'tv',
    chips: [
      { key: 'trend', label: 'Tendances', fetch: (p) => api.trending('tv', p) },
      { key: 'pop', label: 'Populaires', fetch: (p) => api.discoverTv('popularity.desc', p) },
      { key: 'top', label: 'Mieux notes', fetch: (p) => api.discoverTv('vote_average.desc', p) },
      { key: 'seen', label: 'Vues', local: (i) => i.type === 'tv' && !i.isAnime && isStarted(i) },
      { key: 'fav', label: 'Favorites', local: (i) => i.type === 'tv' && !i.isAnime && i.favorite },
    ],
  },
  anime: {
    title: 'Animes',
    type: 'tv',
    chips: [
      { key: 'pop', label: 'Populaires', fetch: (p) => api.discoverAnime(p) },
      { key: 'airing', label: 'En diffusion', fetch: (p) => api.airingAnime(p) },
      { key: 'films', label: "Films d'animation", fetch: (p) => api.discoverAnimeMovies(p), type: 'movie' },
      { key: 'seen', label: 'Vus', local: (i) => i.isAnime && (i.type === 'movie' ? isSeen(i) : isStarted(i)) },
      { key: 'fav', label: 'Favoris', local: (i) => i.isAnime && i.favorite },
    ],
  },
};

export async function renderCatalog(name) {
  const cfg = CATALOGS[name];
  const v = $view();
  v.innerHTML = '';
  const page = h('<div class="page"></div>');
  page.appendChild(pageHead(tr(cfg.title)));

  const chipsEl = h('<div class="chips"></div>');
  const grid = h('<div class="grid"></div>');
  const loadStatus = h('<div class="scroll-load-status"></div>');
  const sentinel = h('<div class="scroll-sentinel" aria-hidden="true"></div>');
  loadStatus.appendChild(sentinel);
  page.append(chipsEl, grid, loadStatus);
  v.appendChild(page);

  let current = cfg.chips[0];
  let pageNum = 1;
  let loading = false;
  let heldBack = [];
  let hasMore = true;
  let unbindScroll = null;

  function setLoadIndicator(on) {
    loadStatus.innerHTML = '';
    loadStatus.appendChild(sentinel);
    if (on) loadStatus.appendChild(spinner());
  }

  async function load(reset) {
    if (loading) return;
    loading = true;
    if (reset) {
      grid.innerHTML = '';
      grid.classList.remove('grid--empty');
      pageNum = 1;
      heldBack = [];
      hasMore = true;
      loadStatus.style.display = '';
      unbindScroll?.();
      unbindScroll = bindInfiniteScroll(sentinel, () => {
        if (hasMore && !loading && !current.local) load(false);
      });
    }
    const type = current.type || cfg.type;

    if (current.local) {
      hasMore = false;
      loadStatus.style.display = 'none';
      unbindScroll?.();
      const items = [...state.items.values()]
        .filter(current.local)
        .sort((a, b) => b.updatedAt - a.updatedAt);
      const count = items.length - (items.length % 3);
      if (!count) {
        grid.classList.add('grid--empty');
        grid.appendChild(emptyState('popcorn', tr('Rien ici pour le moment'), tr('Tes ajouts apparaitront ici.')));
      }
      for (const it of items.slice(0, count)) {
        grid.appendChild(posterCard(mediaFromItem(it), { type: it.type, sub: typeLabel(it.type, it.isAnime), noQuick: true }));
      }
      loading = false;
      return;
    }

    setLoadIndicator(true);
    try {
      const data = await current.fetch(pageNum);
      let batch = data.results.filter((m) => m.media_type !== 'person');
      if (heldBack.length) {
        batch = [...heldBack, ...batch];
        heldBack = [];
      }
      const usable = batch.length - (batch.length % 3);
      heldBack = batch.slice(usable);
      batch = batch.slice(0, usable);
      for (const m of batch) {
        grid.appendChild(posterCard(m, { type: m.media_type || type }));
      }
      hasMore = pageNum < data.total_pages;
      loadStatus.style.display = hasMore ? '' : 'none';
      if (!hasMore) unbindScroll?.();
      pageNum++;
    } catch {
      if (!grid.children.length) {
        grid.classList.add('grid--empty');
        grid.appendChild(emptyState('film', tr('Hors ligne'), tr('Impossible de charger TMDB.')));
      }
      hasMore = false;
      loadStatus.style.display = 'none';
      unbindScroll?.();
    }
    setLoadIndicator(false);
    loading = false;
  }

  for (const c of cfg.chips) {
    const chip = h(`<button class="chip ${c === current ? 'on' : ''}">${tr(c.label)}</button>`);
    chip.addEventListener('click', () => {
      current = c;
      chipsEl.querySelectorAll('.chip').forEach((x) => x.classList.remove('on'));
      chip.classList.add('on');
      load(true);
    });
    chipsEl.appendChild(chip);
  }

  unbindScroll = bindInfiniteScroll(sentinel, () => {
    if (hasMore && !loading && !current.local) load(false);
  });
  load(true);
}

/* ============================== DETAIL ============================== */

export async function renderDetail(type, id) {
  const v = $view();
  v.innerHTML = '';
  const page = h('<div class="page"></div>');
  v.appendChild(page);
  page.appendChild(spinner());

  let d;
  try {
    const pre = getItem(type, id);
    d = await api.detail(type, id, { isAnime: pre?.isAnime });
  } catch {
    page.innerHTML = '';
    page.appendChild(pageHead(tr('Oups'), { back: true }));
    page.appendChild(emptyState('film', tr('Contenu indisponible'), tr('Verifie ta connexion et reessaie.')));
    bindBack(page);
    return;
  }

  const meta = metaFrom(d, type);
  page.innerHTML = '';

  // Memorise durees pour les stats (uniquement si le titre est deja suivi)
  const existing = getItem(type, d.id);
  if (existing) {
    if (type === 'movie' && d.runtime) existing.runtime = d.runtime;
    if (type === 'tv' && d.episode_run_time?.length) {
      existing.episodeRuntime = Math.round(
        d.episode_run_time.reduce((a, b) => a + b, 0) / d.episode_run_time.length
      );
    } else if (type === 'tv') {
      existing.episodeRuntime = existing.episodeRuntime || 50;
    }
    meta.episodeRuntime = existing.episodeRuntime;
    await saveItem(existing);
  } else {
    meta.episodeRuntime = type === 'tv' ? 50 : undefined;
    if (type === 'movie' && d.runtime) meta.runtime = d.runtime;
  }

  // Hero
  const backdrop = img(d.backdrop_path, 'w780');
  page.appendChild(h(`
    <div class="detail-hero">
      ${backdrop ? `<img class="backdrop" src="${backdrop}" alt="">` : '<div class="backdrop" style="background:var(--surface-2)"></div>'}
      <div class="shade"></div>
      <button class="head-btn" data-nav="back" aria-label="${tr('Retour')}">${I.back}</button>
    </div>
  `));
  bindBack(page);

  const year = mediaYear(d);
  const runtime = type === 'movie'
    ? (d.runtime ? `${Math.floor(d.runtime / 60)}h${String(d.runtime % 60).padStart(2, '0')}` : '')
    : `${d.number_of_seasons} ${d.number_of_seasons > 1 ? tr('saisons') : tr('saison')} - ${d.number_of_episodes} ep.`;
  const note = d.vote_average ? d.vote_average.toFixed(1) : null;
  const anilistScore = d._fusion?.merged?.scoreAnilist?.value;
  const poster = img(d.poster_path, 'w342');

  // "VF" = fiche traduite en francais chez TMDB (titre/synopsis).
  // TMDB ne connait pas le doublage audio : c'est un indicateur, pas une garantie.
  const hasVF = (d.translations?.translations || []).some(
    (t) => t.iso_639_1 === 'fr' && (t.data?.overview || t.data?.title || t.data?.name)
  );

  page.appendChild(h(`
    <div class="detail-top">
      <div class="poster">${poster ? `<img src="${poster}" alt="">` : `<span class="no-img">${esc(meta.title)}</span>`}</div>
      <div class="detail-id">
        <h1>${esc(meta.title)}</h1>
        <div class="detail-meta">
          ${note ? `<span class="note">&#9733; ${note}</span>` : ''}
          ${anilistScore ? `<span class="note note-anilist" title="${tr('Score AniList')}">AL ${(anilistScore / 10).toFixed(1)}</span>` : ''}
          ${year ? `<span>${year}</span>` : ''}
          ${runtime ? `<span>${runtime}</span>` : ''}
          <span>${typeLabel(type, meta.isAnime)}</span>
          ${hasVF ? '<span class="vf-chip">VF</span>' : ''}
        </div>
      </div>
    </div>
  `));

  if (d.genres?.length) {
    const g = h('<div class="genres"></div>');
    const browseType = meta.isAnime ? 'anime' : type;
    for (const genre of d.genres.slice(0, 4)) {
      g.appendChild(h(`<a class="genre" href="#/browse/${browseType}/${genre.id}">${esc(genre.name)}</a>`));
    }
    page.appendChild(g);
  }

  // Memorise les totaux d'episodes si l'item est suivi
  if (type === 'tv') {
    updateItemTotals(meta, d);
    syncTvRuntimes(meta, d.id);
  }

  const released = type === 'movie' ? isReleased(d) : true;

  // ---- Actions ----
  const actions = h('<div class="detail-actions"></div>');
  page.appendChild(actions);

  const playsBarHolder = h(`<div class="plays-bar-slot${type === 'tv' ? ' plays-bar-slot--tv' : ''}"></div>`);
  page.appendChild(playsBarHolder);

  function renderActions() {
    const it = getItem(type, d.id);
    const seen = it ? isSeen(it) : false;
    const fav = it?.favorite;
    const wl = it?.watchlist;
    actions.innerHTML = '';
    actions.classList.toggle('detail-actions--3', !released);

    const btns = [];

    if (released) {
      const seenBtn = h(`<button class="act ${seen ? 'on-seen' : ''}">${seen ? I.check : I.eye}<span>${seen ? tr('Vu') : tr('Marquer vu')}</span></button>`);
      seenBtn.addEventListener('click', async () => {
        if (type === 'movie') {
          const cur = getItem(type, d.id)?.plays || 0;
          await setMoviePlays(meta, cur > 0 ? 0 : 1);
          toast(cur > 0 ? tr('Marque non vu') : tr('Marque comme vu'));
        } else {
          const target = !seen;
          for (const s of d.seasons || []) {
            if (s.season_number === 0) continue;
            const eps = Array.from({ length: s.episode_count }, (_, i) => i + 1);
            await markSeason(meta, s.season_number, eps, target ? 'all' : 'none');
          }
          updateItemTotals(meta, d);
          await syncTvRuntimes(meta, d.id);
          toast(target ? tr('Serie marquee comme vue') : tr('Serie marquee non vue'));
          renderSeasons();
        }
        renderActions();
        renderPlaysBar();
      });
      btns.push(seenBtn);
    }

    const favBtn = h(`<button class="act ${fav ? 'on-fav' : ''}">${fav ? I.heartFill : I.heart}<span>${tr('Favori')}</span></button>`);
    const addBtn = h(`<button class="act ${wl ? 'on-list' : ''}">${wl ? I.check : I.plus}<span>${wl ? tr('Ajoute') : tr('Ajouter')}</span></button>`);
    const plBtn = h(`<button class="act">${I.list}<span>${tr('Playlist')}</span></button>`);

    favBtn.addEventListener('click', async () => { await toggleFavorite(meta); renderActions(); });
    addBtn.addEventListener('click', async () => { await toggleAdd(meta); renderActions(); });
    plBtn.addEventListener('click', () => openPlaylistSheet(meta));

    btns.push(favBtn, addBtn, plBtn);
    actions.append(...btns);
  }

  function renderPlaysBar() {
    playsBarHolder.innerHTML = '';
    const it = getItem(type, d.id);
    if (type === 'movie') {
      const plays = it?.plays || 0;
      if (!plays) return;
      const bar = h(`
        <div class="plays-bar">
          <span class="lbl">${tr('Visionnages')}</span>
          <div class="stepper">
            <button data-d="-1" aria-label="Moins">&minus;</button>
            <span class="val">${plays}</span>
            <button data-d="1" aria-label="Plus">+</button>
          </div>
        </div>
      `);
      bar.querySelectorAll('button').forEach((b) =>
        b.addEventListener('click', async () => {
          const cur = getItem(type, d.id)?.plays || 0;
          await setMoviePlays(meta, cur + Number(b.dataset.d));
          renderPlaysBar();
          renderActions();
        })
      );
      playsBarHolder.appendChild(bar);
    } else {
      const p = tvProgress(it || { episodes: {}, episodeTotal: 0 });
      const plays = it ? totalEpisodePlays(it) : 0;
      playsBarHolder.appendChild(h(`
        <div class="plays-bar ${plays ? '' : 'plays-bar--empty'}">
          <span class="lbl">${p.watched}${p.total ? '/' + p.total : ''} ep. ${tr('vus')}</span>
          <span class="lbl plays-bar-extra">${plays ? `${plays} ${plays > 1 ? tr('visionnages') : tr('visionnage')}` : '&nbsp;'}</span>
        </div>
      `));
    }
  }

  renderActions();
  renderPlaysBar();

  // ---- Onglets fiche (2-3 pages selon le type) ----
  const isTv = type === 'tv';
  const tabDefs = isTv
    ? [
      { id: 'overview', label: tr('Apercu') },
      { id: 'episodes', label: tr('Episodes') },
      { id: 'more', label: tr('Casting') },
    ]
    : [
      { id: 'overview', label: tr('Apercu') },
      { id: 'more', label: tr('Casting') },
    ];

  const tabBar = h('<div class="detail-tabs" role="tablist"></div>');
  const panelsWrap = h('<div class="detail-panels"></div>');
  const panelOverview = h('<div class="detail-panel" data-panel="overview"></div>');
  const panelEpisodes = isTv ? h('<div class="detail-panel" data-panel="episodes" hidden></div>') : null;
  const panelMore = h('<div class="detail-panel" data-panel="more" hidden></div>');

  let activeTab = tabDefs[0].id;

  function showTab(id) {
    activeTab = id;
    tabBar.querySelectorAll('.detail-tab').forEach((b) => {
      b.classList.toggle('on', b.dataset.tab === id);
      b.setAttribute('aria-selected', b.dataset.tab === id ? 'true' : 'false');
    });
    for (const p of panelsWrap.querySelectorAll('.detail-panel')) {
      p.hidden = p.dataset.panel !== id;
    }
  }

  for (const t of tabDefs) {
    const btn = h(`<button type="button" class="detail-tab${t.id === activeTab ? ' on' : ''}" data-tab="${t.id}" role="tab">${t.label}</button>`);
    btn.setAttribute('aria-selected', t.id === activeTab ? 'true' : 'false');
    btn.addEventListener('click', () => showTab(t.id));
    tabBar.appendChild(btn);
  }
  page.appendChild(tabBar);
  panelsWrap.append(panelOverview);
  if (panelEpisodes) panelsWrap.append(panelEpisodes);
  panelsWrap.append(panelMore);
  page.appendChild(panelsWrap);

  // -- Onglet Apercu : synopsis, plateformes, recommandations --
  if (d.overview) {
    const ov = h(`<p class="overview clamp">${esc(d.overview)}</p>`);
    const moreBtn = h(`<button class="overview-more">${tr('Lire la suite')}</button>`);
    moreBtn.addEventListener('click', () => {
      const clamped = ov.classList.toggle('clamp');
      moreBtn.textContent = clamped ? tr('Lire la suite') : tr('Reduire');
    });
    const s = section(tr('Synopsis'), ov);
    s.querySelector('.section-pad').appendChild(moreBtn);
    panelOverview.appendChild(s);
  }

  const fusion = d._fusion?.merged;
  if (fusion?.studios?.value?.length) {
    const studios = h(`<p class="fusion-line">${esc(fusion.studios.value.join(', '))} <span class="src-chip">${tr('AniList')}</span></p>`);
    panelOverview.appendChild(section(tr('Studios'), studios));
  }

  if (fusion?.staff?.value?.length) {
    const row = h('<div class="hscroll"><div class="hscroll-inner"></div></div>');
    const inner = row.firstElementChild;
    for (const p of fusion.staff.value.slice(0, 12)) inner.appendChild(crewCard(p));
    const head = h(`<div class="section-head-row"><span class="src-chip">${tr('AniList')}</span></div>`);
    const sec = section(tr('Equipe'), row);
    sec.querySelector('.section-pad').prepend(head);
    panelOverview.appendChild(sec);
  }

  const fr = d['watch/providers']?.results?.FR;
  if (fr) {
    const dedup = (arr) => {
      const seen = new Set();
      return (arr || []).filter((p) => !seen.has(p.provider_id) && seen.add(p.provider_id));
    };
    const groups = [
      [tr('Streaming'), dedup([...(fr.flatrate || []), ...(fr.free || []), ...(fr.ads || [])])],
      [tr('Location / Achat'), dedup([...(fr.rent || []), ...(fr.buy || [])])],
    ].filter(([, provs]) => provs.length);

    if (groups.length) {
      const box = h('<div class="providers"></div>');
      for (const [label, provs] of groups) {
        const grp = h(`<div class="prov-group"><div class="prov-label">${label}</div><div class="prov-row"></div></div>`);
        const rowEl = grp.querySelector('.prov-row');
        for (const p of provs.slice(0, 10)) {
          const logo = img(p.logo_path, 'w92');
          rowEl.appendChild(h(`
            <div class="prov">
              ${logo ? `<img src="${logo}" alt="" loading="lazy">` : ''}
              <span>${esc(p.provider_name)}</span>
            </div>
          `));
        }
        box.appendChild(grp);
      }
      box.appendChild(h(`<p class="prov-credit">${tr('Source : JustWatch via TMDB (France)')}</p>`));
      panelOverview.appendChild(section(tr('Ou regarder'), box));
    }
  }

  const alLinks = fusion?.streamingLinks?.value;
  if (alLinks?.length) {
    const box = h('<div class="providers al-links"></div>');
    for (const l of alLinks.slice(0, 8)) {
      if (!l.url) continue;
      box.appendChild(h(`
        <a class="prov al-link" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">
          <span>${esc(l.site || l.url)}</span>
        </a>
      `));
    }
    if (box.children.length) {
      const head = h(`<div class="section-head-row"><span class="src-chip">${tr('AniList')}</span></div>`);
      const sec = section(tr('Streaming AniList'), box);
      sec.querySelector('.section-pad').prepend(head);
      panelOverview.appendChild(sec);
    }
  }

  const recos = (d.recommendations?.results || []).filter((m) => m.media_type !== 'person').slice(0, 20);
  if (recos.length) {
    const sec = mediaSection(tr('Recommandations'), recos, type, `reco-${type}-${id}`);
    if (sec) panelOverview.appendChild(sec);
  }

  // -- Onglet Episodes (series) --
  const seasonsHolder = panelEpisodes || h('<div></div>');

  function renderSeasons() {
    if (!isTv || !panelEpisodes) return;
    seasonsHolder.innerHTML = '';
    const seasonBody = h('<div></div>');
    const wrap = section(tr('Episodes'), seasonBody);
    seasonsHolder.appendChild(wrap);
    for (const s of d.seasons || []) {
      if (s.season_number === 0) continue;
      seasonBody.appendChild(seasonBlock(meta, d, s, () => { renderActions(); renderPlaysBar(); }));
    }
  }
  renderSeasons();

  // -- Onglet Casting : casting + sagas --
  const sagaHolder = h('<div></div>');
  panelMore.appendChild(sagaHolder);
  loadSagaSections(sagaHolder, d, type, id);

  const cast = d.credits?.cast || [];
  if (cast.length) {
    const row = h('<div class="hscroll"><div class="hscroll-inner"></div></div>');
    const inner = row.firstElementChild;
    for (const p of cast.slice(0, 12)) inner.appendChild(castCard(p));
    const link = cast.length > 12
      ? stashListing(`cast-${type}-${id}`, `${tr('Casting')} - ${meta.title}`, 'cast', cast)
      : null;
    panelMore.appendChild(section(tr('Casting'), row, link));
  }

  const crew = d.credits?.crew || [];
  for (const dep of CREW_DEPARTMENTS) {
    const people = pickCrew(crew, dep.key, dep.jobs);
    if (!people.length) continue;
    const row = h('<div class="hscroll"><div class="hscroll-inner"></div></div>');
    const inner = row.firstElementChild;
    for (const p of people.slice(0, 8)) inner.appendChild(crewCard(p));
    const link = people.length > 8
      ? stashListing(`crew-${dep.key}-${type}-${id}`, `${tr(dep.label)} - ${meta.title}`, 'crew', people)
      : null;
    panelMore.appendChild(section(tr(dep.label), row, link));
  }
}

async function loadSagaSections(page, d, type, id) {
  const collectionId = d.belongs_to_collection?.id;
  // keywords : "keywords" pour les films, "results" pour les series
  const keywordIds = (d.keywords?.keywords || d.keywords?.results || []).map((k) => k.id);
  const universe = findUniverse({ type, tmdbId: id, collectionId, keywordIds });
  const seen = new Set();

  function addSection(title, medias, mediaType, listingId) {
    const filtered = medias.filter((m) => {
      const key = `${mediaType || m.media_type || type}_${m.id}`;
      if (seen.has(key) || m.id === id) return false;
      seen.add(key);
      return true;
    });
    if (!filtered.length) return;
    const t = mediaType || type;
    const sec = mediaSection(title, filtered, t, listingId);
    if (sec) page.appendChild(sec);
  }

  if (collectionId) {
    try {
      const col = await api.collection(collectionId);
      const parts = (col.parts || []).sort((a, b) =>
        (a.release_date || '').localeCompare(b.release_date || '')
      );
      addSection(col.name || 'Saga', parts, 'movie', `col-${collectionId}`);
    } catch { /* hors ligne */ }
  }

  if (!universe) return;

  const all = [];

  if (universe.keyword) {
    // Univers par mot-cle : la liste complete vient de TMDB (films + series)
    for (const kType of ['movie', 'tv']) {
      try {
        let pageNum = 1;
        let totalPages = 1;
        while (pageNum <= totalPages && pageNum <= 5) {
          const data = await api.discoverKeyword(kType, universe.keyword, pageNum);
          totalPages = data.total_pages || 1;
          for (const m of data.results || []) all.push({ ...m, media_type: kType });
          pageNum++;
        }
      } catch { /* hors ligne */ }
    }
  } else {
    for (const colId of universe.match?.collections || []) {
      if (colId === collectionId) continue;
      try {
        const col = await api.collection(colId);
        for (const m of col.parts || []) all.push({ ...m, media_type: 'movie' });
      } catch { /* ignore */ }
    }

    for (const tvId of universe.match?.tv || []) {
      if (type === 'tv' && tvId === id) continue;
      try {
        const tv = await api.detail('tv', tvId);
        all.push({ ...tv, media_type: 'tv' });
      } catch { /* ignore */ }
    }
  }

  all.sort((a, b) => {
    const da = a.release_date || a.first_air_date || '';
    const db = b.release_date || b.first_air_date || '';
    return da.localeCompare(db);
  });

  addSection(universe.name, all, 'mixed', `uni-${universe.id}`);
}

function seasonBlock(meta, detail, s, onChange) {
  const it = () => getItem('tv', meta.tmdbId);

  const block = h(`
    <div class="season">
      <div class="season-head">
        <button class="season-toggle" type="button">
          <span class="name">${esc(s.name || tr('Saison') + ' ' + s.season_number)}</span>
          <span class="cnt"></span>
        </button>
        <button class="season-mark" type="button" aria-label="Marquer la saison vue">${I.check}</button>
        <button class="season-toggle chev-btn" type="button" aria-label="Deplier la saison">${I.chevDown}</button>
      </div>
      <div class="season-progress"><i></i></div>
      <div class="season-body" hidden></div>
    </div>
  `);

  const markBtn = block.querySelector('.season-mark');
  const cnt = block.querySelector('.cnt');
  const prog = block.querySelector('.season-progress');
  const body = block.querySelector('.season-body');
  const toggles = block.querySelectorAll('.season-toggle');
  let epList = null; // episodes charges depuis TMDB

  function seasonStats() {
    const item = it();
    let watched = 0;
    if (item) {
      for (const [k, n] of Object.entries(item.episodes)) {
        if (k.startsWith(s.season_number + ':') && n > 0) watched++;
      }
    }
    return { watched, total: s.episode_count || 0 };
  }

  function refreshHead() {
    const { watched, total } = seasonStats();
    cnt.textContent = total ? `${watched}/${total}` : `${watched}`;
    const pct = total ? Math.round((watched / total) * 100) : 0;
    prog.querySelector('i').style.width = pct + '%';
    prog.classList.toggle('done', total > 0 && watched >= total);
    markBtn.classList.toggle('on', total > 0 && watched >= total);
    onChange?.();
  }
  refreshHead();

  markBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const { watched, total } = seasonStats();
    const allSeen = total > 0 && watched >= total;
    const nums = Array.from({ length: s.episode_count }, (_, i) => i + 1);
    if (allSeen) {
      await markSeason(meta, s.season_number, nums, 'none');
      toast(tr('Saison marquee non vue'));
    } else {
      await markSeason(meta, s.season_number, nums, 'all');
      updateItemTotals(meta, detail);
      try {
        const data = await api.season(meta.tmdbId, s.season_number);
        cacheEpisodeRuntimes(meta, s.season_number, data.episodes || []);
      } catch { /* hors ligne */ }
      toast('Saison marquee vue');
    }
    if (epList) {
      body.querySelectorAll('.ep').forEach((el) => el.remove());
      for (const ep of epList) body.appendChild(epRow(ep));
    }
    refreshHead();
  });

  function epRow(ep) {
    const key = `${s.season_number}:${ep.episode_number}`;
    const plays = () => it()?.episodes[key] || 0;

    const row = h(`
      <div class="ep">
        <span class="num">${ep.episode_number}</span>
        <div class="ep-t">
          <div class="n">${esc(ep.name || tr('Episode') + ' ' + ep.episode_number)}</div>
          ${ep.air_date ? `<div class="d">${ep.air_date.split('-').reverse().join('/')}</div>` : ''}
        </div>
        <button class="ep-plays" hidden aria-label="Ajouter un visionnage"></button>
        <button class="ep-check" aria-label="Marquer vu">${I.check}</button>
      </div>
    `);
    const check = row.querySelector('.ep-check');
    const playsBtn = row.querySelector('.ep-plays');

    const refresh = () => {
      const n = plays();
      check.classList.toggle('on', n > 0);
      playsBtn.hidden = n === 0;
      playsBtn.textContent = `x${n} +`;
    };
    refresh();

    check.addEventListener('click', async () => {
      await setEpisodePlays(meta, s.season_number, ep.episode_number, plays() > 0 ? 0 : 1);
      if (ep.runtime) cacheEpisodeRuntimes(meta, s.season_number, [ep]);
      updateItemTotals(meta, detail);
      refresh();
      refreshHead();
    });
    playsBtn.addEventListener('click', async () => {
      await setEpisodePlays(meta, s.season_number, ep.episode_number, plays() + 1);
      if (ep.runtime) cacheEpisodeRuntimes(meta, s.season_number, [ep]);
      refresh();
      refreshHead();
    });
    return row;
  }

  async function openBody() {
    body.hidden = false;
    block.classList.add('open');
    if (epList) return;
    const sp = spinner();
    body.appendChild(sp);
    try {
      const data = await api.season(meta.tmdbId, s.season_number);
      epList = data.episodes || [];
      cacheEpisodeRuntimes(meta, s.season_number, epList);
    } catch {
      sp.remove();
      body.appendChild(h('<p style="padding:12px 14px;color:var(--text-muted);font-size:13px">' + tr('Episodes indisponibles hors ligne.') + '</p>'));
      return;
    }
    sp.remove();

    const tools = h(`
      <div class="season-tools">
        <button class="mini-btn seen">${tr('Tout marquer vu')}</button>
        <button class="mini-btn seen">${tr('+1 revisionnage')}</button>
        <button class="mini-btn">${tr('Tout effacer')}</button>
      </div>
    `);
    const [allBtn, reBtn, noneBtn] = tools.querySelectorAll('button');
    const nums = () => epList.map((e) => e.episode_number);
    const redraw = () => {
      body.querySelectorAll('.ep').forEach((e) => e.remove());
      for (const ep of epList) body.appendChild(epRow(ep));
      refreshHead();
    };
    allBtn.addEventListener('click', async () => { await markSeason(meta, s.season_number, nums(), 'all'); updateItemTotals(meta, detail); redraw(); toast('Saison marquee vue'); });
    reBtn.addEventListener('click', async () => { await markSeason(meta, s.season_number, nums(), 'rewatch'); updateItemTotals(meta, detail); redraw(); toast(tr('+1 visionnage sur la saison')); });
    noneBtn.addEventListener('click', async () => { await markSeason(meta, s.season_number, nums(), 'none'); redraw(); });
    body.appendChild(tools);

    for (const ep of epList) body.appendChild(epRow(ep));
  }

  toggles.forEach((btn) => btn.addEventListener('click', () => {
    if (body.hidden) openBody();
    else {
      body.hidden = true;
      block.classList.remove('open');
    }
  }));

  return block;
}

/* ============================== WATCHLIST ============================== */

export function renderWatchlist() {
  const v = $view();
  v.innerHTML = '';
  const page = h('<div class="page"></div>');
  page.appendChild(pageHead(tr('Ma liste'), { back: true }));
  bindBack(page);
  v.appendChild(page);

  const typeChips = h(`
    <div class="chips">
      <button class="chip on" data-f="all">${tr('Tout')}</button>
      <button class="chip" data-f="movie">${tr('Films')}</button>
      <button class="chip" data-f="tv">${tr('Series')}</button>
      <button class="chip" data-f="anime">${tr('Animes')}</button>
    </div>
  `);
  const holder = h('<div></div>');

  let filter = 'all';

  function renderGroup(items) {
    if (getViewMode() === 'grid') {
      const grid = h('<div class="grid"></div>');
      for (const it of items) {
        grid.appendChild(posterCard(mediaFromItem(it), {
          type: it.type,
          isAnime: it.isAnime,
          noQuick: true,
          sub: [typeLabel(it.type, it.isAnime), it.year].filter(Boolean).join(' - '),
        }));
      }
      return grid;
    }
    const list = h('<div class="media-list"></div>');
    for (const it of items) {
      list.appendChild(mediaListRow(it, {
        btnIcon: I.x,
        onBtn: async () => {
          it.watchlist = false;
          await saveItem(it);
          toast(tr('Retire de la watchlist'));
          draw();
        },
      }));
    }
    return list;
  }

  function draw() {
    holder.innerHTML = '';
    let items = [...state.items.values()].filter((i) => i.watchlist);
    if (filter === 'movie') items = items.filter((i) => i.type === 'movie' && !i.isAnime);
    if (filter === 'tv') items = items.filter((i) => i.type === 'tv' && !i.isAnime);
    if (filter === 'anime') items = items.filter((i) => i.isAnime);
    items.sort((a, b) => b.updatedAt - a.updatedAt);

    const any = renderByStatus(holder, items, itemStatus, renderGroup);
    if (!any) {
      holder.appendChild(emptyState('bookmark', tr('Liste vide'), tr('Ajoute des titres avec le bouton + sur les affiches.')));
    }
  }

  const actions = page.querySelector('.head-actions');
  actions.prepend(viewToggle(draw));
  actions.prepend(sectionsToggle(draw));
  page.append(typeChips, holder);

  typeChips.querySelectorAll('.chip').forEach((c) =>
    c.addEventListener('click', () => {
      filter = c.dataset.f;
      typeChips.querySelectorAll('.chip').forEach((x) => x.classList.remove('on'));
      c.classList.add('on');
      draw();
    })
  );
  draw();
}

function mediaListRow(it, { btnIcon, onBtn, sub } = {}) {
  const src = img(it.poster, 'w185');
  const row = h(`
    <div class="media-row">
      <a class="poster" href="#/detail/${it.type}/${it.tmdbId}">
        ${src ? `<img src="${src}" alt="" loading="lazy">` : `<span class="no-img">${esc(it.title)}</span>`}
      </a>
      <a class="inf" href="#/detail/${it.type}/${it.tmdbId}">
        <div class="t">${esc(it.title)}</div>
        <div class="s">${esc(sub ?? [typeLabel(it.type, it.isAnime), it.year].filter(Boolean).join(' - '))}</div>
      </a>
      ${btnIcon ? `<button class="row-btn" aria-label="Retirer">${btnIcon}</button>` : ''}
    </div>
  `);
  if (onBtn) row.querySelector('.row-btn').addEventListener('click', onBtn);
  return row;
}

/* ============================== PLAYLISTS ============================== */

export function renderPlaylists() {
  const v = $view();
  v.innerHTML = '';
  const page = h('<div class="page"></div>');
  page.appendChild(pageHead(tr('Playlists'), { back: true }));
  bindBack(page);
  v.appendChild(page);

  const list = h('<div class="media-list" style="margin-top:8px"></div>');
  page.appendChild(list);

  function draw() {
    list.innerHTML = '';
    const pls = [...state.playlists.values()].sort((a, b) => a.createdAt - b.createdAt);
    if (!pls.length) {
      list.appendChild(emptyState('list', tr('Aucune playlist'), tr('Cree des collections : "A voir en famille", "Halloween"...')));
    }
    for (const pl of pls) {
      const covers = pl.items.slice(0, 3).map((x) => {
        const src = img(x.poster, 'w185');
        return src ? `<img src="${src}" alt="">` : '<span class="ph"></span>';
      }).join('') || '<span class="ph"></span>';
      const card = h(`
        <a class="pl-card" href="#/playlist/${pl.id}">
          <span class="pl-stack">${covers}</span>
          <span style="flex:1;min-width:0">
            <span class="t" style="display:block">${esc(pl.name)}</span>
            <span class="s" style="display:block">${pl.items.length} ${pl.items.length > 1 ? tr('titres') : tr('titre')}</span>
          </span>
          <span style="color:var(--text-faint)">${I.chevRight}</span>
        </a>
      `);
      list.appendChild(card);
    }
    const add = h(`<button class="btn ghost" style="margin:14px 18px 0;width:calc(100% - 36px)">${tr('Nouvelle playlist')}</button>`);
    add.addEventListener('click', () => {
      const box = h(`<div><h3>${tr('Nouvelle playlist')}</h3></div>`);
      const input = h(`<input class="sheet-input" placeholder="${tr('Nom de la playlist')}">`);
      const ok = h(`<button class="btn">${tr('Creer')}</button>`);
      box.append(input, ok);
      const close = openSheet(box);
      input.focus();
      const create = () => {
        if (!input.value.trim()) return;
        createPlaylist(input.value);
        close();
        draw();
      };
      ok.addEventListener('click', create);
      input.addEventListener('keydown', (e) => e.key === 'Enter' && create());
    });
    list.appendChild(add);
  }
  draw();
}

export function renderPlaylist(id) {
  const pl = state.playlists.get(id);
  const v = $view();
  v.innerHTML = '';
  const page = h('<div class="page"></div>');
  v.appendChild(page);

  if (!pl) {
    page.appendChild(pageHead(tr('Playlist'), { back: true }));
    bindBack(page);
    page.appendChild(emptyState('list', tr('Playlist introuvable')));
    return;
  }

  const head = h(`
    <div class="page-head">
      <div style="display:flex;align-items:center;gap:12px;min-width:0">
        <button class="head-btn" data-nav="back" aria-label="${tr('Retour')}">${I.back}</button>
        <h1 class="page-title" style="font-size:24px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(pl.name)}</h1>
      </div>
      <div class="head-actions">
        <button class="head-btn" data-act="menu" aria-label="${tr('Options')}">${I.edit}</button>
      </div>
    </div>
  `);
  page.appendChild(head);
  bindBack(page);
  head.querySelector('.head-actions').prepend(viewToggle(() => draw()));
  head.querySelector('.head-actions').prepend(sectionsToggle(() => draw()));

  head.querySelector('[data-act="menu"]').addEventListener('click', () => {
    const box = h(`<div><h3>${esc(pl.name)}</h3></div>`);
    const rename = h(`<button class="sheet-opt">${I.edit}<span>${tr('Renommer')}</span></button>`);
    const del = h(`<button class="sheet-opt accent">${I.trash}<span>${tr('Supprimer la playlist')}</span></button>`);
    box.append(rename, del);
    const close = openSheet(box);
    rename.addEventListener('click', () => {
      const input = h(`<input class="sheet-input" value="${esc(pl.name)}">`);
      const ok = h(`<button class="btn">${tr('Renommer')}</button>`);
      box.append(input, ok);
      input.focus();
      ok.addEventListener('click', async () => {
        if (!input.value.trim()) return;
        pl.name = input.value.trim();
        await savePlaylist(pl);
        close();
        renderPlaylist(id);
      });
    });
    del.addEventListener('click', async () => {
      if (!confirm(`${tr('Supprimer')} "${pl.name}" ?`)) return;
      await deletePlaylist(id);
      close();
      toast(tr('Playlist supprimee'));
      location.hash = '#/playlists';
    });
  });

  const holder = h('<div></div>');
  page.appendChild(holder);

  function renderGroup(entries) {
    if (getViewMode() === 'grid') {
      const grid = h('<div class="grid"></div>');
      for (const entry of entries) {
        const it = state.items.get(entry.id);
        grid.appendChild(posterCard(
          { id: entry.tmdbId, title: entry.title, poster_path: entry.poster, year: entry.year, isAnime: it?.isAnime },
          { type: entry.type, noQuick: true, sub: [typeLabel(entry.type, it?.isAnime), entry.year].filter(Boolean).join(' - ') }
        ));
      }
      return grid;
    }
    const list = h('<div class="media-list"></div>');
    for (const entry of entries) {
      const it = state.items.get(entry.id) || entry;
      list.appendChild(mediaListRow({ ...entry, isAnime: it.isAnime }, {
        btnIcon: I.x,
        onBtn: async () => {
          pl.items = pl.items.filter((x) => x.id !== entry.id);
          await savePlaylist(pl);
          toast(tr('Retire de la playlist'));
          draw();
        },
      }));
    }
    return list;
  }

  function draw() {
    holder.innerHTML = '';
    const any = renderByStatus(holder, pl.items, (e) => itemStatus(state.items.get(e.id)), renderGroup);
    if (!any) {
      holder.appendChild(emptyState('list', tr('Playlist vide'), tr('Ajoute des titres depuis leur fiche.')));
    }
  }
  draw();
}

/* ============================== PROFIL ============================== */

export function renderProfile() {
  const v = $view();
  v.innerHTML = '';
  const page = h('<div class="page"></div>');
  page.appendChild(pageHead(tr('Profil')));
  v.appendChild(page);

  const s = computeStats();

  const statsEl = h(`
    <div class="stats-grid">
      <a class="stat hl" href="#/library/movies-seen"><div class="v">${s.moviesSeen.length}</div><div class="l">${tr('Films vus')}</div></a>
      <a class="stat hl" href="#/library/series-followed"><div class="v">${s.tvStarted.length}</div><div class="l">${tr('Series suivies')}</div></a>
      <a class="stat gr" href="#/stats"><div class="v">${s.epsSeen}</div><div class="l">${tr('Episodes vus')}</div></a>
      <a class="stat gr" href="#/stats"><div class="v">${s.rewatches}</div><div class="l">${tr('Revisionnages')}</div></a>
      <a class="stat" href="#/library/favorites"><div class="v">${s.favs.length}</div><div class="l">${tr('Favoris')}</div></a>
      <a class="stat" href="#/playlists"><div class="v">${state.playlists.size}</div><div class="l">${tr('Playlists')}</div></a>
    </div>
  `);
  page.appendChild(statsEl);

  const settings = h('<div class="settings-list"></div>');
  page.appendChild(settings);

  const links = [
    ['bookmark', tr('Ma liste'), () => (location.hash = '#/watchlist')],
    ['list', tr('Mes playlists'), () => (location.hash = '#/playlists')],
    ['popcorn', tr('Mes statistiques'), () => (location.hash = '#/stats')],
    ['settings', tr('Parametres'), () => (location.hash = '#/settings')],
    ['download', tr('Exporter mes donnees (JSON)'), doExport],
    ['upload', tr('Importer une sauvegarde'), doImport],
  ];
  for (const [icon, label, fn] of links) {
    const row = h(`<button class="set-row">${I[icon]}<span>${tr(label)}</span><span class="chev">${I.chevRight}</span></button>`);
    row.addEventListener('click', fn);
    settings.appendChild(row);
  }

  if (!isBackupHealthy()) {
    page.appendChild(h(`<p class="credit credit-warn">${tr('Copie de secours locale saturee : exporte tes donnees pour ne rien perdre.')}</p>`));
  }

  page.appendChild(h(`
    <p class="credit">
      ${tr("Donnees 100% locales a cet appareil. Desinstaller l'app (ou la retirer de l'ecran d'accueil) efface tout, copie de secours comprise.")}<br>
      ${tr('Pour ne pas perdre tes donnees, exporte-les regulierement depuis ce menu.')}<br>
      ${tr("Ce produit utilise l'API TMDB mais n'est ni approuve ni certifie par TMDB.")}
    </p>
  `));

  function doExport() {
    downloadExport();
  }

  function doImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      try {
        const res = await importJson(await file.text());
        toast(`${tr('Importe :')} ${res.items} ${tr('titres')}, ${res.playlists} ${tr('playlists')}`);
        renderProfile();
      } catch (e) {
        toast(tr('Import impossible :') + ' ' + e.message);
      }
    };
    input.click();
  }
}

/* ============================== RECHERCHE ============================== */

let searchLast = { q: '', results: [] };

export function renderSearch() {
  const v = $view();
  v.innerHTML = '';
  const page = h('<div class="page search-page"></div>');
  v.appendChild(page);

  page.appendChild(h(`
    <div class="page-head">
      <div style="display:flex;align-items:center;gap:12px">
        <button class="head-btn" data-nav="back" aria-label="${tr('Retour')}">${I.back}</button>
        <h1 class="page-title">${tr('Recherche')}</h1>
      </div>
    </div>
  `));
  bindBack(page);

  const barWrap = h(`
    <div class="search-bar-wrap">
      <div class="search-bar">
        ${I.search}
        <input type="search" placeholder="${tr('Film, serie, anime...')}" autocomplete="off" enterkeyhint="search">
      </div>
      <a class="head-btn adv-btn" href="#/advanced" aria-label="${tr('Recherche avancee')}">${I.sliders}</a>
    </div>
  `);
  const bar = barWrap.querySelector('.search-bar');
  const suggestTitle = h(`<h2 class="search-suggest-title">${tr('Tendances')}</h2>`);
  const results = h('<div class="grid"></div>');
  page.append(barWrap, suggestTitle, results);

  const input = bar.querySelector('input');
  let timer = null;
  let seq = 0;

  function draw(list, showTitle = false) {
    results.innerHTML = '';
    suggestTitle.style.display = showTitle ? '' : 'none';
    if (!list.length) {
      if (input.value.trim()) results.appendChild(emptyState('search', tr('Aucun resultat'), tr('Essaie une autre orthographe.')));
      return;
    }
    const usable = list.length - (list.length % 3);
    for (const m of list.slice(0, usable)) {
      if (m.media_type === 'person') continue;
      if (m._anilistOnly) {
        results.appendChild(anilistOnlyCard(m));
        continue;
      }
      const mtype = m.media_type || (m.title ? 'movie' : 'tv');
      results.appendChild(posterCard(m, { type: mtype, sub: [typeLabel(mtype, isAnime(m)), mediaYear(m)].filter(Boolean).join(' - ') }));
    }
  }

  async function loadSuggestions() {
    try {
      const [movies, tv] = await Promise.all([api.trending('movie'), api.trending('tv')]);
      const mixed = [
        ...movies.results.slice(0, 9),
        ...tv.results.slice(0, 9),
      ];
      if (!input.value.trim()) draw(mixed, true);
    } catch { /* hors ligne */ }
  }

  async function run(q) {
    const my = ++seq;
    if (!q.trim()) { loadSuggestions(); return; }
    suggestTitle.style.display = 'none';
    try {
      const data = await api.search(q.trim());
      if (my !== seq) return;
      searchLast = { q, results: data.results };
      draw(data.results);
    } catch {
      results.innerHTML = '';
      results.appendChild(emptyState('search', tr('Hors ligne'), tr("La recherche a besoin d'une connexion.")));
    }
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => run(input.value), 350);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { clearTimeout(timer); run(input.value); input.blur(); }
  });

  // restaure la derniere recherche ou affiche les tendances
  if (searchLast.q) {
    input.value = searchLast.q;
    draw(searchLast.results);
  } else {
    loadSuggestions();
  }
  setTimeout(() => input.focus(), 80);
}

/* ============================== STATS ============================== */

export async function renderStats() {
  const v = $view();
  v.innerHTML = '';
  const page = h('<div class="page"></div>');
  page.appendChild(pageHead(tr('Statistiques'), { back: true }));
  bindBack(page);
  v.appendChild(page);

  const holder = h('<div></div>');
  holder.appendChild(spinner());
  page.appendChild(holder);

  const tvItems = [...state.items.values()].filter((i) => i.type === 'tv' && watchedEpisodeCount(i) > 0);
  await Promise.all(tvItems.map((it) =>
    syncTvRuntimes({ type: 'tv', tmdbId: it.tmdbId }, it.tmdbId)
  ));

  const s = computeStats();
  const animeEps = s.animes.filter((i) => i.type === 'tv').reduce((a, i) => a + watchedEpisodeCount(i), 0);
  const animeMovies = s.animes.filter((i) => i.type === 'movie' && i.plays > 0).length;

  holder.innerHTML = '';
  holder.appendChild(h(`
    <div class="stats-page">
      <div class="stats-hero">
        <div class="stats-hero-lbl">${tr("Temps total devant l'ecran")}</div>
        <div class="stats-hero-val">${formatDuration(s.totalMinutes)}</div>
        <div class="stats-hero-sub">${tr('Durees reelles TMDB par episode')}</div>
      </div>
      <div class="stats-breakdown">
        <div class="stats-row"><span>${tr('Films')}</span><strong>${formatDuration(s.movieMinutes)}</strong></div>
        <div class="stats-row"><span>${tr('Series')}</span><strong>${formatDuration(s.tvMinutes)}</strong></div>
        <div class="stats-row"><span>${tr('Animes')}</span><strong>${formatDuration(s.animeMinutes)}</strong></div>
      </div>
      <div class="stats-grid stats-grid--detail">
        <div class="stat"><div class="v">${s.moviesSeen.length}</div><div class="l">${tr('Films vus')}</div></div>
        <div class="stat"><div class="v">${s.moviePlays}</div><div class="l">${tr('Visionnages films')}</div></div>
        <div class="stat"><div class="v">${s.tvStarted.length}</div><div class="l">${tr('Series suivies')}</div></div>
        <div class="stat"><div class="v">${s.epsSeen}</div><div class="l">${tr('Episodes vus')}</div></div>
        <div class="stat"><div class="v">${animeMovies}</div><div class="l">${tr('Films anime vus')}</div></div>
        <div class="stat"><div class="v">${animeEps}</div><div class="l">${tr('Ep. anime vus')}</div></div>
        <div class="stat"><div class="v">${s.rewatches}</div><div class="l">${tr('Revisionnages')}</div></div>
        <div class="stat"><div class="v">${s.favs.length}</div><div class="l">${tr('Favoris')}</div></div>
      </div>
    </div>
  `));
}

/* ============================== BIBLIOTHEQUE FILTRE ============================== */

const LIBRARY_CFG = {
  'movies-seen': {
    title: 'Films vus',
    filter: (i) => i.type === 'movie' && !i.isAnime && i.plays > 0,
    sub: (i) => `${i.plays} ${i.plays > 1 ? tr('visionnages') : tr('visionnage')}${i.year ? ' - ' + i.year : ''}`,
  },
  'series-followed': {
    title: 'Series suivies',
    filter: (i) => i.type === 'tv' && !i.isAnime && watchedEpisodeCount(i) > 0,
    sub: (i) => {
      const p = tvProgress(i);
      return `${p.watched} ep.${p.total ? ' / ' + p.total : ''}`;
    },
  },
  favorites: {
    title: 'Favoris',
    filter: (i) => i.favorite,
    sub: (i) => [typeLabel(i.type, i.isAnime), i.year].filter(Boolean).join(' - '),
  },
};

export function renderLibrary(name) {
  const cfg = LIBRARY_CFG[name];
  const v = $view();
  v.innerHTML = '';
  const page = h('<div class="page"></div>');
  page.appendChild(pageHead(tr(cfg?.title || 'Bibliotheque'), { back: true }));
  bindBack(page);
  v.appendChild(page);

  const holder = h('<div></div>');
  page.appendChild(holder);

  if (!cfg) {
    holder.appendChild(emptyState('list', tr('Page introuvable')));
    return;
  }

  page.querySelector('.head-actions').prepend(viewToggle(() => draw()));

  function draw() {
    holder.innerHTML = '';
    const items = [...state.items.values()]
      .filter(cfg.filter)
      .sort((a, b) => b.updatedAt - a.updatedAt);

    if (!items.length) {
      holder.appendChild(emptyState('popcorn', tr('Rien ici pour le moment'), tr('Tes ajouts apparaitront ici.')));
      return;
    }

    if (getViewMode() === 'grid') {
      const grid = h('<div class="grid"></div>');
      for (const it of items) {
        grid.appendChild(posterCard(mediaFromItem(it), { type: it.type, noQuick: true, sub: cfg.sub(it) }));
      }
      holder.appendChild(grid);
    } else {
      const list = h('<div class="media-list"></div>');
      for (const it of items) {
        list.appendChild(mediaListRow(it, { sub: cfg.sub(it) }));
      }
      holder.appendChild(list);
    }
  }
  draw();
}

/* ============================== LISTING (tout voir) ============================== */

export function renderListing(id) {
  const v = $view();
  v.innerHTML = '';
  const page = h('<div class="page"></div>');
  page.appendChild(pageHead(tr('Liste'), { back: true }));
  bindBack(page);
  v.appendChild(page);

  const grid = h('<div class="grid"></div>');
  page.appendChild(grid);

  let data;
  try {
    data = JSON.parse(sessionStorage.getItem(LISTING_PREFIX + id) || 'null');
  } catch {
    data = null;
  }

  if (!data?.items?.length) {
    grid.classList.add('grid--empty');
    grid.appendChild(emptyState('list', tr('Liste introuvable'), tr('Reviens en arriere et reessaie.')));
    return;
  }

  page.querySelector('.page-title').textContent = data.title;
  const type = data.type;
  const items = data.items;

  if (type === 'cast') {
    for (const p of items) grid.appendChild(castCard(p));
    return;
  }
  if (type === 'crew') {
    for (const p of items) grid.appendChild(crewCard(p));
    return;
  }

  const count = items.length - (items.length % 3 || 0) || items.length;
  for (const m of items.slice(0, count)) {
    const t = type === 'mixed' ? (m.media_type || (m.title ? 'movie' : 'tv')) : type;
    grid.appendChild(posterCard(m, { type: t, sub: mediaYear(m) }));
  }
}

/* ============================== PARAMETRES ============================== */

// Compat boot : initAppearance() gere skin + mode
export { initAppearance } from './themes.js';

async function checkForUpdate(statusEl) {
  statusEl.textContent = tr('Verification...');
  if (!('serviceWorker' in navigator)) {
    statusEl.textContent = tr('Mise a jour non disponible dans ce navigateur.');
    return;
  }
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) {
      statusEl.textContent = tr('Mise a jour non disponible ici.');
      return;
    }
    let found = false;
    reg.addEventListener('updatefound', () => { found = true; }, { once: true });
    await reg.update();
    if (found || reg.installing || reg.waiting) {
      statusEl.textContent = tr('Mise a jour trouvee, installation...');
      // le nouveau service worker prend la main puis on recharge
      navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
      setTimeout(() => location.reload(), 6000); // filet de securite
    } else {
      statusEl.textContent = `${tr('Vous etes deja a jour')} (${tr('version')} ${APP_VERSION}).`;
    }
  } catch {
    statusEl.textContent = tr('Verification impossible (hors ligne ?).');
  }
}

function resetConfirmPhrase() {
  return isEn() ? 'DELETE ALL' : 'SUPPRIMER TOUT';
}

function openDataResetSheet() {
  const phrase = resetConfirmPhrase();
  const cloud = hasSync();
  const body = h(`
    <div class="reset-sheet">
      <h3>${tr('Reinitialiser toutes les donnees')}</h3>
      <p class="reset-warn">${cloud
    ? tr('Action irreversible. Toutes tes donnees seront effacees sur cet appareil ET sur ton compte cloud connecte.')
    : tr('Action irreversible. Toutes tes donnees seront effacees sur cet appareil.')}</p>
      <p class="reset-hint">${tr('Pour confirmer, tape exactement :')}</p>
      <p class="reset-phrase">${esc(phrase)}</p>
      <input class="sheet-input reset-input" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false"
             placeholder="${esc(phrase)}">
      <label class="reset-check">
        <input type="checkbox">
        <span>${tr('Je comprends que cette action est definitive')}</span>
      </label>
      <div class="reset-actions">
        <button class="btn ghost reset-cancel">${tr('Annuler')}</button>
        <button class="btn reset-confirm" disabled>${tr('Tout supprimer')}</button>
      </div>
    </div>
  `);
  const close = openSheet(body);
  const input = body.querySelector('.reset-input');
  const check = body.querySelector('input[type="checkbox"]');
  const confirm = body.querySelector('.reset-confirm');
  const cancel = body.querySelector('.reset-cancel');

  const refresh = () => {
    const ok = input.value.trim() === phrase && check.checked;
    confirm.disabled = !ok;
  };
  input.addEventListener('input', refresh);
  check.addEventListener('change', refresh);
  cancel.addEventListener('click', close);
  confirm.addEventListener('click', async () => {
    if (input.value.trim() !== phrase || !check.checked) return;
    confirm.disabled = true;
    confirm.classList.add('loading');
    try {
      await resetAllData();
      close();
      toast(tr('Donnees reinitialisees'));
      location.hash = '#/home';
      location.reload();
    } catch {
      toast(tr('Reinitialisation echouee'));
      confirm.disabled = false;
      confirm.classList.remove('loading');
    }
  });
  setTimeout(() => input.focus(), 120);
}

export function renderSettings() {
  const v = $view();
  v.innerHTML = '';
  const page = h('<div class="page"></div>');
  page.appendChild(pageHead(tr('Parametres'), { back: true }));
  bindBack(page);
  v.appendChild(page);

  const box = h('<div class="settings-page"></div>');
  page.appendChild(box);

  // ---- Apparence ----
  box.appendChild(h(`<h2 class="settings-title">${tr('Apparence')}</h2>`));
  const curSkin = getSkinInfo(getSkin());
  const themeRow = h(`
    <button type="button" class="set-row theme-current-row">
      <span class="theme-current-preview">
        <i style="background:${curSkin.preview[0]}"></i>
        <i style="background:${curSkin.preview[1]}"></i>
        <i style="background:${curSkin.preview[2]}"></i>
      </span>
      <span class="theme-current-info">
        <span class="theme-current-name">${tr(curSkin.label)}</span>
        <span class="theme-current-mode">${getMode() === 'light' ? tr('Clair') : tr('Sombre')}</span>
      </span>
      <span class="chev">${I.chevRight}</span>
    </button>
  `);
  themeRow.addEventListener('click', () => {
    openThemePicker({
      onPick: () => {
        const sk = getSkinInfo(getSkin());
        themeRow.querySelector('.theme-current-name').textContent = tr(sk.label);
        themeRow.querySelector('.theme-current-mode').textContent = getMode() === 'light' ? tr('Clair') : tr('Sombre');
        const prev = themeRow.querySelector('.theme-current-preview');
        prev.querySelectorAll('i').forEach((el, i) => { el.style.background = sk.preview[i]; });
      },
    });
  });
  box.appendChild(themeRow);
  box.appendChild(h(`<p class="settings-note">${tr('Le theme est synchronise avec ton compte cloud si tu es connecte.')}</p>`));

  // ---- Langue du contenu ----
  box.appendChild(h(`<h2 class="settings-title">${tr('Langue')}</h2>`));
  const langSeg = h(`
    <div class="seg">
      <button class="seg-btn" data-l="fr-FR">${I.globe}<span>${tr('Francais')}</span></button>
      <button class="seg-btn" data-l="en-US">${I.globe}<span>English</span></button>
    </div>
  `);
  const syncLang = () => langSeg.querySelectorAll('.seg-btn')
    .forEach((b) => b.classList.toggle('on', b.dataset.l === getLang()));
  syncLang();
  langSeg.addEventListener('click', (e) => {
    const b = e.target.closest('.seg-btn');
    if (!b || b.dataset.l === getLang()) return;
    setLang(b.dataset.l);
    syncLang();
    // toute l'interface est traduite -> rechargement complet
    location.reload();
  });
  box.appendChild(langSeg);
  box.appendChild(h(`<p class="settings-note">${tr("Langue de l'app et du contenu TMDB (titres, synopsis, listes).")}</p>`));

  // ---- Metadonnees (fusion TMDB + AniList) ----
  box.appendChild(h(`<h2 class="settings-title">${tr('Metadonnees')}</h2>`));
  const fusionOk = canUseFusion();
  const metaSeg = h(`
    <div class="seg${fusionOk ? '' : ' seg--disabled'}">
      <button class="seg-btn" data-m="tmdb-only">${tr('TMDB seul')}</button>
      <button class="seg-btn" data-m="fusion">${tr('Fusion TMDB + AniList')}</button>
    </div>
  `);
  const syncMeta = () => {
    const mode = getMetadataMode();
    metaSeg.querySelectorAll('.seg-btn').forEach((b) => {
      b.classList.toggle('on', b.dataset.m === mode);
      b.disabled = !fusionOk && b.dataset.m === 'fusion';
    });
  };
  syncMeta();
  metaSeg.addEventListener('click', (e) => {
    const b = e.target.closest('.seg-btn');
    if (!b || b.disabled || b.dataset.m === getMetadataMode()) return;
    if (b.dataset.m === 'fusion' && !fusionOk) return;
    setMetadataMode(b.dataset.m);
    clearApiCache();
    syncMeta();
    toast(b.dataset.m === 'fusion' ? tr('Fusion activee') : tr('Mode TMDB seul'));
  });
  box.appendChild(metaSeg);
  box.appendChild(h(`<p class="settings-note">${fusionOk
    ? tr('La fusion enrichit les fiches anime (studios, equipe, score). Aucune cle supplementaire.')
    : tr('Passe en mode proxy pour activer la fusion.')}</p>`));

  // ---- Acces TMDB ----
  box.appendChild(h(`<h2 class="settings-title">${tr('Acces TMDB')}</h2>`));
  const cfg = getConfig();
  const modeLabel = cfg?.mode === 'key' ? tr('Cle personnelle') : tr('Proxy');
  box.appendChild(h(`<p class="settings-note">${tr('Mode actuel :')} ${modeLabel}</p>`));
  const reconf = h(`<button class="set-row">${I.globe}<span>${tr("Reconfigurer l'acces")}</span><span class="chev">${I.chevRight}</span></button>`);
  reconf.addEventListener('click', async () => {
    const ok = await openConfirmSheet({
      title: tr("Reconfigurer l'acces TMDB"),
      message: tr('Tu devras ressaisir ta cle ou ton proxy. L\'app redemarrera sur l\'ecran de configuration.'),
      confirmLabel: tr('Reconfigurer'),
      danger: true,
    });
    if (!ok) return;
    resetConfig();
    location.reload();
  });
  box.appendChild(reconf);

  // ---- Sauvegarde et synchronisation ----
  box.appendChild(h(`<h2 class="settings-title">${tr('Sauvegarde et synchronisation')}</h2>`));
  const providerLabel = { dropbox: 'Dropbox', gdrive: 'Google Drive' };
  if (hasSync()) {
    const { provider } = syncStatus();
    box.appendChild(h(`<p class="settings-note">${tr('Connecte :')} ${providerLabel[provider] || provider}</p>`));
    const syncBtn = h(`<button class="set-row">${I.refresh}<span>${tr('Synchroniser maintenant')}</span><span class="chev">${I.chevRight}</span></button>`);
    syncBtn.addEventListener('click', async () => {
      toast(tr('Synchronisation...'));
      await syncNow();
      toast(tr('Synchronise'));
    });
    const offBtn = h(`<button class="set-row">${I.globe}<span>${tr('Se deconnecter du cloud')}</span><span class="chev">${I.chevRight}</span></button>`);
    offBtn.addEventListener('click', async () => {
      const ok = await openConfirmSheet({
        title: tr('Se deconnecter du cloud'),
        message: tr('La deconnexion supprimera toutes les donnees de cet appareil. Tes donnees restent sur le cloud et pourront etre recuperees en te reconnectant.'),
        confirmLabel: tr('Se deconnecter'),
        danger: true,
      });
      if (!ok) return;
      await disconnect();
      toast(tr('Deconnecte'));
      location.hash = '#/home';
      location.reload();
    });
    box.append(syncBtn, offBtn);
  } else {
    // OAuth (crypto.subtle / popup) exige un contexte securise : HTTPS ou localhost.
    const secureGuard = () => {
      if (window.isSecureContext) return true;
      toast(tr('La synchro cloud necessite HTTPS (ou localhost). Deploie l\'app pour l\'utiliser sur mobile.'));
      return false;
    };
    const dbxBtn = h(`<button class="set-row">${I.globe}<span>${tr('Se connecter avec Dropbox')}</span><span class="chev">${I.chevRight}</span></button>`);
    dbxBtn.addEventListener('click', async () => {
      const r = await promptCloudConnect('dropbox', { secureGuard });
      if (r === undefined) toast(tr('Connexion annulee'));
    });
    const gdBtn = h(`<button class="set-row">${I.globe}<span>${tr('Se connecter avec Google Drive')}</span><span class="chev">${I.chevRight}</span></button>`);
    gdBtn.addEventListener('click', async () => {
      const r = await promptCloudConnect('gdrive', { secureGuard });
      if (r === null) return;
      if (r === undefined) { toast(tr('Connexion annulee')); return; }
      if (r.langChanged) { location.reload(); return; }
      toast(tr('Synchronise'));
      renderSettings();
    });
    box.append(dbxBtn, gdBtn);
    box.appendChild(h(`<p class="settings-note">${tr('Synchronise tes donnees pour les retrouver sur un autre appareil et survivre a une desinstallation.')}</p>`));
  }

  // ---- Zone de danger ----
  box.appendChild(h(`<h2 class="settings-title settings-title--danger">${tr('Zone de danger')}</h2>`));
  const resetBtn = h(`<button class="set-row set-row--danger">${I.trash}<span>${tr('Reinitialiser toutes les donnees')}</span><span class="chev">${I.chevRight}</span></button>`);
  resetBtn.addEventListener('click', openDataResetSheet);
  box.appendChild(resetBtn);
  box.appendChild(h(`<p class="settings-note settings-note--danger">${hasSync()
    ? tr('Efface les donnees locales et le fichier cloud. Action irreversible.')
    : tr('Efface toutes les donnees locales. Action irreversible.')}</p>`));

  // ---- Mise a jour ----
  box.appendChild(h(`<h2 class="settings-title">${tr('Application')}</h2>`));
  const updBtn = h(`<button class="set-row">${I.refresh}<span>${tr('Mettre a jour')}</span><span class="chev">${I.chevRight}</span></button>`);
  const status = h(`<p class="settings-note">${tr('Version')} ${APP_VERSION}</p>`);
  updBtn.addEventListener('click', () => checkForUpdate(status));
  box.append(updBtn, status);
}

/* ============================== PARCOURIR PAR GENRE ============================== */

const genreNames = {};

async function getGenreName(apiType, genreId) {
  if (!genreNames[apiType]) {
    try {
      const data = await api.genreList(apiType);
      genreNames[apiType] = Object.fromEntries((data.genres || []).map((g) => [g.id, g.name]));
    } catch {
      genreNames[apiType] = {};
    }
  }
  return genreNames[apiType][genreId] || 'Genre';
}

export async function renderBrowse(mediaType, genreId) {
  const v = $view();
  v.innerHTML = '';
  const page = h('<div class="page"></div>');
  const animeMode = mediaType === 'anime';
  const apiType = animeMode ? 'tv' : mediaType;
  page.appendChild(pageHead(tr('Chargement...'), { back: true }));
  bindBack(page);
  v.appendChild(page);

  const grid = h('<div class="grid"></div>');
  const moreWrap = h('<div class="loadmore-wrap"></div>');
  const more = h(`<button class="btn ghost loadmore">${tr('Charger plus')}</button>`);
  moreWrap.appendChild(more);
  page.append(grid, moreWrap);

  const genreLabel = await getGenreName(apiType, genreId);
  page.querySelector('.page-title').textContent = genreLabel;

  let pageNum = 1;
  let loading = false;
  let heldBack = [];

  const extra = animeMode
    ? { with_origin_country: 'JP', with_genres: genreId === 16 ? '16' : `${genreId},16` }
    : {};

  async function load(reset) {
    if (loading) return;
    loading = true;
    if (reset) {
      grid.innerHTML = '';
      grid.classList.remove('grid--empty');
      pageNum = 1;
      heldBack = [];
    }
    const sp = spinner();
    grid.parentElement.insertBefore(sp, moreWrap);
    try {
      const data = await api.discoverByGenre(apiType, genreId, pageNum, extra);
      let batch = (data.results || []).filter((m) => !animeMode || isAnime(m));
      if (heldBack.length) {
        batch = [...heldBack, ...batch];
        heldBack = [];
      }
      const usable = batch.length - (batch.length % 3);
      heldBack = batch.slice(usable);
      batch = batch.slice(0, usable);
      for (const m of batch) {
        grid.appendChild(posterCard(m, { type: apiType, sub: mediaYear(m) }));
      }
      moreWrap.style.display = pageNum >= data.total_pages ? 'none' : '';
      pageNum++;
    } catch {
      if (!grid.children.length) {
        grid.classList.add('grid--empty');
        grid.appendChild(emptyState('film', tr('Hors ligne'), tr('Impossible de charger TMDB.')));
      }
      moreWrap.style.display = 'none';
    }
    sp.remove();
    loading = false;
  }

  more.addEventListener('click', () => load(false));
  load(true);
}

/* ============================== PERSONNE (acteur) ============================== */

export async function renderPerson(id) {
  const v = $view();
  v.innerHTML = '';
  const page = h('<div class="page"></div>');
  v.appendChild(page);
  page.appendChild(spinner());

  let p;
  try {
    p = await api.person(id);
  } catch {
    page.innerHTML = '';
    page.appendChild(pageHead(tr('Oups'), { back: true }));
    bindBack(page);
    page.appendChild(emptyState('user', tr('Contenu indisponible'), tr('Verifie ta connexion et reessaie.')));
    return;
  }

  page.innerHTML = '';
  page.appendChild(pageHead('', { back: true }));
  bindBack(page);

  const photo = img(p.profile_path, 'w342');
  page.appendChild(h(`
    <div class="person-hero">
      <div class="person-photo">${photo ? `<img src="${photo}" alt="">` : `<span class="no-img">${esc((p.name || '?').split(' ').map((w) => w[0]).slice(0, 2).join(''))}</span>`}</div>
      <h1 class="person-name">${esc(p.name || '')}</h1>
      ${p.birthday ? `<div class="person-sub">${p.birthday.split('-').reverse().join('/')}${p.place_of_birth ? ' - ' + esc(p.place_of_birth) : ''}</div>` : ''}
    </div>
  `));

  if (p.biography) {
    const bio = h(`<p class="overview clamp">${esc(p.biography)}</p>`);
    const moreBtn = h(`<button class="overview-more">${tr('Lire la suite')}</button>`);
    moreBtn.addEventListener('click', () => {
      const clamped = bio.classList.toggle('clamp');
      moreBtn.textContent = clamped ? tr('Lire la suite') : tr('Reduire');
    });
    page.append(bio, moreBtn);
  }

  // Filmographie (dedupliquee, du plus recent au plus ancien)
  const seen = new Set();
  const credits = (p.combined_credits?.cast || [])
    .filter((c) => {
      const key = `${c.media_type}_${c.id}`;
      if (c.media_type !== 'movie' && c.media_type !== 'tv') return false;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (b.popularity || 0) - (a.popularity || 0));

  if (credits.length) {
    const sec = h(`<section class="section"><div class="section-head"><h2 class="section-title">${tr('Filmographie')} (${credits.length})</h2></div></section>`);
    const grid = h('<div class="grid"></div>');
    for (const m of credits) {
      grid.appendChild(posterCard(m, {
        type: m.media_type,
        sub: [typeLabel(m.media_type, isAnime(m)), mediaYear(m)].filter(Boolean).join(' - '),
      }));
    }
    sec.appendChild(grid);
    page.appendChild(sec);
  }
}

/* ============================== RECHERCHE AVANCEE ============================== */

const ADV_DEFAULT = () => ({
  type: 'movie', genres: new Set(),
  runtimeMin: '', runtimeMax: '', epMin: '', epMax: '',
  yearMin: '', yearMax: '', noteMin: '', votesMin: '',
  cast: [], keywords: [],
});
let advFilters = ADV_DEFAULT();

// Selecteur a suggestions (acteurs, mots-cles)
function advPicker(title, list, placeholder, searchFn) {
  const wrap = h(`
    <div>
      <h2 class="settings-title">${title}</h2>
      <div class="chips chips-wrap adv-sel"></div>
      <input class="sheet-input" placeholder="${placeholder}" autocomplete="off">
      <div class="adv-sugg"></div>
    </div>
  `);
  const selEl = wrap.querySelector('.adv-sel');
  const input = wrap.querySelector('input');
  const sugg = wrap.querySelector('.adv-sugg');

  const drawSel = () => {
    selEl.innerHTML = '';
    for (const it of list) {
      const c = h(`<button class="chip on">${esc(it.name)} &#215;</button>`);
      c.addEventListener('click', () => {
        list.splice(list.indexOf(it), 1);
        drawSel();
      });
      selEl.appendChild(c);
    }
  };
  drawSel();

  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (!q) { sugg.innerHTML = ''; return; }
    timer = setTimeout(async () => {
      try {
        const data = await searchFn(q);
        sugg.innerHTML = '';
        for (const r of (data.results || []).slice(0, 5)) {
          const b = h(`<button class="adv-sugg-item">${esc(r.name)}</button>`);
          b.addEventListener('click', () => {
            if (!list.some((x) => x.id === r.id)) list.push({ id: r.id, name: r.name });
            input.value = '';
            sugg.innerHTML = '';
            drawSel();
          });
          sugg.appendChild(b);
        }
      } catch { /* hors ligne */ }
    }, 300);
  });
  return wrap;
}

function advPair(title, phA, phB, getA, setA, getB, setB) {
  const wrap = h(`
    <div>
      <h2 class="settings-title">${title}</h2>
      <div class="adv-pair">
        <input class="sheet-input" type="number" inputmode="numeric" placeholder="${phA}" value="${getA()}">
        <input class="sheet-input" type="number" inputmode="numeric" placeholder="${phB}" value="${getB()}">
      </div>
    </div>
  `);
  const [a, b] = wrap.querySelectorAll('input');
  a.addEventListener('input', () => setA(a.value));
  b.addEventListener('input', () => setB(b.value));
  return wrap;
}

export function renderAdvanced() {
  const v = $view();
  v.innerHTML = '';
  const page = h('<div class="page"></div>');
  page.appendChild(pageHead(tr('Recherche avancee'), { back: true }));
  bindBack(page);
  v.appendChild(page);

  const f = advFilters;
  const form = h('<div class="adv-form"></div>');
  page.appendChild(form);

  // Type
  form.appendChild(h(`<h2 class="settings-title">${tr('Type')}</h2>`));
  const typeSeg = h(`
    <div class="seg seg-3">
      <button class="seg-btn" data-v="movie">${tr('Film')}</button>
      <button class="seg-btn" data-v="tv">${tr('Serie')}</button>
      <button class="seg-btn" data-v="anime">${tr('Anime')}</button>
    </div>
  `);
  form.appendChild(typeSeg);

  // Genres (charges selon le type)
  form.appendChild(h(`<h2 class="settings-title">${tr('Genres')}</h2>`));
  const genresEl = h('<div class="chips chips-wrap"></div>');
  form.appendChild(genresEl);

  async function renderGenres() {
    genresEl.innerHTML = '';
    const apiType = f.type === 'movie' ? 'movie' : 'tv';
    let list = [];
    try { list = (await api.genreList(apiType)).genres || []; } catch { /* hors ligne */ }
    for (const g of list) {
      if (f.type === 'anime' && g.id === 16) continue; // implicite pour les animes
      const c = h(`<button class="chip ${f.genres.has(g.id) ? 'on' : ''}">${esc(g.name)}</button>`);
      c.addEventListener('click', () => {
        if (f.genres.has(g.id)) f.genres.delete(g.id);
        else f.genres.add(g.id);
        c.classList.toggle('on');
      });
      genresEl.appendChild(c);
    }
  }

  // Duree (films) / nombre d'episodes (series et animes)
  const durMovie = advPair(tr('Duree (minutes)'), tr('Min'), tr('Max'),
    () => f.runtimeMin, (x) => (f.runtimeMin = x), () => f.runtimeMax, (x) => (f.runtimeMax = x));
  const durTv = advPair(tr("Nombre d'episodes"), tr('Min'), tr('Max'),
    () => f.epMin, (x) => (f.epMin = x), () => f.epMax, (x) => (f.epMax = x));
  form.append(durMovie, durTv);

  const syncType = () => {
    typeSeg.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('on', b.dataset.v === f.type));
    durMovie.hidden = f.type !== 'movie';
    durTv.hidden = f.type === 'movie';
    renderGenres();
  };
  typeSeg.addEventListener('click', (e) => {
    const b = e.target.closest('.seg-btn');
    if (!b || b.dataset.v === f.type) return;
    f.type = b.dataset.v;
    f.genres.clear();
    syncType();
  });
  syncType();

  // Annee / note
  form.appendChild(advPair(tr('Annee de sortie'), tr('De (annee)'), tr('A (annee)'),
    () => f.yearMin, (x) => (f.yearMin = x), () => f.yearMax, (x) => (f.yearMax = x)));
  form.appendChild(advPair(tr('Note'), tr('Note minimum (0-10)'), tr('Votes minimum'),
    () => f.noteMin, (x) => (f.noteMin = x), () => f.votesMin, (x) => (f.votesMin = x)));

  // Acteurs / mots-cles
  form.appendChild(advPicker(tr('Acteurs'), f.cast, tr("Nom d'un acteur..."), api.searchPerson));
  form.appendChild(advPicker(tr('Mots-cles'), f.keywords, tr('Mot-cle...'), api.searchKeyword));

  // Actions
  const goBtn = h(`<button class="btn" style="margin-top:18px">${tr('Rechercher')}</button>`);
  const resetBtn = h(`<button class="btn ghost">${tr('Reinitialiser')}</button>`);
  form.append(goBtn, resetBtn);
  resetBtn.addEventListener('click', () => {
    advFilters = ADV_DEFAULT();
    renderAdvanced();
  });

  // Resultats
  const resTitle = h('<h2 class="settings-title" style="display:none;padding:0 var(--page-pad)"></h2>');
  const resGrid = h('<div class="grid"></div>');
  page.append(resTitle, resGrid);
  goBtn.addEventListener('click', () => {
    runAdvanced(f, resTitle, resGrid);
    resTitle.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

async function runAdvanced(f, titleEl, grid) {
  titleEl.style.display = '';
  titleEl.textContent = tr('Recherche en cours...');
  grid.classList.remove('grid--empty');
  grid.innerHTML = '';
  grid.appendChild(spinner());

  const apiType = f.type === 'movie' ? 'movie' : 'tv';

  const matchFilters = (m) => {
    const dstr = m.release_date || m.first_air_date || '';
    const y = dstr ? Number(dstr.slice(0, 4)) : null;
    if (f.yearMin && (!y || y < Number(f.yearMin))) return false;
    if (f.yearMax && (!y || y > Number(f.yearMax))) return false;
    if (f.noteMin && (m.vote_average || 0) < Number(f.noteMin)) return false;
    if (f.votesMin && (m.vote_count || 0) < Number(f.votesMin)) return false;
    const gids = m.genre_ids || (m.genres || []).map((g) => g.id);
    for (const g of f.genres) if (!gids.includes(g)) return false;
    if (f.type === 'anime' && !isAnime(m)) return false;
    return true;
  };

  let results = [];
  try {
    if (f.cast.length) {
      // Mode acteurs : filmographies croisees, les titres reunissant le plus
      // d'acteurs choisis remontent en premier (ex: Enola Holmes avant
      // Man of Steel pour Cavill + Millie Bobby Brown).
      const people = await Promise.all(f.cast.map((c) => api.person(c.id)));
      const buckets = new Map();
      for (const person of people) {
        const seenLocal = new Set();
        for (const cr of person.combined_credits?.cast || []) {
          if (cr.media_type !== apiType) continue;
          const key = cr.id;
          if (seenLocal.has(key)) continue;
          seenLocal.add(key);
          const cur = buckets.get(key) || { media: cr, count: 0 };
          cur.count++;
          buckets.set(key, cur);
        }
      }
      results = [...buckets.values()]
        .sort((a, b) => b.count - a.count || (b.media.popularity || 0) - (a.media.popularity || 0))
        .map((x) => x.media)
        .filter(matchFilters);
    } else {
      // Mode discover : requete precise (mots-cles ET) puis elargie (OU)
      const params = { sort_by: 'popularity.desc', include_adult: 'false' };
      const genres = [...f.genres];
      if (f.type === 'anime') {
        params.with_origin_country = 'JP';
        genres.push(16);
      }
      if (genres.length) params.with_genres = genres.join(',');
      const dateKey = apiType === 'movie' ? 'primary_release_date' : 'first_air_date';
      if (f.yearMin) params[`${dateKey}.gte`] = `${f.yearMin}-01-01`;
      if (f.yearMax) params[`${dateKey}.lte`] = `${f.yearMax}-12-31`;
      if (apiType === 'movie') {
        if (f.runtimeMin) params['with_runtime.gte'] = f.runtimeMin;
        if (f.runtimeMax) params['with_runtime.lte'] = f.runtimeMax;
      }
      if (f.noteMin) params['vote_average.gte'] = f.noteMin;
      if (f.votesMin) params['vote_count.gte'] = f.votesMin;

      const kw = f.keywords.map((k) => k.id);
      const variants = kw.length > 1 ? [kw.join(','), kw.join('|')] : kw.length ? [String(kw[0])] : [null];
      const seen = new Set();
      for (const vkw of variants) {
        const pr = { ...params };
        if (vkw) pr.with_keywords = vkw;
        for (let pg = 1; pg <= 2; pg++) {
          const data = await api.discover(apiType, pr, pg);
          for (const m of data.results || []) {
            if (seen.has(m.id)) continue;
            seen.add(m.id);
            if (matchFilters(m)) results.push(m);
          }
          if (pg >= (data.total_pages || 1)) break;
        }
      }
    }

    // Filtres qui demandent la fiche complete (duree en mode acteurs,
    // nombre d'episodes, mots-cles en mode acteurs)
    const needRuntime = apiType === 'movie' && f.cast.length && (f.runtimeMin || f.runtimeMax);
    const needEpisodes = apiType === 'tv' && (f.epMin || f.epMax);
    const needKeywords = f.cast.length && f.keywords.length;
    if (needRuntime || needEpisodes || needKeywords) {
      const top = results.slice(0, 30);
      const details = await Promise.all(top.map((m) => api.detail(apiType, m.id).catch(() => null)));
      const kwIds = f.keywords.map((k) => k.id);
      const scored = [];
      top.forEach((m, i) => {
        const dd = details[i];
        if (!dd) return;
        if (needRuntime) {
          if (f.runtimeMin && (dd.runtime || 0) < Number(f.runtimeMin)) return;
          if (f.runtimeMax && (dd.runtime || 9999) > Number(f.runtimeMax)) return;
        }
        if (needEpisodes) {
          const n = dd.number_of_episodes || 0;
          if (f.epMin && n < Number(f.epMin)) return;
          if (f.epMax && n > Number(f.epMax)) return;
        }
        let kwScore = 0;
        if (needKeywords) {
          const mediaKw = (dd.keywords?.keywords || dd.keywords?.results || []).map((k) => k.id);
          kwScore = kwIds.filter((k) => mediaKw.includes(k)).length;
        }
        scored.push({ m, kwScore, order: i });
      });
      scored.sort((a, b) => b.kwScore - a.kwScore || a.order - b.order);
      results = scored.map((x) => x.m);
    }
  } catch {
    grid.innerHTML = '';
    titleEl.textContent = tr('Hors ligne');
    return;
  }

  results = results.slice(0, 60);
  grid.innerHTML = '';
  titleEl.textContent = `${tr('Resultats')} (${results.length})`;
  if (!results.length) {
    grid.classList.add('grid--empty');
    grid.appendChild(emptyState('search', tr('Aucun resultat avec ces filtres.'), tr('Elargis les criteres et reessaie.')));
    return;
  }
  for (const m of results) {
    grid.appendChild(posterCard(m, {
      type: apiType,
      sub: [typeLabel(apiType, isAnime(m)), mediaYear(m)].filter(Boolean).join(' - '),
    }));
  }
}
