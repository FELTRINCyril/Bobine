// Helpers UI : icones, cartes, sheets, toasts.
import { img } from './api.js';
import { tr } from './i18n.js';
import { getItem, isSeen, isStarted, tvProgress, totalEpisodePlays } from './db.js';

// ---- Icones (SVG inline, traits 2px) ----

export const I = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>',
  film: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/></svg>',
  tv: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="m8 2 4 4 4-4"/></svg>',
  anime: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c5 0 9 3.6 9 8s-4 8-9 8c-1 0-2-.14-2.9-.4L5 21l1-3.5C4.2 16 3 13.7 3 11c0-4.4 4-8 9-8Z"/><path d="M8.5 10.5h.01M15.5 10.5h.01M9.5 14s1 1 2.5 1 2.5-1 2.5-1"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="6.2"/><path d="m19.6 19.6-3.3-3.3"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20.5s-7.5-4.7-9.3-9.2C1.3 7.7 3.6 4.5 7 4.5c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.4 0 5.7 3.2 4.3 6.8-1.8 4.5-9.3 9.2-9.3 9.2Z"/></svg>',
  heartFill: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 20.5s-7.5-4.7-9.3-9.2C1.3 7.7 3.6 4.5 7 4.5c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.4 0 5.7 3.2 4.3 6.8-1.8 4.5-9.3 9.2-9.3 9.2Z"/></svg>',
  bookmark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12v18l-6-4.5L6 21V3Z"/></svg>',
  bookmarkFill: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 3h12v18l-6-4.5L6 21V3Z"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m4.5 12.5 5 5 10-11"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="2.8"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h12M4 12h12M4 18h8"/><path d="m19 15 0 6M16 18h6" stroke-width="2"/></svg>',
  chevDown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
  chevRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m14 6-6 6 6 6"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L20 8l-4-4L4 16v4Z"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11m0 0 4-4m-4 4-4-4"/><path d="M5 20h14"/></svg>',
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4m0 0 4 4m-4-4-4 4"/><path d="M5 20h14"/></svg>',
  popcorn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9 7.5 21h9L18 9"/><path d="M5 9h14"/><path d="M7 6a2.5 2.5 0 0 1 3.4-2.3A2.5 2.5 0 0 1 14 2.6 2.5 2.5 0 0 1 17.5 6"/><path d="M10 9l.7 12M14 9l-.7 12"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v14.72a1 1 0 0 0 1.5.86l11.02-7.36a1 1 0 0 0 0-1.72L9.5 4.28A1 1 0 0 0 8 5.14Z"/></svg>',
  grid: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="4.5" y="4.5" width="6.2" height="6.2" rx="2"/><rect x="13.3" y="4.5" width="6.2" height="6.2" rx="2"/><rect x="4.5" y="13.3" width="6.2" height="6.2" rx="2"/><rect x="13.3" y="13.3" width="6.2" height="6.2" rx="2"/></svg>',
  rows: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 6.5h14M5 12h14M5 17.5h14"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M19 12a7 7 0 0 0-.14-1.4l2-1.55-2-3.46-2.35.95a7 7 0 0 0-2.42-1.4L13.7 2.6h-3.4l-.39 2.54a7 7 0 0 0-2.42 1.4l-2.35-.95-2 3.46 2 1.55A7 7 0 0 0 5 12c0 .48.05.94.14 1.4l-2 1.55 2 3.46 2.35-.95a7 7 0 0 0 2.42 1.4l.39 2.54h3.4l.39-2.54a7 7 0 0 0 2.42-1.4l2.35.95 2-3.46-2-1.55c.09-.46.14-.92.14-1.4Z"/></svg>',
  arrowUp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5m0 0-6 6m6-6 6 6"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.34 6.06"/><path d="M20 5v6h-6"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5 5l1.7 1.7M17.3 17.3 19 19M19 5l-1.7 1.7M6.7 17.3 5 19"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z"/></svg>',
  globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.7 2.6 4 5.6 4 9s-1.3 6.4-4 9c-2.7-2.6-4-5.6-4-9s1.3-6.4 4-9Z"/></svg>',
  sliders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 6.5h6M15 6.5h4M5 12h2M11 12h8M5 17.5h9M18 17.5h1"/><circle cx="13" cy="6.5" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="16" cy="17.5" r="2"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 10v6M12 7h.01"/></svg>',
};

// ---- Helpers DOM ----

export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function mediaTitle(m) {
  return m.title || m.name || '';
}

export function mediaYear(m) {
  const d = m.release_date || m.first_air_date || '';
  return d ? d.slice(0, 4) : '';
}

export function mediaType(m) {
  return m.media_type || (m.title || m.release_date !== undefined ? 'movie' : 'tv');
}

export function typeLabel(type, anime) {
  if (anime) return tr('Anime');
  return type === 'movie' ? tr('Film') : tr('Serie');
}

export function isReleased(m) {
  const d = m.release_date || m.first_air_date;
  if (!d) return true;
  return d <= new Date().toISOString().slice(0, 10);
}

// ---- Carte affiche ----
// media : objet TMDB (ou item local reconstruit). opts: {sub, wide}

