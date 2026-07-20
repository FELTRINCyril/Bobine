# Bobine Desktop - plan d'implementation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** Ajouter un layout ordinateur complet (style Afterdark / Netflix) a la PWA Bobine, active a partir de 1024px, sans changer un pixel du rendu mobile.

**Architecture :** Un nouveau fichier `css/desktop.css` entierement enveloppe dans `@media (min-width: 1024px)` restyle toutes les pages existantes. Un nouveau module `js/deskbar.js` (additif) construit le header desktop et les fleches de defilement des rangees. Les vues, le routeur, les donnees et les actions ne changent pas de comportement.

**Tech stack :** Vanilla JS (ES modules), CSS pur, aucune dependance. Spec valide : `docs/superpowers/specs/2026-07-20-bobine-desktop-design.md`.

## Contraintes globales

- **Zero regression mobile** : toute regle de `desktop.css` est dans `@media (min-width: 1024px)`. Interdit de modifier une regle existante de `app.css`.
- **JS additif uniquement** : `db.js`, `actions.js`, `api.js`, `sync.js`, `config.js` ne sont pas modifies. `app.js` recoit seulement des appels vers `deskbar.js`.
- **Design cible** : clone Afterdark. Fond noir `#000`, header fixe transparent -> opaque au scroll, nav texte horizontale, hero, shelves avec fleches au survol.
- **Textes** : tout label passe par `tr()` (i18n FR/EN existant).
- **Pas de test runner** dans ce projet : chaque tache se verifie dans Chrome (largeur >= 1024px pour le desktop, fenetre etroite < 1024px pour la non-regression mobile). Serveur local : `python3 -m http.server 8765` lance depuis la racine du repo.
- **ASCII pur** dans le code et les commentaires (regle du projet).
- Commits frequents, un par tache, messages en francais sans Co-Authored-By.

## Structure des fichiers

- Creer : `css/desktop.css` (tout le style desktop, par sections commentees)
- Creer : `js/deskbar.js` (header desktop + fleches de shelves, inerte < 1024px)
- Modifier : `index.html` (1 link CSS, 1 element `#deskbar`)
- Modifier : `js/app.js` (imports + 2 appels : build au boot, sync au routage)
- Modifier : `sw.js` (precache des 2 nouveaux fichiers + bump VERSION)
- Modifier : `js/version.js` (bump APP_VERSION)

---

### Task 1 : Socle desktop (deskbar, tokens, tabbar cachee)

**Files :**
- Create: `css/desktop.css`
- Create: `js/deskbar.js`
- Modify: `index.html` (head + body)
- Modify: `js/app.js:36-40` (syncTabbar) et `js/app.js:206-241` (boot)
- Modify: `sw.js:2-25`, `js/version.js`

**Interfaces :**
- Consumes : `h`, `I` depuis `./ui.js` ; `tr` depuis `./i18n.js`.
- Produces : `buildDeskbar()` (construit le header dans `#deskbar`), `syncDeskbar(hash: string)` (met a jour le lien actif), `enhanceShelves()` (Task 3, stub vide ici). Export nomme depuis `js/deskbar.js`.

- [ ] **Step 1 : Creer `js/deskbar.js`**

```js
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
```

- [ ] **Step 2 : Brancher dans `index.html`**

Dans `<head>`, apres la ligne `<link rel="stylesheet" href="css/app.css">` :

```html
<link rel="stylesheet" href="css/desktop.css">
```

Dans `<body>`, dans `#app` juste avant `<main id="view" ...>` :

```html
<header id="deskbar" class="deskbar" aria-hidden="false"></header>
```

- [ ] **Step 3 : Brancher dans `js/app.js` (additif)**

Ajouter l'import apres la ligne `import { initSync } from './sync.js';` :

```js
import { buildDeskbar, syncDeskbar, enhanceShelves } from './deskbar.js';
```

Dans `syncTabbar(hash)` (ligne ~36), ajouter en fin de fonction :

```js
  syncDeskbar(hash);
```

Dans `boot()` juste apres `buildTabbar();` :

