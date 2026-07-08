// Helpers UI : icones, cartes, sheets, toasts.
import { img } from './api.js';
import { getItem, isSeen, isStarted, tvProgress, totalEpisodePlays } from './db.js';

// ---- Icones (SVG inline, traits 2px) ----

export const I = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>',
  film: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/></svg>',
  tv: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="m8 2 4 4 4-4"/></svg>',
  anime: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c5 0 9 3.6 9 8s-4 8-9 8c-1 0-2-.14-2.9-.4L5 21l1-3.5C4.2 16 3 13.7 3 11c0-4.4 4-8 9-8Z"/><path d="M8.5 10.5h.01M15.5 10.5h.01M9.5 14s1 1 2.5 1 2.5-1 2.5-1"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
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
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg>',
  rows: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="5" height="6" rx="1"/><path d="M12 6h8M12 9h5"/><rect x="4" y="14" width="5" height="6" rx="1"/><path d="M12 16h8M12 19h5"/></svg>',
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
  if (anime) return 'Anime';
  return type === 'movie' ? 'Film' : 'Serie';
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
    badges += `<span class="badge badge-seen">${plays > 1 ? 'x' + plays : 'VU'}</span>`;
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

  // data-q* : meta pour l'action rapide (bouton +), lue par app.js en delegation
  return h(`
    <a class="card ${opts.wide ? 'card-lg' : ''}" href="#/detail/${type}/${id}"
       data-qtype="${type}" data-qid="${id}" data-qtitle="${esc(title)}"
       data-qposter="${esc(posterPath || '')}" data-qbackdrop="${esc(backdropPath || '')}"
       data-qyear="${esc(year)}" data-qanime="${(opts.isAnime ?? isAnimeLike(media)) ? 1 : 0}"
       data-qsub="${esc(sub)}">
      <div class="poster">
        ${badges}${imgHtml}${progress}
        <button class="card-quick" type="button" aria-label="Actions rapides">${I.plus}</button>
      </div>
      <div class="card-title">${esc(title)}</div>
      ${sub ? `<div class="card-sub">${esc(sub)}</div>` : ''}
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
