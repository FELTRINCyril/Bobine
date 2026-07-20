// Header desktop (>= 1024px) : logo + nav texte + icones a droite.
// Totalement inerte en mobile : l'element #deskbar est cache par app.css
// via desktop.css (media query). Aucune dependance vers views/db.
import { h, I } from './ui.js';
import { tr } from './i18n.js';

const NAV = [
  { hash: '#/home', label: 'Accueil' },
  { hash: '#/movies', label: 'Films' },
  { hash: '#/series', label: 'Series' },
  { hash: '#/anime', label: 'Animes' },
];

export function buildDeskbar() {
  const bar = document.getElementById('deskbar');
  if (!bar) return;
  bar.innerHTML = '';
  bar.appendChild(h(`
    <div class="deskbar-in">
      <div class="deskbar-left">
        <a class="dlogo" href="#/home" aria-label="Bobine">Bobine<span class="tick">.</span></a>
        <nav class="dnav" aria-label="${tr('Navigation principale')}">
          ${NAV.map((n) => `<a href="${n.hash}" data-hash="${n.hash}">${tr(n.label)}</a>`).join('')}
        </nav>
      </div>
      <div class="deskbar-right">
        <a class="dicon" href="#/watchlist" data-hash="#/watchlist" aria-label="${tr('Watchlist')}">${I.bookmark}</a>
        <a class="dicon" href="#/search" data-hash="#/search" aria-label="${tr('Rechercher')}">${I.search}</a>
        <a class="dicon" href="#/profile" data-hash="#/profile" aria-label="${tr('Profil')}">${I.user}</a>
      </div>
    </div>
  `));

  // Transparent en haut de page, fond opaque des qu'on scrolle.
  const onScroll = () => bar.classList.toggle('scrolled', window.scrollY > 24);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

export function syncDeskbar(hash) {
  document.querySelectorAll('#deskbar [data-hash]').forEach((a) => {
    a.classList.toggle('on', hash.startsWith(a.dataset.hash));
  });
}

// Task 3 : fleches de defilement des rangees. Stub pour l'instant.
export function enhanceShelves() {}
