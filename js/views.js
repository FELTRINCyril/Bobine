// Vues / pages de l'app
import { api, img, isAnime } from './api.js';
import {
  state, getItem, saveItem, isSeen, isStarted, tvProgress,
  watchedEpisodeCount, totalEpisodePlays, computeStats, formatDuration,
  savePlaylist, deletePlaylist, createPlaylist,
  exportJson, importJson, ensureItem,
} from './db.js';
import { findUniverse } from './universes.js';
import {
  h, esc, I, posterCard, openSheet, toast, emptyState, spinner,
  mediaTitle, mediaYear, mediaType, typeLabel, isReleased,
} from './ui.js';
import {
  toggleFavorite, toggleWatchlist, setMoviePlays, setEpisodePlays,
  markSeason, updateItemTotals, openPlaylistSheet,
  cacheEpisodeRuntimes, syncTvRuntimes,
} from './actions.js';

const $view = () => document.getElementById('view');

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
        ${back ? `<button class="head-btn" data-nav="back" aria-label="Retour">${I.back}</button>` : ''}
        <h1 class="page-title">${title}</h1>
      </div>
      <div class="head-actions">
        <a class="head-btn" href="#/search" aria-label="Rechercher">${I.search}</a>
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
        ${linkHash ? `<a class="section-link" href="${linkHash}">Tout voir</a>` : ''}
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

function homeFetchSection(body, title, fetcher, type, listingId) {
  const holder = h('<div></div>');
  holder.appendChild(spinner());
  body.appendChild(section(title, holder, `#/listing/${listingId}`));
  fetcher()
    .then((data) => {
      const results = (data.results || []).filter((m) => m.media_type !== 'person').slice(0, 20);
      stashListing(listingId, title, type, results);
      holder.innerHTML = '';
      holder.appendChild(hRow(results.slice(0, 10), type));
    })
    .catch(() => {
      holder.innerHTML = '';
      holder.appendChild(emptyState('film', 'Hors ligne', 'Impossible de charger TMDB.'));
    });
}

