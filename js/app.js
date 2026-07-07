// Bobine - point d'entree : router + tab bar
import { loadState } from './db.js';
import { h, I } from './ui.js';
import {
  renderHome, renderCatalog, renderDetail, renderWatchlist,
  renderPlaylists, renderPlaylist, renderProfile, renderSearch,
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
  const [, path, a, b] = hash.split('/'); // '#', path, args

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
    default: renderHome();
  }

  requestAnimationFrame(() => {
    window.scrollTo(0, scrollPos.get(hash) || 0);
  });
}

async function boot() {
  buildTabbar();
  await loadState();
  if (!location.hash) location.hash = '#/home';
  route();
  window.addEventListener('hashchange', route);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

boot();