```js
  buildDeskbar();
  enhanceShelves();
```

- [ ] **Step 4 : Creer `css/desktop.css` (socle)**

```css
/* ============================================================
   Bobine - layout ordinateur (>= 1024px), style Afterdark.
   TOUT ce fichier est dans une media query : en dessous de
   1024px, rien ici ne s'applique -> mobile intact.
   ============================================================ */

/* #deskbar existe dans le DOM en mobile : on le neutralise
   hors media query, c'est la seule regle globale du fichier. */
#deskbar { display: none; }

@media (min-width: 1024px) {

  /* ---- Tokens : theme Afterdark, ecrase le theme mobile ---- */
  :root, :root[data-theme="light"] {
    --bg: #000;
    --surface: #101010;
    --surface-2: #1a1a1a;
    --surface-3: #262626;
    --line: rgba(255, 255, 255, 0.1);
    --text: #fff;
    --text-muted: #a3a3a3;
    --text-faint: #6b6b6b;
    --page-pad: 56px;
  }

  body { font-size: 16px; }

  /* ---- Chrome mobile cache ---- */
  .tabbar, .float-search { display: none !important; }
  .view { padding-bottom: 48px; }

  /* ---- Header desktop ---- */
  #deskbar {
    display: block;
    position: fixed;
    inset: 0 0 auto 0;
    z-index: 60;
    background: linear-gradient(rgba(0, 0, 0, 0.6), transparent);
    transition: background 0.25s;
  }
  #deskbar.scrolled { background: #000; border-bottom: 1px solid var(--line); }
  .deskbar-in {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 68px;
    padding: 0 var(--page-pad);
  }
  .deskbar-left { display: flex; align-items: center; gap: 36px; }
  .dlogo {
    font-family: var(--font-display);
    font-size: 26px;
    font-weight: 800;
    letter-spacing: 0.5px;
    color: #fff;
    text-decoration: none;
  }
  .dlogo .tick { color: var(--accent); }
  .dnav { display: flex; gap: 26px; }
  .dnav a {
    color: #cfcfcf;
    text-decoration: none;
    font-size: 15px;
    font-weight: 600;
    transition: color 0.15s;
  }
  .dnav a:hover { color: #fff; }
  .dnav a.on { color: #fff; }
  .deskbar-right { display: flex; align-items: center; gap: 20px; }
  .dicon { color: #fff; display: grid; place-items: center; }
  .dicon svg { width: 24px; height: 24px; }
  .dicon.on { color: var(--accent); }

  /* ---- Pages : contenu decale sous le header fixe ---- */
  .page { padding-top: 84px; max-width: none; }
  .page-head { padding: 0 var(--page-pad) 8px; }
}
```

- [ ] **Step 5 : Service worker et version**

Dans `sw.js` : `VERSION = 'bobine-v16'` et ajouter a `SHELL` apres `'./css/app.css',` :

```js
  './css/desktop.css',
```

et apres `'./js/app.js',` :

```js
  './js/deskbar.js',
```

Dans `js/version.js` : `APP_VERSION = '2.0'`.

- [ ] **Step 6 : Verifier**

Run : `python3 -m http.server 8765` (racine du repo), ouvrir `http://localhost:8765` dans Chrome.
- Fenetre >= 1024px : header noir/transparent avec "Bobine." + Accueil/Films/Series/Animes + 3 icones ; tabbar absente ; fond noir ; lien actif blanc ; header devient opaque au scroll.
- Fenetre < 1024px : app strictement identique a avant (tabbar en bas, theme violace, pas de header).

- [ ] **Step 7 : Commit**

```bash
git add index.html css/desktop.css js/deskbar.js js/app.js sw.js js/version.js
git commit -m "Desktop : socle >= 1024px (header Afterdark, tokens noirs, tabbar cachee)"
```

---

### Task 2 : Accueil desktop (hero + shelves)