// Reconstruit un pseudo-media TMDB depuis un item local (pour posterCard)
function mediaFromItem(it) {
  return { id: it.tmdbId, title: it.title, poster_path: it.poster, year: it.year };
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
            <a class="head-btn cine-search" href="#/search" aria-label="Rechercher">${I.search}</a>
          </div>
          <div class="cine-hero-content">
            <h2 class="cine-title">${esc(title)}</h2>
            ${overview ? `<p class="cine-desc">${esc(overview)}</p>` : ''}
            <div class="cine-actions">
              <a class="cine-btn-play" href="${detailHash}">${I.play}<span>Voir la fiche</span></a>
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
            <div class="s">${p.watched} ep. vu${p.watched > 1 ? 's' : ''}${p.total ? ` sur ${p.total}` : ''}</div>
            <div class="progress"><i style="width:${pct}%"></i></div>
          </div>
        </a>
      `));
    }
    body.appendChild(section('Reprendre', row));
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
        posterCard(mediaFromItem(it), { type: it.type, sub: typeLabel(it.type, it.isAnime) })
      );
    }
    body.appendChild(section('Ma watchlist', row, '#/watchlist'));
  }

  // Tendances (reseau)
  const slots = [
    ['Tendances films', () => api.trending('movie'), 'movie', '#/movies'],
    ['Tendances series', () => api.trending('tv'), 'tv', '#/series'],
    ['Top 10 Netflix — Films', () => api.discoverProvider('movie', 8), 'movie', 'netflix-movies'],
    ['Top 10 Netflix — Series', () => api.discoverProvider('tv', 8), 'tv', 'netflix-tv'],
    ['Populaire sur Disney+', () => api.discoverProvider('movie', 337), 'movie', 'disney-movies'],
    ['Populaire sur Prime Video', () => api.discoverProvider('movie', 119), 'movie', 'prime-movies'],
    ['Animes populaires', () => api.discoverAnime(), 'tv', '#/anime'],
  ];
  for (const [title, fetcher, type, link] of slots) {
    if (link.startsWith('#/')) {
      const holder = h('<div></div>');
      holder.appendChild(spinner());
      body.appendChild(section(title, holder, link));
      fetcher()
        .then((data) => {
          holder.innerHTML = '';
          holder.appendChild(hRow(data.results.slice(0, 12), type));
        })
        .catch(() => {
          holder.innerHTML = '';
          holder.appendChild(emptyState('film', 'Hors ligne', 'Impossible de charger TMDB.'));
        });
    } else {
      homeFetchSection(body, title, fetcher, type, link);
    }
  }
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
  page.appendChild(pageHead(cfg.title));

  const chipsEl = h('<div class="chips"></div>');
  const grid = h('<div class="grid"></div>');
  const moreWrap = h('<div class="loadmore-wrap"></div>');
  const more = h('<button class="btn ghost loadmore">Charger plus</button>');
  moreWrap.appendChild(more);
  page.append(chipsEl, grid, moreWrap);
  v.appendChild(page);

  let current = cfg.chips[0];
  let pageNum = 1;
  let loading = false;
  let heldBack = [];

  async function load(reset) {
    if (loading) return;
    loading = true;
    if (reset) {
      grid.innerHTML = '';
      grid.classList.remove('grid--empty');
      pageNum = 1;
      heldBack = [];
    }
    const type = current.type || cfg.type;

    if (current.local) {
      moreWrap.style.display = 'none';
      const items = [...state.items.values()]
        .filter(current.local)
        .sort((a, b) => b.updatedAt - a.updatedAt);
      const count = items.length - (items.length % 3);
      if (!count) {
        grid.classList.add('grid--empty');
        grid.appendChild(emptyState('popcorn', 'Rien ici pour le moment', 'Tes ajouts apparaitront ici.'));
      }
      for (const it of items.slice(0, count)) {
        grid.appendChild(posterCard(mediaFromItem(it), { type: it.type, sub: typeLabel(it.type, it.isAnime) }));
      }
      loading = false;
      return;
    }

    moreWrap.style.display = '';
    const sp = spinner();
    grid.parentElement.insertBefore(sp, moreWrap);
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
      moreWrap.style.display = pageNum >= data.total_pages ? 'none' : '';
      pageNum++;
    } catch {
      grid.appendChild(emptyState('film', 'Hors ligne', 'Impossible de charger TMDB.'));
      moreWrap.style.display = 'none';
    }
    sp.remove();
    loading = false;
  }

  for (const c of cfg.chips) {
    const chip = h(`<button class="chip ${c === current ? 'on' : ''}">${c.label}</button>`);
    chip.addEventListener('click', () => {
      current = c;
      chipsEl.querySelectorAll('.chip').forEach((x) => x.classList.remove('on'));
      chip.classList.add('on');
      load(true);
    });
    chipsEl.appendChild(chip);
  }

  more.addEventListener('click', () => load(false));
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
    d = await api.detail(type, id);
  } catch {
    page.innerHTML = '';
    page.appendChild(pageHead('Oups', { back: true }));
    page.appendChild(emptyState('film', 'Contenu indisponible', 'Verifie ta connexion et reessaie.'));
    bindBack(page);
    return;
  }

  const meta = metaFrom(d, type);
  page.innerHTML = '';

  // Memorise durees pour les stats
  const tracked = ensureItem(meta);
  if (type === 'movie' && d.runtime) tracked.runtime = d.runtime;
  if (type === 'tv' && d.episode_run_time?.length) {
    tracked.episodeRuntime = Math.round(
      d.episode_run_time.reduce((a, b) => a + b, 0) / d.episode_run_time.length
    );
  } else if (type === 'tv') {
    tracked.episodeRuntime = tracked.episodeRuntime || 50;
  }
  meta.episodeRuntime = tracked.episodeRuntime;
  saveItem(tracked);

  // Hero
  const backdrop = img(d.backdrop_path, 'w780');
  page.appendChild(h(`
    <div class="detail-hero">
      ${backdrop ? `<img class="backdrop" src="${backdrop}" alt="">` : '<div class="backdrop" style="background:var(--surface-2)"></div>'}
      <div class="shade"></div>
      <button class="head-btn" data-nav="back" aria-label="Retour">${I.back}</button>
    </div>
  `));
  bindBack(page);

  const year = mediaYear(d);
  const runtime = type === 'movie'
    ? (d.runtime ? `${Math.floor(d.runtime / 60)}h${String(d.runtime % 60).padStart(2, '0')}` : '')
    : `${d.number_of_seasons} saison${d.number_of_seasons > 1 ? 's' : ''} - ${d.number_of_episodes} ep.`;
  const note = d.vote_average ? d.vote_average.toFixed(1) : null;
  const poster = img(d.poster_path, 'w342');

  page.appendChild(h(`
    <div class="detail-top">
      <div class="poster">${poster ? `<img src="${poster}" alt="">` : `<span class="no-img">${esc(meta.title)}</span>`}</div>
      <div class="detail-id">
        <h1>${esc(meta.title)}</h1>
        <div class="detail-meta">
          ${note ? `<span class="note">&#9733; ${note}</span>` : ''}
          ${year ? `<span>${year}</span>` : ''}
          ${runtime ? `<span>${runtime}</span>` : ''}
          <span>${typeLabel(type, meta.isAnime)}</span>
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
      const seenBtn = h(`<button class="act ${seen ? 'on-seen' : ''}">${seen ? I.check : I.eye}<span>${seen ? 'Vu' : 'Marquer vu'}</span></button>`);
      seenBtn.addEventListener('click', async () => {
        if (type === 'movie') {
          const cur = getItem(type, d.id)?.plays || 0;
          await setMoviePlays(meta, cur > 0 ? 0 : 1);
          toast(cur > 0 ? 'Marque non vu' : 'Marque comme vu');
        } else {
          const target = !seen;
          for (const s of d.seasons || []) {
            if (s.season_number === 0) continue;
            const eps = Array.from({ length: s.episode_count }, (_, i) => i + 1);
            await markSeason(meta, s.season_number, eps, target ? 'all' : 'none');
          }
          updateItemTotals(meta, d);
          await syncTvRuntimes(meta, d.id);
          toast(target ? 'Serie marquee comme vue' : 'Serie marquee non vue');
          renderSeasons();
        }
        renderActions();
        renderPlaysBar();
      });
      btns.push(seenBtn);
    }

    const favBtn = h(`<button class="act ${fav ? 'on-fav' : ''}">${fav ? I.heartFill : I.heart}<span>Favori</span></button>`);
    const wlBtn = h(`<button class="act ${wl ? 'on-list' : ''}">${wl ? I.bookmarkFill : I.bookmark}<span>Watchlist</span></button>`);
    const plBtn = h(`<button class="act">${I.plus}<span>Playlist</span></button>`);

    favBtn.addEventListener('click', async () => { await toggleFavorite(meta); renderActions(); });
    wlBtn.addEventListener('click', async () => { await toggleWatchlist(meta); renderActions(); });
    plBtn.addEventListener('click', () => openPlaylistSheet(meta));

    btns.push(favBtn, wlBtn, plBtn);
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
          <span class="lbl">Visionnages</span>
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
          <span class="lbl">${p.watched}${p.total ? '/' + p.total : ''} ep. vus</span>
          <span class="lbl plays-bar-extra">${plays ? `${plays} visionnage${plays > 1 ? 's' : ''}` : '&nbsp;'}</span>
        </div>
      `));
    }
  }

  renderActions();
  renderPlaysBar();

  // ---- Synopsis ----
  if (d.overview) {
    const ov = h(`<p class="overview clamp">${esc(d.overview)}</p>`);
    const moreBtn = h('<button class="overview-more">Lire la suite</button>');
    moreBtn.addEventListener('click', () => {
      const clamped = ov.classList.toggle('clamp');
      moreBtn.textContent = clamped ? 'Lire la suite' : 'Reduire';
    });
    const s = section('Synopsis', ov);
    s.querySelector('.section-pad').appendChild(moreBtn);
    page.appendChild(s);
  }

  // ---- Saisons (series) ----
  const seasonsHolder = h('<div></div>');
  page.appendChild(seasonsHolder);

  function renderSeasons() {
    if (type !== 'tv') return;
    seasonsHolder.innerHTML = '';
    const seasonBody = h('<div></div>');
    const wrap = section('Episodes', seasonBody);
    seasonsHolder.appendChild(wrap);

    for (const s of d.seasons || []) {
      if (s.season_number === 0) continue;
      seasonBody.appendChild(seasonBlock(meta, d, s, () => { renderActions(); renderPlaysBar(); }));
    }
  }
  renderSeasons();

  // ---- Saga / Univers ----
  loadSagaSections(page, d, type, id);

  // ---- Recommandations ----
  const recos = (d.recommendations?.results || []).filter((m) => m.media_type !== 'person').slice(0, 20);
  if (recos.length) {
    const sec = mediaSection('Recommandations', recos, type, `reco-${type}-${id}`);
    if (sec) page.appendChild(sec);
  }
}

async function loadSagaSections(page, d, type, id) {
  const collectionId = d.belongs_to_collection?.id;
  const universe = findUniverse({ type, tmdbId: id, collectionId });
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
          <span class="name">${esc(s.name || 'Saison ' + s.season_number)}</span>
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
      toast('Saison marquee non vue');
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
          <div class="n">${esc(ep.name || 'Episode ' + ep.episode_number)}</div>
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
      body.appendChild(h('<p style="padding:12px 14px;color:var(--text-muted);font-size:13px">Episodes indisponibles hors ligne.</p>'));
      return;
    }
    sp.remove();

    const tools = h(`
      <div class="season-tools">
        <button class="mini-btn seen">Tout marquer vu</button>
        <button class="mini-btn seen">+1 revisionnage</button>
        <button class="mini-btn">Tout effacer</button>
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
    reBtn.addEventListener('click', async () => { await markSeason(meta, s.season_number, nums(), 'rewatch'); updateItemTotals(meta, detail); redraw(); toast('+1 visionnage sur la saison'); });
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
  page.appendChild(pageHead('Watchlist', { back: true }));
  bindBack(page);
  v.appendChild(page);

  const chips = h(`
    <div class="chips">
      <button class="chip on" data-f="all">Tout</button>
      <button class="chip" data-f="movie">Films</button>
      <button class="chip" data-f="tv">Series</button>
      <button class="chip" data-f="anime">Animes</button>
    </div>
  `);
  const list = h('<div class="media-list"></div>');
  page.append(chips, list);

  let filter = 'all';

  function draw() {
    list.innerHTML = '';
    let items = [...state.items.values()].filter((i) => i.watchlist);
    if (filter === 'movie') items = items.filter((i) => i.type === 'movie' && !i.isAnime);
    if (filter === 'tv') items = items.filter((i) => i.type === 'tv' && !i.isAnime);
    if (filter === 'anime') items = items.filter((i) => i.isAnime);
    items.sort((a, b) => b.updatedAt - a.updatedAt);

    if (!items.length) {
      list.appendChild(emptyState('bookmark', 'Watchlist vide', 'Ajoute des films et series a voir plus tard.'));
      return;
    }
    for (const it of items) {
      const row = mediaListRow(it, {
        btnIcon: I.x,
        onBtn: async () => {
          it.watchlist = false;
          await saveItem(it);
          toast('Retire de la watchlist');
          draw();
        },
      });
      list.appendChild(row);
    }
  }

  chips.querySelectorAll('.chip').forEach((c) =>
    c.addEventListener('click', () => {
      filter = c.dataset.f;
      chips.querySelectorAll('.chip').forEach((x) => x.classList.remove('on'));
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
  page.appendChild(pageHead('Playlists', { back: true }));
  bindBack(page);
  v.appendChild(page);

  const list = h('<div class="media-list" style="margin-top:8px"></div>');
  page.appendChild(list);

  function draw() {
    list.innerHTML = '';
    const pls = [...state.playlists.values()].sort((a, b) => a.createdAt - b.createdAt);
    if (!pls.length) {
      list.appendChild(emptyState('list', 'Aucune playlist', 'Cree des collections : "A voir en famille", "Halloween"...'));
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
            <span class="s" style="display:block">${pl.items.length} titre${pl.items.length > 1 ? 's' : ''}</span>
          </span>
          <span style="color:var(--text-faint)">${I.chevRight}</span>
        </a>
      `);
      list.appendChild(card);
    }
    const add = h(`<button class="btn ghost" style="margin:14px 18px 0;width:calc(100% - 36px)">${'Nouvelle playlist'}</button>`);
    add.addEventListener('click', () => {
      const box = h('<div><h3>Nouvelle playlist</h3></div>');
      const input = h('<input class="sheet-input" placeholder="Nom de la playlist">');
      const ok = h('<button class="btn">Creer</button>');
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
    page.appendChild(pageHead('Playlist', { back: true }));
    bindBack(page);
    page.appendChild(emptyState('list', 'Playlist introuvable'));
    return;
  }

  const head = h(`
    <div class="page-head">
      <div style="display:flex;align-items:center;gap:12px;min-width:0">
        <button class="head-btn" data-nav="back" aria-label="Retour">${I.back}</button>
        <h1 class="page-title" style="font-size:24px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(pl.name)}</h1>
      </div>
      <div class="head-actions">
        <button class="head-btn" data-act="menu" aria-label="Options">${I.edit}</button>
      </div>
    </div>
  `);
  page.appendChild(head);
  bindBack(page);

  head.querySelector('[data-act="menu"]').addEventListener('click', () => {
    const box = h(`<div><h3>${esc(pl.name)}</h3></div>`);
    const rename = h(`<button class="sheet-opt">${I.edit}<span>Renommer</span></button>`);
    const del = h(`<button class="sheet-opt accent">${I.trash}<span>Supprimer la playlist</span></button>`);
    box.append(rename, del);
    const close = openSheet(box);
    rename.addEventListener('click', () => {
      const input = h(`<input class="sheet-input" value="${esc(pl.name)}">`);
      const ok = h('<button class="btn">Renommer</button>');
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
      if (!confirm(`Supprimer "${pl.name}" ?`)) return;
      await deletePlaylist(id);
      close();
      toast('Playlist supprimee');
      location.hash = '#/playlists';
    });
  });

  const list = h('<div class="media-list"></div>');
  page.appendChild(list);

  function draw() {
    list.innerHTML = '';
    if (!pl.items.length) {
      list.appendChild(emptyState('list', 'Playlist vide', 'Ajoute des titres depuis leur fiche.'));
      return;
    }
    for (const entry of pl.items) {
      const it = state.items.get(entry.id) || entry;
      const row = mediaListRow({ ...entry, isAnime: it.isAnime }, {
        btnIcon: I.x,
        onBtn: async () => {
          pl.items = pl.items.filter((x) => x.id !== entry.id);
          await savePlaylist(pl);
          toast('Retire de la playlist');
          draw();
        },
      });
      list.appendChild(row);
    }
  }
  draw();
}

/* ============================== PROFIL ============================== */

export function renderProfile() {
  const v = $view();
  v.innerHTML = '';
  const page = h('<div class="page"></div>');
  page.appendChild(pageHead('Profil'));
  v.appendChild(page);

  const s = computeStats();

  const statsEl = h(`
    <div class="stats-grid">
      <a class="stat hl" href="#/library/movies-seen"><div class="v">${s.moviesSeen.length}</div><div class="l">Films vus</div></a>
      <a class="stat hl" href="#/library/series-followed"><div class="v">${s.tvStarted.length}</div><div class="l">Series suivies</div></a>
      <a class="stat gr" href="#/stats"><div class="v">${s.epsSeen}</div><div class="l">Episodes vus</div></a>
      <a class="stat gr" href="#/stats"><div class="v">${s.rewatches}</div><div class="l">Revisionnages</div></a>
      <a class="stat" href="#/library/favorites"><div class="v">${s.favs.length}</div><div class="l">Favoris</div></a>
      <a class="stat" href="#/playlists"><div class="v">${state.playlists.size}</div><div class="l">Playlists</div></a>
    </div>
  `);
  page.appendChild(statsEl);

  const settings = h('<div class="settings-list"></div>');
  page.appendChild(settings);

  const links = [
    ['bookmark', 'Ma watchlist', () => (location.hash = '#/watchlist')],
    ['list', 'Mes playlists', () => (location.hash = '#/playlists')],
    ['popcorn', 'Mes statistiques', () => (location.hash = '#/stats')],
    ['download', 'Exporter mes donnees (JSON)', doExport],
    ['upload', 'Importer une sauvegarde', doImport],
  ];
  for (const [icon, label, fn] of links) {
    const row = h(`<button class="set-row">${I[icon]}<span>${label}</span><span class="chev">${I.chevRight}</span></button>`);
    row.addEventListener('click', fn);
    settings.appendChild(row);
  }

  page.appendChild(h(`
    <p class="credit">
      Donnees stockees sur cet appareil (IndexedDB + copie de secours locale).<br>
      Pour ne pas perdre tes donnees, exporte-les regulierement depuis ce menu.<br>
      Ce produit utilise l'API TMDB mais n'est ni approuve ni certifie par TMDB.
    </p>
  `));

  function doExport() {
    const blob = new Blob([exportJson()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `bobine-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Export lance');
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
        toast(`Importe : ${res.items} titres, ${res.playlists} playlists`);
        renderProfile();
      } catch (e) {
        toast('Import impossible : ' + e.message);
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
        <button class="head-btn" data-nav="back" aria-label="Retour">${I.back}</button>
        <h1 class="page-title">Recherche</h1>
      </div>
    </div>
  `));
  bindBack(page);

  const bar = h(`
    <div class="search-bar">
      ${I.search}
      <input type="search" placeholder="Film, serie, anime..." autocomplete="off" enterkeyhint="search">
    </div>
  `);
  const suggestTitle = h('<h2 class="search-suggest-title">Tendances</h2>');
  const results = h('<div class="grid"></div>');
  page.append(bar, suggestTitle, results);

  const input = bar.querySelector('input');
  let timer = null;
  let seq = 0;

  function draw(list, showTitle = false) {
    results.innerHTML = '';
    suggestTitle.style.display = showTitle ? '' : 'none';
    if (!list.length) {
      if (input.value.trim()) results.appendChild(emptyState('search', 'Aucun resultat', 'Essaie une autre orthographe.'));
      return;
    }
    const usable = list.length - (list.length % 3);
    for (const m of list.slice(0, usable)) {
      if (m.media_type === 'person') continue;
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
      results.appendChild(emptyState('search', 'Hors ligne', "La recherche a besoin d'une connexion."));
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
  page.appendChild(pageHead('Statistiques', { back: true }));
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
        <div class="stats-hero-lbl">Temps total devant l'ecran</div>
        <div class="stats-hero-val">${formatDuration(s.totalMinutes)}</div>
        <div class="stats-hero-sub">Durees reelles TMDB par episode</div>
      </div>
      <div class="stats-breakdown">
        <div class="stats-row"><span>Films</span><strong>${formatDuration(s.movieMinutes)}</strong></div>
        <div class="stats-row"><span>Series</span><strong>${formatDuration(s.tvMinutes)}</strong></div>
        <div class="stats-row"><span>Animes</span><strong>${formatDuration(s.animeMinutes)}</strong></div>
      </div>
      <div class="stats-grid stats-grid--detail">
        <div class="stat"><div class="v">${s.moviesSeen.length}</div><div class="l">Films vus</div></div>
        <div class="stat"><div class="v">${s.moviePlays}</div><div class="l">Visionnages films</div></div>
        <div class="stat"><div class="v">${s.tvStarted.length}</div><div class="l">Series suivies</div></div>
        <div class="stat"><div class="v">${s.epsSeen}</div><div class="l">Episodes vus</div></div>
        <div class="stat"><div class="v">${animeMovies}</div><div class="l">Films anime vus</div></div>
        <div class="stat"><div class="v">${animeEps}</div><div class="l">Ep. anime vus</div></div>
        <div class="stat"><div class="v">${s.rewatches}</div><div class="l">Revisionnages</div></div>
        <div class="stat"><div class="v">${s.favs.length}</div><div class="l">Favoris</div></div>
      </div>
    </div>
  `));
}

/* ============================== BIBLIOTHEQUE FILTRE ============================== */

const LIBRARY_CFG = {
  'movies-seen': {
    title: 'Films vus',
    filter: (i) => i.type === 'movie' && !i.isAnime && i.plays > 0,
    sub: (i) => `${i.plays} visionnage${i.plays > 1 ? 's' : ''}${i.year ? ' - ' + i.year : ''}`,
  },
  'series-followed': {
    title: 'Series suivies',
    filter: (i) => i.type === 'tv' && !i.isAnime && watchedEpisodeCount(i) > 0,
    sub: (i) => {
      const p = tvProgress(i);
      return `${p.watched} ep. vu${p.watched > 1 ? 's' : ''}${p.total ? ' / ' + p.total : ''}`;
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
  page.appendChild(pageHead(cfg?.title || 'Bibliotheque', { back: true }));
  bindBack(page);
  v.appendChild(page);

  const list = h('<div class="media-list"></div>');
  page.appendChild(list);

  if (!cfg) {
    list.appendChild(emptyState('list', 'Page introuvable'));
    return;
  }

  const items = [...state.items.values()]
    .filter(cfg.filter)
    .sort((a, b) => b.updatedAt - a.updatedAt);

  if (!items.length) {
    list.appendChild(emptyState('popcorn', 'Rien ici pour le moment', 'Tes ajouts apparaitront ici.'));
    return;
  }

  for (const it of items) {
    list.appendChild(mediaListRow(it, { sub: cfg.sub(it) }));
  }
}

/* ============================== LISTING (tout voir) ============================== */

export function renderListing(id) {
  const v = $view();
  v.innerHTML = '';
  const page = h('<div class="page"></div>');
  page.appendChild(pageHead('Liste', { back: true }));
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
    grid.appendChild(emptyState('list', 'Liste introuvable', 'Reviens en arriere et reessaie.'));
    return;
  }

  page.querySelector('.page-title').textContent = data.title;
  const type = data.type;
  const items = data.items;
  const count = items.length - (items.length % 3 || 0) || items.length;
  for (const m of items.slice(0, count)) {
    const t = type === 'mixed' ? (m.media_type || (m.title ? 'movie' : 'tv')) : type;
    grid.appendChild(posterCard(m, { type: t, sub: mediaYear(m) }));
  }
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
  page.appendChild(pageHead('Chargement...', { back: true }));
  bindBack(page);
  v.appendChild(page);

  const grid = h('<div class="grid"></div>');
  const moreWrap = h('<div class="loadmore-wrap"></div>');
  const more = h('<button class="btn ghost loadmore">Charger plus</button>');
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
        grid.appendChild(emptyState('film', 'Hors ligne', 'Impossible de charger TMDB.'));
      }
      moreWrap.style.display = 'none';
    }
    sp.remove();
    loading = false;
  }

  more.addEventListener('click', () => load(false));
  load(true);
}
