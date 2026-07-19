// Bobine - point d'entree : router + tab bar
import { loadState } from './db.js';
import { h, I, posterCard, toast } from './ui.js';
import { tr } from './i18n.js';
import { toggleAdd } from './actions.js';
import {
  renderHome, renderCatalog, renderDetail, renderWatchlist,
  renderPlaylists, renderPlaylist, renderProfile, renderSearch,
  renderStats, renderLibrary, renderListing, renderBrowse,
  renderSettings, renderPerson, renderPeopleFavorites, renderAdvanced, initAppearance,
} from './views.js';
import { isConfigured } from './config.js';
import { renderOnboarding } from './onboarding.js';
import { initSync } from './sync.js';

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
        <span>${tr(t.label)}</span>
      </a>
    `));
  }
  bindTabDoubleTap(bar);
}

// Double-tap rapide sur l'onglet actif = remonter en haut (comportement iOS).
function bindTabDoubleTap(bar) {
  let last = { hash: '', time: 0 };
  const DOUBLE_MS = 450;

  bar.addEventListener('click', (e) => {
    const tab = e.target.closest('a.tab');
    if (!tab) return;
    const hash = tab.dataset.hash;
    const cur = location.hash || '#/home';
    const onTab = cur === hash || (hash === '#/home' && (cur === '' || cur === '#'));
    if (!onTab) {
      last = { hash: '', time: 0 };
      return;
    }
    const now = Date.now();
    if (hash === last.hash && now - last.time < DOUBLE_MS) {
      e.preventDefault();
      last = { hash: '', time: 0 };
      window.scrollTo({ top: 0, behavior: 'smooth' });
      scrollPos.set(hash, 0);
      const cached = pageCache.get(hash);
      if (cached) cached.y = 0;
      return;
    }
    last = { hash, time: now };
  });
}

function syncTabbar(hash) {
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('on', hash.startsWith(t.dataset.hash));
  });
}

// Position de scroll memorisee par onglet
const scrollPos = new Map();
let currentHash = '';
let skipPageAnim = false; // pose par le swipe retour pour eviter le flash

// Cache des pages rendues : en revenant en arriere, on restaure le DOM tel
// quel (donnees "Charger plus" comprises, position de scroll comprise) au
// lieu de re-rendre -> pas de flash, pas de donnees perdues.
// Pages locales (watchlist, playlist...) exclus : elles se re-rendent pour
// rester a jour, mais sans animation d'entree au retour (voir isBack).
// "search" est volontairement exclu : la recherche repart toujours a zero.
const pageCache = new Map(); // hash -> { el, y, hscrolls }
const CACHEABLE = new Set([
  'home', 'movies', 'series', 'anime', 'detail', 'browse', 'listing',
  'person', 'advanced',
]);
const navStack = [];

// Met a jour badges / bouton + sans recreer les <img> (evite le flash).
function refreshCards(root) {
  root.querySelectorAll('a.card[data-qid]').forEach((card) => {
    const ds = card.dataset;
    const fresh = posterCard(
      { id: Number(ds.qid), title: ds.qtitle, poster_path: ds.qposter || null, backdrop_path: ds.qbackdrop || null, year: ds.qyear, isAnime: ds.qanime === '1' },
      { type: ds.qtype, sub: ds.qsub || '', noQuick: ds.qnoquick === '1' }
    );
    const oldPoster = card.querySelector('.poster');
    const newPoster = fresh.querySelector('.poster');
    if (!oldPoster || !newPoster) {
      card.replaceWith(fresh);
      return;
    }
    // Conserve l'image deja chargee
    const oldImg = oldPoster.querySelector('img');
    const newImg = newPoster.querySelector('img');
    if (oldImg && newImg && oldImg.getAttribute('src') === newImg.getAttribute('src')) {
      newImg.replaceWith(oldImg);
    }
    oldPoster.replaceWith(newPoster);
    // titre / sous-titre
    const t = card.querySelector('.card-title');
    const nt = fresh.querySelector('.card-title');
    if (t && nt) t.textContent = nt.textContent;
    const s = card.querySelector('.card-sub');
    const ns = fresh.querySelector('.card-sub');
    if (s && ns) s.textContent = ns.textContent;
    else if (!s && ns) card.appendChild(ns);
    else if (s && !ns) s.remove();
  });
}

function snapshotHscrolls(root) {
  return [...root.querySelectorAll('.hscroll')].map((el) => el.scrollLeft);
}

function restoreHscrolls(root, lefts) {
  if (!lefts?.length) return;
  const rows = root.querySelectorAll('.hscroll');
  lefts.forEach((left, i) => {
    if (rows[i]) rows[i].scrollLeft = left;
  });
}

function route() {
  const view = document.getElementById('view');
  const hash = location.hash || '#/home';
  const [, path, a, b, c] = hash.split('/'); // '#', path, args

  // met de cote la page qu'on quitte
  if (currentHash && currentHash !== hash) {
    scrollPos.set(currentHash, window.scrollY);
    const prevPath = currentHash.split('/')[1];
    if (CACHEABLE.has(prevPath) && view.firstElementChild) {
      pageCache.set(currentHash, {
        el: view.firstElementChild,
        y: window.scrollY,
        hscrolls: snapshotHscrolls(view.firstElementChild),
      });
      while (pageCache.size > 10) pageCache.delete(pageCache.keys().next().value);
    }
  }

  const isBack = navStack.length > 1 && navStack[navStack.length - 2] === hash;
  if (isBack) navStack.pop();
  else if (hash !== navStack[navStack.length - 1]) navStack.push(hash);
  currentHash = hash;

  document.getElementById('overlay-root').innerHTML = '';
  syncTabbar(hash);
  document.body.classList.toggle('on-search', path === 'search' || path === 'advanced');

  // retour arriere vers une page en cache -> restauration a l'identique
  const cached = isBack ? pageCache.get(hash) : null;
  if (cached) {
    pageCache.delete(hash);
    skipPageAnim = false;
    cached.el.classList.add('no-anim');
    view.replaceChildren(cached.el);
    refreshCards(cached.el);
    requestAnimationFrame(() => {
      window.scrollTo(0, cached.y || 0);
      restoreHscrolls(cached.el, cached.hscrolls);
    });
    return;
  }

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
    case 'settings': renderSettings(); break;
    case 'person': renderPerson(Number(a)); break;
    case 'people': renderPeopleFavorites(); break;
    case 'advanced': renderAdvanced(); break;
    default: renderHome();
  }

  // Retour arriere : pas d'animation d'entree (evite le flash sur listes locales)
  if (isBack || skipPageAnim) {
    skipPageAnim = false;
    document.querySelector('#view .page')?.classList.add('no-anim');
  }

  requestAnimationFrame(() => {
    window.scrollTo(0, scrollPos.get(hash) || 0);
  });
}

// Bouton + sur les affiches : ajoute / retire directement de la watchlist.
// Delegation globale pour couvrir toutes les cartes, ou qu'elles soient.
function bindQuickActions() {
  document.addEventListener('click', async (e) => {
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
    await toggleAdd(meta);
    // redessine la carte (etat du bouton + badges)
    card.replaceWith(posterCard(
      { id: meta.tmdbId, title: meta.title, poster_path: meta.poster, backdrop_path: meta.backdrop, year: meta.year, isAnime: meta.isAnime },
      { type: meta.type, sub: ds.qsub || '' }
    ));
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
    if (dx > 70 && dy < 60) {
      skipPageAnim = true; // pas d'animation d'entree -> pas de flash
      history.back();
    }
    start = null;
  }, { passive: true });
}

// UI liee au scroll : loupe flottante (reapparait quand on remonte)
// et bouton "retour en haut" en bas a droite.
function bindScrollUi() {
  const toTop = h(`<button class="scrolltop" aria-label="${tr('Remonter en haut')}">${I.arrowUp}</button>`);
  const floatSearch = h(`<a class="head-btn float-search" href="#/search" aria-label="${tr('Rechercher')}">${I.search}</a>`);
  document.body.append(toTop, floatSearch);
  toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

  let lastY = window.scrollY;
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    toTop.classList.toggle('show', y > 600);
    if (y < 160) floatSearch.classList.remove('show');
    else if (y < lastY - 4) floatSearch.classList.add('show');
    else if (y > lastY + 4) floatSearch.classList.remove('show');
    lastY = y;
  }, { passive: true });
}

async function boot() {
  initAppearance();
  // Copie de secours locale saturee (quota) : on previent une seule fois.
  window.addEventListener('bobine:backup-degraded',
    () => toast(tr('Sauvegarde locale saturee : pense a exporter.')), { once: true });
  const rotateMsg = document.querySelector('#rotate-lock p');
  if (rotateMsg) rotateMsg.innerHTML = `${tr('Bobine se regarde en portrait.')}<br>${tr('Remets ton telephone dans le bon sens !')}`;
  buildTabbar();
  bindQuickActions();
  bindEdgeSwipeBack();
  bindScrollUi();
  if (navigator.storage?.persist) {
    try { await navigator.storage.persist(); } catch { /* ignore */ }
  }
  await loadState();

  // Synchro distante : gere un eventuel retour OAuth et adopte le snapshot
  // distant s'il est plus recent (peut fournir la config TMDB sur un nouvel
  // appareil). Silencieux et sans blocage si hors ligne / non configure.
  try {
    const { langChanged } = await initSync();
    initAppearance();
    if (langChanged) { location.reload(); return; }
  } catch (e) { console.warn('[bobine] initSync', e); initAppearance(); }

  // Premiere ouverture (aucun acces TMDB configure) : ecran d'onboarding.
  // Le routing ne demarre qu'une fois l'acces valide.
  if (!isConfigured()) {
    renderOnboarding(startApp);
  } else {
    startApp();
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js?v=1.20').then((reg) => {
      reg.update().catch(() => {});
      const onReload = () => {
        navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
      };
      if (reg.waiting) {
        onReload();
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            onReload();
            nw.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      });
    }).catch(() => {});
  }
}

function startApp() {
  document.body.classList.remove('onboarding-on');
  if (!location.hash) location.hash = '#/home';
  route();
  window.addEventListener('hashchange', route);
}

boot();