**Files :**
- Modify: `css/desktop.css` (ajout d'une section, toujours dans la media query)

**Interfaces :**
- Consumes : classes existantes generees par `renderHome()` (`views.js:201`) : `.page-home`, `.cine-hero`, `.cine-hero-bg`, `.cine-hero-shade`, `.cine-hero-top`, `.cine-hero-content`, `.cine-title`, `.cine-desc`, `.cine-actions`, `.home-body`, `.section`, `.section-head`, `.section-title`, `.section-link`, `.hscroll`, `.hscroll-inner`, `.card`, `.poster`, `.resume-card`.
- Produces : rien de nouveau pour les autres taches.

- [ ] **Step 1 : Ajouter la section "Accueil" a `css/desktop.css`** (dans la media query, apres le socle)

```css
  /* ---- Accueil : hero plein ecran-large ---- */
  .page-home { padding-top: 0; }
  .cine-hero {
    height: 78vh;
    min-height: 520px;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
  }
  .cine-hero-bg img { width: 100%; height: 100%; object-fit: cover; }
  .cine-hero-shade {
    background:
      linear-gradient(to top, #000 0%, rgba(0, 0, 0, 0.45) 35%, transparent 70%),
      linear-gradient(to right, rgba(0, 0, 0, 0.7), transparent 55%);
  }
  /* le mini-header du hero mobile (brand + loupe) est redondant
     avec le deskbar */
  .cine-hero-top { display: none; }
  .cine-hero-content { padding: 0 var(--page-pad) 56px; max-width: 640px; }
  .cine-title { font-size: 52px; line-height: 1.05; }
  .cine-desc {
    font-size: 16px;
    -webkit-line-clamp: 3;
    max-width: 560px;
  }
  .cine-actions { margin-top: 20px; }

  /* ---- Sections / shelves ---- */
  .home-body { margin-top: -40px; position: relative; z-index: 2; }
  .section { margin-top: 34px; }
  .section-head { padding: 0 var(--page-pad) 10px; }
  .section-title { font-size: 20px; }
  .hscroll { padding: 0; }
  .hscroll-inner {
    padding: 6px var(--page-pad);
    gap: 14px;
    scrollbar-width: none;
  }
  .hscroll-inner::-webkit-scrollbar { display: none; }

  /* ---- Cartes : plus grandes, zoom au survol ---- */
  .card { width: 168px; }
  .card-lg { width: 190px; }
  .card .poster { transition: transform 0.18s ease, box-shadow 0.18s ease; }
  .card:hover .poster {
    transform: scale(1.06);
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.6);
    z-index: 2;
  }
  .card-title { font-size: 14px; }
  .resume-card { width: 300px; height: 168px; }

  /* bouton watchlist rapide : visible au survol seulement */
  .card .card-quick { opacity: 0; transition: opacity 0.15s; }
  .card:hover .card-quick, .card .card-quick.on { opacity: 1; }
```

Note d'implementation : verifier dans `app.css` les valeurs mobiles de `.cine-hero`, `.hscroll-inner`, `.card`, `.resume-card`, `.card-quick` avant d'ecrire, et ajuster les proprietes a surcharger pour obtenir le rendu (ne jamais editer `app.css`).

- [ ] **Step 2 : Verifier**

Chrome >= 1024px sur `#/home` :
- Hero ~78% de la hauteur, titre a gauche en gros, degrade noir vers le bas et la gauche, boutons "Voir la fiche".
- Shelves pleine largeur avec padding lateral 56px, cartes ~168px, zoom au survol, bouton + visible au survol.
- Fenetre < 1024px : accueil mobile inchange.

- [ ] **Step 3 : Commit**

```bash
git add css/desktop.css
git commit -m "Desktop : accueil (hero large, shelves, hover cartes)"
```

---

### Task 3 : Fleches de defilement des shelves

**Files :**
- Modify: `js/deskbar.js` (remplacer le stub `enhanceShelves`)
- Modify: `css/desktop.css` (section fleches)

**Interfaces :**
- Consumes : structure `.hscroll > .hscroll-inner` generee par `hRow()` (`views.js:57`).
- Produces : boutons `.shelf-arrow.prev` / `.shelf-arrow.next` injectes dans chaque `.hscroll` sur desktop uniquement.

- [ ] **Step 1 : Implementer `enhanceShelves()` dans `js/deskbar.js`**

Remplacer le stub par :

```js
// Fleches de defilement des rangees horizontales, desktop uniquement.
// Un MutationObserver equipe chaque .hscroll rendu par les vues ; les
// boutons sont ignores en mobile (media query + pointer fine).
const DESK = window.matchMedia('(min-width: 1024px)');

function equipShelf(shelf) {
  if (shelf.dataset.arrows) return;
  shelf.dataset.arrows = '1';
  const inner = shelf.querySelector('.hscroll-inner');
  if (!inner) return;
  const mk = (dir, icon) => {
    const b = h(`<button class="shelf-arrow ${dir}" type="button" aria-label="${dir === 'prev' ? tr('Precedent') : tr('Suivant')}">${icon}</button>`);
    b.addEventListener('click', () => {
      inner.scrollBy({ left: (dir === 'prev' ? -1 : 1) * inner.clientWidth * 0.9, behavior: 'smooth' });
    });
    return b;
  };
  shelf.append(mk('prev', I.back), mk('next', I.chevRight));

  const refresh = () => {
    const max = inner.scrollWidth - inner.clientWidth - 4;
    shelf.classList.toggle('at-start', inner.scrollLeft <= 4);
    shelf.classList.toggle('at-end', inner.scrollLeft >= max);
  };
  inner.addEventListener('scroll', refresh, { passive: true });
  refresh();
}

export function enhanceShelves() {
  if (!DESK.matches && !DESK.addEventListener) return;
  const scan = () => {
    if (!DESK.matches) return;
    document.querySelectorAll('#view .hscroll').forEach(equipShelf);
  };
  new MutationObserver(scan).observe(document.getElementById('view'), { childList: true, subtree: true });
  DESK.addEventListener('change', scan);
  scan();
}
```

- [ ] **Step 2 : CSS des fleches dans `css/desktop.css`**

```css
  /* ---- Fleches de shelves ---- */
  .hscroll { position: relative; }
  .shelf-arrow {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 48px;
    border: 0;
    background: linear-gradient(to right, rgba(0, 0, 0, 0.75), transparent);
    color: #fff;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s;
    z-index: 3;
    display: grid;
    place-items: center;
  }
  .shelf-arrow svg { width: 30px; height: 30px; }
  .shelf-arrow.prev { left: 0; }
  .shelf-arrow.next { right: 0; background: linear-gradient(to left, rgba(0, 0, 0, 0.75), transparent); }
  .hscroll:hover .shelf-arrow { opacity: 1; }
  .hscroll.at-start .shelf-arrow.prev,
  .hscroll.at-end .shelf-arrow.next { opacity: 0; pointer-events: none; }
```

Hors media query, ajouter une seule regle de garde (a cote de `#deskbar { display: none; }`) :

```css
.shelf-arrow { display: none; }
```

puis dans la media query : `.shelf-arrow { display: grid; }` (deja couvert par le bloc ci-dessus, garder `display: grid` dedans).

- [ ] **Step 3 : Verifier**

Chrome >= 1024px, `#/home` : au survol d'une rangee, fleches gauche/droite ; clic = defilement fluide d'environ un ecran ; fleche gauche absente en debut de rangee, droite absente en fin. Mobile : aucune fleche visible.

- [ ] **Step 4 : Commit**

```bash
git add js/deskbar.js css/desktop.css
git commit -m "Desktop : fleches de defilement sur les rangees"
```

---

### Task 4 : Catalogues et grilles (Films / Series / Animes / browse / listing / library)

**Files :**
- Modify: `css/desktop.css`

**Interfaces :**
- Consumes : classes existantes `.chips`, `.chip`, `.grid`, `.grid--empty`, `.page-head`, `.page-title`, `.head-btn`, `.load-more` (verifier le nom exact du bouton "Charger plus" dans `views.js` avant d'ecrire), `.status-head` (sections par statut).
- Produces : rien.

- [ ] **Step 1 : Ajouter la section "Catalogues" a `css/desktop.css`**

```css
  /* ---- Catalogues et grilles ---- */
  .page-title { font-size: 34px; }
  .head-btn { display: none; }              /* loupe du page-head : deja dans le deskbar */
  .page-head [data-nav="back"] { display: grid; } /* sauf le bouton retour */
  .chips { padding: 0 var(--page-pad); }
  .grid {
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 18px 14px;
    padding: 12px var(--page-pad);
  }
```

Note d'implementation : lire les regles mobiles `.chips`, `.grid`, `.head-btn` dans `app.css` et surcharger uniquement ce qui differe. Verifier que le bouton retour des pages detail/listing (qui est un `.head-btn`) reste visible : si le selecteur ci-dessus le cache, utiliser `.head-actions .head-btn { display: none; }` a la place.

- [ ] **Step 2 : Verifier**

Chrome >= 1024px : `#/movies`, `#/series`, `#/anime` (grille 6-8 colonnes selon largeur, chips alignees), un `#/browse/...` via un genre depuis une fiche, un `#/listing/...` via "Tout voir", `#/library/seen` via profil. Mobile < 1024px : inchange.

- [ ] **Step 3 : Commit**

```bash
git add css/desktop.css
git commit -m "Desktop : catalogues et grilles larges"
```

---

### Task 5 : Page detail

**Files :**
- Modify: `css/desktop.css`

**Interfaces :**
- Consumes : classes de `renderDetail()` (`views.js:443`) : `.detail-hero`, `.detail-hero .backdrop`, `.detail-hero .shade`, `.detail-top`, `.detail-top .poster`, `.detail-id`, `.detail-meta`, `.genres`, `.detail-actions`, `.act`, `.plays-bar`, `.season`, `.season-toggle`, `.overview` (verifier les noms exacts des blocs saisons/synopsis/casting dans `views.js:620-960` et `app.css` avant d'ecrire).
- Produces : rien.

- [ ] **Step 1 : Ajouter la section "Detail" a `css/desktop.css`**

```css
  /* ---- Page detail : hero backdrop pleine largeur ---- */
  .detail-hero { height: 62vh; min-height: 420px; }
  .detail-hero .backdrop { width: 100%; height: 100%; object-fit: cover; }
  .detail-hero .shade {
    background:
      linear-gradient(to top, var(--bg) 2%, rgba(0, 0, 0, 0.35) 45%, transparent 75%),
      linear-gradient(to right, rgba(0, 0, 0, 0.6), transparent 50%);
  }
  .detail-hero .head-btn {
    display: grid;
    top: 84px;
    left: var(--page-pad);
  }

  /* contenu superpose au bas du hero, largeur contenue */
  .detail-top {
    margin: -180px auto 0;
    padding: 0 var(--page-pad);
    max-width: 1280px;
    position: relative;
    z-index: 2;
    align-items: flex-end;
    gap: 28px;
  }
  .detail-top .poster { width: 200px; }
  .detail-id h1 { font-size: 44px; line-height: 1.05; }
  .detail-meta { font-size: 15px; }

  .genres, .detail-actions, .plays-bar-slot {
    max-width: 1280px;
    margin-left: auto;
    margin-right: auto;
    padding-left: var(--page-pad);
    padding-right: var(--page-pad);
  }
  .detail-actions { justify-content: flex-start; gap: 12px; }
  .detail-actions .act { flex: 0 0 auto; min-width: 128px; cursor: pointer; }

  /* saisons, synopsis, casting : meme gabarit centre */
  .page > .season-list, .page > .overview, .page > .section {
    max-width: 1280px;
    margin-left: auto;
    margin-right: auto;
  }
```

Note d'implementation : les noms `.season-list` / `.overview` sont a confirmer en lisant `views.js` (blocs saisons et synopsis) ; utiliser les vrais noms de classes. Ajuster les valeurs (marge negative, largeur poster) au rendu.

- [ ] **Step 2 : Verifier**

Chrome >= 1024px : ouvrir une fiche film et une fiche serie depuis l'accueil.
- Backdrop en hero pleine largeur avec degrade vers le noir, affiche + titre par-dessus en bas a gauche.
- Boutons vu / favori / watchlist / playlist fonctionnels (cliquer chacun, verifier toasts et etats).
- Serie : saisons depliables, episodes cochables, barre de progression ; casting en rangee ; genres cliquables.
- Mobile : fiche inchangee.

- [ ] **Step 3 : Commit**

```bash
git add css/desktop.css
git commit -m "Desktop : page detail (hero backdrop, gabarit centre)"
```

---

### Task 6 : Recherche et recherche avancee

**Files :**
- Modify: `css/desktop.css`

**Interfaces :**
- Consumes : classes de `renderSearch()` (`views.js:1294`) et `renderAdvanced()` (`views.js:1927`) : `.search-page`, `.search-bar` (verifier noms exacts), `.grid`, chips de filtres.
- Produces : rien.

- [ ] **Step 1 : Ajouter la section "Recherche" a `css/desktop.css`**

```css
  /* ---- Recherche ---- */
  .search-page .page-head, .search-page .search-bar {
    max-width: 760px;
    margin-left: auto;
    margin-right: auto;
  }
  .search-page input[type="search"], .search-page .search-input {
    font-size: 18px;
    height: 52px;
  }
```

Note d'implementation : lire `renderSearch()` et `renderAdvanced()` pour les classes reelles (champ, chips type, resultats) et adapter : champ centre ~760px, resultats dans `.grid` (herite de Task 4), page avancee avec ses pickers centres sur ~760px.

- [ ] **Step 2 : Verifier**

Chrome >= 1024px : `#/search` (champ centre, taper "dune", resultats en grille large, chips de type fonctionnelles), `#/advanced` depuis la recherche (pickers utilisables, resultats en grille). Mobile : inchange.

- [ ] **Step 3 : Commit**

```bash
git add css/desktop.css
git commit -m "Desktop : recherche simple et avancee"
```

---

### Task 7 : Pages locales (watchlist, playlists, profil, stats, reglages, personne, onboarding)

**Files :**
- Modify: `css/desktop.css`

**Interfaces :**
- Consumes : classes des vues `renderWatchlist` (`views.js:959`), `renderPlaylists` (1055), `renderPlaylist` (1111), `renderProfile` (1211), `renderStats` (1389), `renderSettings` (1589), `renderPerson` (1782), `renderOnboarding` (`onboarding.js`). Lire chaque vue pour les classes exactes (`.media-row`, `.profile-*`, `.stats-*`, `.settings-*`, `.onb-*`...).
- Produces : rien.

- [ ] **Step 1 : Ajouter la section "Pages locales" a `css/desktop.css`**

Gabarit commun : contenu centre sur 1100px max. Ecrire une regle par page racine en s'appuyant sur les classes reelles, sur ce modele :

```css
  /* ---- Pages locales : gabarit centre ---- */
  .page-watchlist, .page-playlists, .page-playlist,
  .page-profile, .page-stats, .page-settings, .page-person {
    max-width: 1100px;
    margin: 0 auto;
  }
```

Note d'implementation : ces classes racines n'existent peut-etre pas toutes ; si une vue n'a qu'un `.page` generique, cibler ses blocs internes (ex : `.profile-head`, `.stats-grid`) ou viser les enfants directs communs. Alternative acceptable et plus simple si le rendu le permet : une regle generique `.page:not(.page-home) > * { max-width: 1100px; margin-inline: auto; }` avec exceptions pour `.grid`, `.hscroll`, `.detail-hero`, `.chips` qui restent pleine largeur. Choisir l'option la plus robuste apres lecture du CSS mobile ; documenter le choix en commentaire dans desktop.css.

L'onboarding (premiere ouverture) : verifier avec `localStorage` vide (fenetre privee) que l'ecran de choix TMDB est centre et lisible sur fond noir ; sinon ajouter :

```css
  .onboarding, .onb { max-width: 640px; margin: 0 auto; }
```

(noms de classes a confirmer dans `js/onboarding.js`).

- [ ] **Step 2 : Verifier**

Chrome >= 1024px, avec des donnees (marquer 2-3 contenus vus/watchlist avant) :
- `#/watchlist` (listes par statut), `#/playlists` + creation d'une playlist + `#/playlist/<id>`, `#/profile` (compteurs, boutons export/import visibles), `#/stats`, `#/settings` (theme, langue, synchro), une page `#/person/<id>` via un casting.
- Onboarding en fenetre privee.
- Mobile : tout inchange.

- [ ] **Step 3 : Commit**

```bash
git add css/desktop.css
git commit -m "Desktop : pages locales centrees (watchlist, playlists, profil, stats, reglages)"
```

---

### Task 8 : Overlays (sheets, toasts) et finitions

**Files :**
- Modify: `css/desktop.css`

**Interfaces :**
- Consumes : `.sheet`, `.sheet-veil`, `.grab` (`ui.js:161-173`), `.toast` (`ui.js:179`), `.scrolltop` (`app.js:190`).
- Produces : rien.

- [ ] **Step 1 : Ajouter la section "Overlays" a `css/desktop.css`**

```css
  /* ---- Sheets : panneau bas mobile -> modal centre ---- */
  .sheet {
    inset: 50% auto auto 50%;
    transform: translate(-50%, -50%);
    width: 480px;
    max-height: 80vh;
    border-radius: var(--radius);
    animation: none;
  }
  .sheet .grab { display: none; }
  .sheet-veil { background: rgba(0, 0, 0, 0.7); }

  /* ---- Toasts : en bas a droite ---- */
  #toast-root { left: auto; right: 24px; bottom: 24px; transform: none; }

  /* ---- Divers ---- */
  .scrolltop { right: 24px; bottom: 24px; }
```

Note d'implementation : lire les regles mobiles `.sheet`, `#toast-root`, `.scrolltop` dans `app.css` pour surcharger les bonnes proprietes (position, transform, animation d'entree). La sheet doit rester fonctionnelle : ouvrir "Playlist" depuis une fiche pour tester.

- [ ] **Step 2 : Verifier**

Chrome >= 1024px : depuis une fiche, bouton "Playlist" -> modal centre, clic sur le voile ferme ; toast en bas a droite apres une action ; bouton "remonter" en bas de l'accueil apres scroll. Mobile : sheet remonte toujours du bas.

- [ ] **Step 3 : Commit**

```bash
git add css/desktop.css
git commit -m "Desktop : sheets en modal centre, toasts et finitions"
```

---

### Task 9 : Verification complete et non-regression mobile

**Files :** aucun (corrections eventuelles dans `css/desktop.css` uniquement)

- [ ] **Step 1 : Parcours desktop complet**

Chrome >= 1280px, derouler dans l'ordre : onboarding (fenetre privee) -> home (hero, shelves, fleches, hover) -> movies/series/anime (chips, grilles, charger plus) -> detail film + detail serie (toutes les actions, saisons, casting, genres) -> person -> browse -> listing -> search + advanced -> watchlist -> playlists (+ creation, ajout, suppression) -> profile -> stats -> settings (changer theme : le desktop doit rester noir ; changer langue EN et verifier le deskbar traduit) -> export JSON.

- [ ] **Step 2 : Non-regression mobile**

Chrome DevTools en mode responsive (iPhone, ~390px) : home, movies, detail serie, watchlist, profile, settings, search. Comparer a `git stash`/branche main au moindre doute : le DOM ajoute (`#deskbar`, fleches) ne doit rien afficher ni decaler. Verifier aussi une largeur intermediaire (768px, iPad portrait) : rendu mobile attendu.

- [ ] **Step 3 : Verifier le SW hors ligne**

DevTools > Application > Service worker : verifier que `bobine-v16` s'installe ; passer offline et recharger : l'app (desktop et mobile) demarre.

- [ ] **Step 4 : Commit final des retouches**

```bash
git add css/desktop.css
git commit -m "Desktop : retouches apres verification complete"
```

(sauter ce commit s'il n'y a aucune retouche)