export function posterCard(media, opts = {}) {
  const type = opts.type || mediaType(media);
  const id = media.id || media.tmdbId;
  const title = mediaTitle(media) || media.title;
  const posterPath = media.poster_path !== undefined ? media.poster_path : media.poster;
  const it = getItem(type, id);

  let badges = '';
  if (it?.favorite) badges += `<span class="badge badge-fav">${I.heartFill}</span>`;
  if (it && isSeen(it)) {
    const plays = it.type === 'movie' ? it.plays : 0;
    badges += `<span class="badge badge-seen">${plays > 1 ? 'x' + plays : tr('VU')}</span>`;
  }

  let progress = '';
  if (it && it.type === 'tv' && isStarted(it)) {
    const p = tvProgress(it);
    const pct = p.total ? Math.round(p.ratio * 100) : 35;
    progress = `<div class="progress ${p.total && p.watched >= p.total ? 'done' : ''}"><i style="width:${pct}%"></i></div>`;
  }

  const src = img(posterPath, 'w342');
  const imgHtml = src
    ? `<img src="${src}" alt="" loading="lazy">`
    : `<span class="no-img">${esc(title)}</span>`;

  const sub = opts.sub !== undefined ? opts.sub : mediaYear(media) || media.year || '';
  const backdropPath = media.backdrop_path !== undefined ? media.backdrop_path : media.backdrop;
  const year = mediaYear(media) || media.year || '';

  const inLib = !!it?.watchlist;
  const quickBtn = opts.noQuick ? '' : `
    <button class="card-quick ${inLib ? 'on' : ''}" type="button"
            aria-label="${inLib ? tr('Retirer de ma liste') : tr('Ajouter a ma liste')}">
      ${inLib ? I.check : I.plus}
    </button>`;

  // data-q* : meta pour le bouton watchlist rapide et le rafraichissement
  // des cartes restaurees depuis le cache de pages (app.js)
  return h(`
    <a class="card ${opts.wide ? 'card-lg' : ''}" href="#/detail/${type}/${id}"
       data-qtype="${type}" data-qid="${id}" data-qtitle="${esc(title)}"
       data-qposter="${esc(posterPath || '')}" data-qbackdrop="${esc(backdropPath || '')}"
       data-qyear="${esc(year)}" data-qanime="${(opts.isAnime ?? isAnimeLike(media)) ? 1 : 0}"
       data-qsub="${esc(sub)}" data-qnoquick="${opts.noQuick ? 1 : 0}">
      <div class="poster">
        ${badges}${imgHtml}${progress}${quickBtn}
      </div>
      <div class="card-title">${esc(title)}</div>
      ${sub ? `<div class="card-sub">${esc(sub)}</div>` : ''}
    </a>
  `);
}

// ---- Carte acteur ----

export function castCard(p) {
  const src = img(p.profile_path, 'w185');
  return h(`
    <a class="cast-card" href="#/person/${p.id}">
      <div class="cast-photo">${src ? `<img src="${src}" alt="" loading="lazy">` : `<span class="no-img">${esc((p.name || '?').split(' ').map((w) => w[0]).slice(0, 2).join(''))}</span>`}</div>
      <div class="card-title" style="text-align:center">${esc(p.name || '')}</div>
      ${p.character ? `<div class="card-sub" style="text-align:center">${esc(p.character)}</div>` : ''}
    </a>
  `);
}

// Heuristique anime sans dependre d'api.js (evite un import circulaire)
function isAnimeLike(media) {
  if (media.isAnime !== undefined) return !!media.isAnime;
  const genres = media.genre_ids || (media.genres || []).map((g) => g.id);
  const origin = media.origin_country || [];
  return genres.includes?.(16) && (origin.includes?.('JP') || media.original_language === 'ja');
}

// ---- Sheet (panneau bas) ----

export function openSheet(contentEl) {
  const root = document.getElementById('overlay-root');
  const veil = h('<div class="sheet-veil"></div>');
  const sheet = h('<div class="sheet" role="dialog"><div class="grab"></div></div>');
  sheet.appendChild(contentEl);
  root.append(veil, sheet);
  const close = () => {
    veil.remove();
    sheet.remove();
  };
  veil.addEventListener('click', close);
  return close;
}

// ---- Toast ----

const TOAST_MAX = 3;

export function toast(msg) {
  const root = document.getElementById('toast-root');
  while (root.children.length >= TOAST_MAX) {
    root.firstElementChild?.remove();
  }
  const t = h(`<div class="toast">${esc(msg)}</div>`);
  root.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transition = 'opacity 0.25s';
    setTimeout(() => t.remove(), 260);
  }, 1900);
}

// ---- Etat vide ----

export function emptyState(icon, title, sub) {
  return h(`
    <div class="empty">
      ${I[icon] || ''}
      <div class="t">${esc(title)}</div>
      ${sub ? `<div class="s">${esc(sub)}</div>` : ''}
    </div>
  `);
}

export function spinner() {
  return h('<div class="spinner" role="status" aria-label="Chargement"></div>');
}
