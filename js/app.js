// Bobine - point d'entree : router + tab bar
import { loadState } from './db.js';
import { h, I, posterCard } from './ui.js';
import { openQuickSheet } from './actions.js';
import {
  renderHome, renderCatalog, renderDetail, renderWatchlist,
  renderPlaylists, renderPlaylist, renderProfile, renderSearch,
  renderStats, renderLibrary, renderListing, renderBrowse,
} from './views.js';

const TABS = [
  { hash: '#/home', label: 'Accueil', icon: 'home' },
  { hash: '#/movies', label: 'Films', icon: 'film' },
  { hash: '#/series', label: 'Series', icon: 'tv' },
  { hash: '#/anime', label: 'Animes', icon: 'anime' },
  { hash: '#/profile', label: 'Profil', icon: 'user' },
];

function buildTabbar() {
  const bar = document.getElementById('tabbar');
  for (const t of TABS) {
    bar.appendChild(h(`
      <a class="tab" href="${t.hash}" data-hash="${t.hash}">
        ${I[t.icon]}
        <span>${t.label}</span>
      </a>
    `));
  }
}

function syncTabbar(hash) {
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('on', hash.startsWith(t.dataset.hash));
  });
}

// Position de scroll memorisee par onglet
const scrollPos = new Map();
let currentHash = '';

function route() {
  if (currentHash) scrollPos.set(currentHash, window.scrollY);
  const hash = location.hash || '#/home';
  currentHash = hash;
  const [, path, a, b, c] = hash.split('/'); // '#', path, args

  document.getElementById('overlay-root').innerHTML = '';
  syncTabbar(hash);

  switch (path) {
    case 'home': renderHome(); break;
    case 'movies': renderCatalog('movies'); break;
    case 'series': renderCatalog('series'); break;
    case 'anime': renderCatalog('anime'); break;
    case 'profile': renderProfile(); break;
    case 'watchlist': renderWatchlist(); break;
    case 'playlists': renderPlaylists(); break;
    case 'playlist': renderPlaylist(a); break;
    case 'detail': renderDetail(a, Number(b)); break;
    case 'search': renderSearch(); break;
    case 'stats': renderStats(); break;
    case 'library': renderLibrary(a); break;
    case 'listing': renderListing(a); break;
    case 'browse': renderBrowse(a, Number(b), c); break;
    default: renderHome();
  }

  requestAnimationFrame(() => {
    window.scrollTo(0, scrollPos.get(hash) || 0);
  });
}

// Bouton + sur les affiches : sheet d'actions rapides sans ouvrir la fiche.
// Delegation globale pour couvrir toutes les cartes, ou qu'elles soient.
function bindQuickActions() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.card-quick');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const card = btn.closest('.card');
    if (!card) return;
    const ds = card.dataset;
    const meta = {
      type: ds.qtype,
      tmdbId: Number(ds.qid),
      title: ds.qtitle,
      poster: ds.qposter || null,
      backdrop: ds.qbackdrop || null,
      year: ds.qyear || '',
      isAnime: ds.qanime === '1',
    };
    // apres chaque action, la carte est redessinee (badges / progression)
    let current = card;
    openQuickSheet(meta, () => {
      const fresh = posterCard(
        { id: meta.tmdbId, title: meta.title, poster_path: meta.poster, backdrop_path: meta.backdrop, year: meta.year, isAnime: meta.isAnime },
        { type: meta.type, sub: ds.qsub || '' }
      );
      current.replaceWith(fresh);
      current = fresh;
    });
  });
}

// Slide depuis le bord gauche = retour arriere (comme le geste natif iOS,
// absent en PWA plein ecran)
function bindEdgeSwipeBack() {
  let start = null;
  window.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    start = t.clientX <= 32 ? { x: t.clientX, y: t.clientY } : null;
    // pas de retour si une sheet est ouverte
    if (document.getElementById('overlay-root').children.length) start = null;
  }, { passive: true });
  window.addEventListener('touchend', (e) => {
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = Math.abs(t.clientY - start.y);
    if (dx > 70 && dy < 60) history.back();
    start = null;
  }, { passive: true });
}

async function boot() {
  buildTabbar();
  bindQuickActions();
  bindEdgeSwipeBack();
  if (navigator.storage?.persist) {
    try { await navigator.storage.persist(); } catch { /* ignore */ }
  }
  await loadState();
  if (!location.hash) location.hash = '#/home';
  route();
  window.addEventListener('hashchange', route);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

boot();
