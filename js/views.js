// Vues / pages de l'app
import { api, img, isAnime } from './api.js';
import {
  state, getItem, saveItem, isSeen, isStarted, tvProgress,
  watchedEpisodeCount, totalEpisodePlays,
  savePlaylist, deletePlaylist, createPlaylist,
  exportJson, importJson,
} from './db.js';
import {
  h, esc, I, posterCard, openSheet, toast, emptyState, spinner,
  mediaTitle, mediaYear, mediaType, typeLabel,
} from './ui.js';
import {
  toggleFavorite, toggleWatchlist, setMoviePlays, setEpisodePlays,
  markSeason, updateItemTotals, openPlaylistSheet,
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
  const row = h('<div class="hscroll"></div>');
  for (const m of medias) row.appendChild(posterCard(m, { type, ...opts }));
  return row;
}

function section(title, contentEl, linkHash) {
  const s = h(`
    <section class="section">
      <div class="section-head">
        <h2 class="section-title">${title}</h2>
        ${linkHash ? `<a class="section-link" href="${linkHash}">Tout voir</a>` : ''}
      </div>
    </section>
  `);
  s.appendChild(contentEl);
  return s;
}

// Reconstruit un pseudo-media TMDB depuis un item local (pour posterCard)
function mediaFromItem(it) {
  return { id: it.tmdbId, title: it.title, poster_path: it.poster, year: it.year };
}

/* ============================== ACCUEIL ============================== */

export async function renderHome() {
  const v = $view();
  v.innerHTML = '';
  const page = h('<div class="page"></div>');
  page.appendChild(pageHead('Bobine<span class="tick">.</span>'));
  v.appendChild(page);

  // Raccourcis
  const wlCount = [...state.items.values()].filter((i) => i.watchlist).length;
  const plCount = state.playlists.size;
  const quick = h(`
    <div class="quick-row">
      <a class="quick" href="#/watchlist">${I.bookmark}<span>Watchlist</span><span class="count">${wlCount}</span></a>
      <a class="quick" href="#/playlists">${I.list}<span>Playlists</span><span class="count">${plCount}</span></a>
    </div>
  `);
  page.appendChild(quick);

  // En cours (series commencees, pas terminees)
  const started = [...state.items.values()]
    .filter((i) => i.type === 'tv' && isStarted(i) && !isSeen(i))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 10);
  if (started.length) {
    const row = h('<div class="hscroll"></div>');
    for (const it of started) {
      const p = tvProgress(it);
      const pct = p.total ? Math.round(p.ratio * 100) : 30;
      const src = img(it.backdrop || it.poster, 'w500');
      row.appendChild(h(`
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
    page.appendChild(section('Reprendre', row));
  }

  // Watchlist apercu
  const wl = [...state.items.values()]
    .filter((i) => i.watchlist)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 12);
  if (wl.length) {
    const row = h('<div class="hscroll"></div>');
    for (const it of wl) row.appendChild(posterCard(mediaFromItem(it), { type: it.type, sub: typeLabel(it.type, it.isAnime) }));
    page.appendChild(section('Ma watchlist', row, '#/watchlist'));
  }

  // Tendances (reseau)
  const slots = [
    ['Tendances films', () => api.trending('movie'), 'movie', '#/movies'],
    ['Tendances series', () => api.trending('tv'), 'tv', '#/series'],
    ['Animes populaires', () => api.discoverAnime(), 'tv', '#/anime'],
  ];
  for (const [title, fetcher, type, link] of slots) {
    const holder = h('<div></div>');
    holder.appendChild(spinner());
    page.appendChild(section(title, holder, link));
    fetcher()
      .then((data) => {
        holder.innerHTML = '';
        holder.appendChild(hRow(data.results.slice(0, 12), type));
      })
      .catch(() => {
        holder.innerHTML = '';
        holder.appendChild(emptyState('film', 'Hors ligne', 'Impossible de charger TMDB.'));
      });
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
  const more = h('<button class="btn ghost loadmore">Charger plus</button>');
  page.append(chipsEl, grid, more);
  v.appendChild(page);

  let current = cfg.chips[0];
  let pageNum = 1;
  let loading = false;

  async function load(reset) {
    if (loading) return;
    loading = true;
    if (reset) {
      grid.innerHTML = '';
      pageNum = 1;
    }
    const type = current.type || cfg.type;

    if (current.local) {
      more.style.display = 'none';
      const items = [...state.items.values()]
        .filter(current.local)
        .sort((a, b) => b.updatedAt - a.updatedAt);
      if (!items.length) {
        grid.appendChild(emptyState('popcorn', 'Rien ici pour le moment', 'Tes ajouts apparaitront ici.'));
      }
      for (const it of items) {
        grid.appendChild(posterCard(mediaFromItem(it), { type: it.type, sub: typeLabel(it.type, it.isAnime) }));
      }
      loading = false;
      return;
    }

    more.style.display = '';
    const sp = spinner();
    grid.parentElement.insertBefore(sp, more);
    try {
      const data = await current.fetch(pageNum);
      for (const m of data.results) {
        if (m.media_type === 'person') continue;
        grid.appendChild(posterCard(m, { type: m.media_type || type }));
      }
      more.style.display = pageNum >= data.total_pages ? 'none' : '';
      pageNum++;
    } catch {
      grid.appendChild(emptyState('film', 'Hors ligne', 'Impossible de charger TMDB.'));
      more.style.display = 'none';
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
    for (const genre of d.genres.slice(0, 4)) g.appendChild(h(`<span class="genre">${esc(genre.name)}</span>`));
    page.appendChild(g);
  }

  // Memorise les totaux d'episodes si l'item est suivi
  if (type === 'tv') updateItemTotals(meta, d);

  // ---- Actions ----
  const actions = h('<div class="detail-actions"></div>');
  page.appendChild(actions);

  const playsBarHolder = h('<div></div>');
  page.appendChild(playsBarHolder);

  function renderActions() {
    const it = getItem(type, d.id);
    const seen = it ? isSeen(it) : false;
    const fav = it?.favorite;
    const wl = it?.watchlist;
    actions.innerHTML = '';

    const seenBtn = h(`<button class="act ${seen ? 'on-seen' : ''}">${seen ? I.check : I.eye}<span>${seen ? 'Vu' : 'A voir ?'}</span></button>`);
    const favBtn = h(`<button class="act ${fav ? 'on-fav' : ''}">${fav ? I.heartFill : I.heart}<span>Favori</span></button>`);
    const wlBtn = h(`<button class="act ${wl ? 'on-list' : ''}">${wl ? I.bookmarkFill : I.bookmark}<span>Watchlist</span></button>`);
    const plBtn = h(`<button class="act">${I.plus}<span>Playlist</span></button>`);

    seenBtn.addEventListener('click', async () => {
      if (type === 'movie') {
        const cur = getItem(type, d.id)?.plays || 0;
        await setMoviePlays(meta, cur > 0 ? 0 : 1);
        toast(cur > 0 ? 'Marque non vu' : 'Marque comme vu');
      } else {
        // serie : marque toutes les saisons vues / non vues
        const target = !seen;
        for (const s of d.seasons || []) {
          if (s.season_number === 0) continue;
          const eps = Array.from({ length: s.episode_count }, (_, i) => i + 1);
          await markSeason(meta, s.season_number, eps, target ? 'all' : 'none');
        }
        updateItemTotals(meta, d);
        toast(target ? 'Serie marquee comme vue' : 'Serie marquee non vue');
        renderSeasons();
      }
      renderActions();
      renderPlaysBar();
    });
    favBtn.addEventListener('click', async () => { await toggleFavorite(meta); renderActions(); });
    wlBtn.addEventListener('click', async () => { await toggleWatchlist(meta); renderActions(); });
    plBtn.addEventListener('click', () => openPlaylistSheet(meta));

    actions.append(seenBtn, favBtn, wlBtn, plBtn);
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
    } else if (it && totalEpisodePlays(it) > 0) {
      const p = tvProgress(it);
      const plays = totalEpisodePlays(it);
      playsBarHolder.appendChild(h(`
        <div class="plays-bar">
          <span class="lbl">${p.watched}${p.total ? '/' + p.total : ''} ep. vus</span>
          <span class="lbl" style="opacity:0.85">${plays} visionnage${plays > 1 ? 's' : ''}</span>
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
    s.appendChild(moreBtn);
    page.appendChild(s);
  }

  // ---- Saisons (series) ----
  const seasonsHolder = h('<div></div>');
  page.appendChild(seasonsHolder);

  function renderSeasons() {
    if (type !== 'tv') return;
    seasonsHolder.innerHTML = '';
    const wrap = section('Episodes', h('<div></div>'));
    seasonsHolder.appendChild(wrap);
    const body = wrap.lastElementChild;

    for (const s of d.seasons || []) {
      if (s.season_number === 0) continue;
      body.appendChild(seasonBlock(meta, d, s, () => { renderActions(); renderPlaysBar(); }));
    }
  }
  renderSeasons();

  // ---- Recommandations ----
  const recos = (d.recommendations?.results || []).filter((m) => m.media_type !== 'person').slice(0, 12);
  if (recos.length) {
    page.appendChild(section('Recommandations', hRow(recos, type)));
  }
}

function seasonBlock(meta, detail, s, onChange) {
  const it = () => getItem('tv', meta.tmdbId);

  const block = h(`
    <div class="season">
      <button class="season-head">
        <span class="name">${esc(s.name || 'Saison ' + s.season_number)}</span>
        <span class="cnt"></span>
        <span class="chev">${I.chevDown}</span>
      </button>
      <div class="season-progress"><i></i></div>
      <div class="season-body" hidden></div>
    </div>
  `);

  const head = block.querySelector('.season-head');
  const cnt = block.querySelector('.cnt');
  const prog = block.querySelector('.season-progress');
  const body = block.querySelector('.season-body');
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
    onChange?.();
  }
  refreshHead();

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
      updateItemTotals(meta, detail);
      refresh();
      refreshHead();
    });
    playsBtn.addEventListener('click', async () => {
      await setEpisodePlays(meta, s.season_number, ep.episode_number, plays() + 1);
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

  head.addEventListener('click', () => {
    if (body.hidden) openBody();
    else {
      body.hidden = true;
      block.classList.remove('open');
    }
  });

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
  const list = h('<div></div>');
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

  const list = h('<div style="margin-top:8px"></div>');
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

  const list = h('<div></div>');
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

  const items = [...state.items.values()];
  const moviesSeen = items.filter((i) => i.type === 'movie' && i.plays > 0);
  const moviePlays = moviesSeen.reduce((a, i) => a + i.plays, 0);
  const tvStartedItems = items.filter((i) => i.type === 'tv' && watchedEpisodeCount(i) > 0);
  const epsSeen = tvStartedItems.reduce((a, i) => a + watchedEpisodeCount(i), 0);
  const epPlays = tvStartedItems.reduce((a, i) => a + totalEpisodePlays(i), 0);
  const favs = items.filter((i) => i.favorite).length;
  const rewatches = (moviePlays - moviesSeen.length) + (epPlays - epsSeen);

  page.appendChild(h(`
    <div class="stats-grid">
      <div class="stat hl"><div class="v">${moviesSeen.length}</div><div class="l">Films vus</div></div>
      <div class="stat hl"><div class="v">${tvStartedItems.length}</div><div class="l">Series suivies</div></div>
      <div class="stat gr"><div class="v">${epsSeen}</div><div class="l">Episodes vus</div></div>
      <div class="stat gr"><div class="v">${rewatches}</div><div class="l">Revisionnages</div></div>
      <div class="stat"><div class="v">${favs}</div><div class="l">Favoris</div></div>
      <div class="stat"><div class="v">${state.playlists.size}</div><div class="l">Playlists</div></div>
    </div>
  `));

  const settings = h('<div class="settings-list"></div>');
  page.appendChild(settings);

  const links = [
    ['bookmark', 'Ma watchlist', () => (location.hash = '#/watchlist')],
    ['list', 'Mes playlists', () => (location.hash = '#/playlists')],
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
      Donnees stockees uniquement sur cet appareil.<br>
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
  const results = h('<div class="grid"></div>');
  page.append(bar, results);

  const input = bar.querySelector('input');
  let timer = null;
  let seq = 0;

  function draw(list) {
    results.innerHTML = '';
    if (!list.length) {
      if (input.value.trim()) results.appendChild(emptyState('search', 'Aucun resultat', 'Essaie une autre orthographe.'));
      return;
    }
    for (const m of list) {
      if (m.media_type === 'person') continue;
      const type = m.media_type;
      results.appendChild(posterCard(m, { type, sub: [typeLabel(type, isAnime(m)), mediaYear(m)].filter(Boolean).join(' - ') }));
    }
  }

  async function run(q) {
    const my = ++seq;
    if (!q.trim()) { draw([]); return; }
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

  // restaure la derniere recherche
  if (searchLast.q) {
    input.value = searchLast.q;
    draw(searchLast.results);
  }
  setTimeout(() => input.focus(), 80);
}
