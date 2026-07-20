# Bobine Desktop - design

Date : 2026-07-20
Statut : valide par Cyril

## Objectif

Ajouter une version ordinateur complete a Bobine, avec exactement le meme
fonctionnement et les memes informations que l'app mobile, dans le design du
site https://afterdark06.mom/ (interface type Netflix : fond noir, header
fixe avec navigation horizontale, hero, rangees d'affiches "shelves").
L'app mobile ne doit pas changer d'un pixel.

## Decisions validees

1. **Architecture** : meme URL, adaptatif. Point de rupture a **1024px**.
   - < 1024px : app mobile actuelle, inchangee.
   - >= 1024px : layout desktop style Afterdark.
2. **Fidelite visuelle** : clone visuel complet d'Afterdark sur desktop
   (fond noir pur, header Afterdark, hero, shelves). Le theme "salle
   obscure" violace de Bobine reste reserve au mobile.
3. **Perimetre** : toutes les pages recoivent un vrai traitement desktop,
   y compris detail, profil, reglages, stats, playlists, onboarding.

## Architecture technique

### CSS

- Nouveau fichier `css/desktop.css`, charge dans `index.html` apres
  `css/app.css`.
- **Tout** son contenu est enveloppe dans `@media (min-width: 1024px)`.
- Aucune regle existante de `app.css` n'est modifiee (garantie zero
  regression mobile). Tolerance : ajout de classes/hooks neutres dans le
  DOM genere par JS si necessaire (sans effet sous 1024px).
- Tokens desktop (surcharge de `:root` dans la media query) : fond noir
  (`#000` / `#0a0a0a`), texte blanc, degrades noirs pour hero et header.
  Le reglage theme clair/sombre de Bobine ne s'applique qu'au mobile ;
  sur desktop le rendu est toujours le theme Afterdark (sombre).

### JS

- Ajouts **additifs uniquement** dans `app.js` : construction d'un header
  desktop `#deskbar` (logo + nav texte + icones a droite), en plus de la
  tabbar existante. CSS affiche l'un ou l'autre selon la largeur.
- Comportement header : transparent avec degrade noir en haut de page,
  fond opaque des que la page defile (listener scroll, classe CSS).
- Shelves : fleches de defilement au survol des rangees horizontales
  (ameliorations additives dans le rendu des rangees, inertes en mobile).
- `db.js`, `actions.js`, `api.js`, `sync.js`, `config.js` : non modifies.
- `views.js` : modifications tolerees uniquement pour ajouter des classes
  ou wrappers neutres en mobile (aucun changement de comportement ni de
  contenu).

### Navigation desktop (mapping)

| Element Afterdark            | Bobine desktop                     |
|------------------------------|------------------------------------|
| Logo (gauche)                | Logo Bobine -> `#/home`            |
| Nav texte horizontale        | Accueil, Films, Series, Animes     |
| Icone ma-liste (droite)      | `#/watchlist`                      |
| Icone recherche (droite)     | `#/search`                         |
| Icone compte/menu (droite)   | `#/profile`                        |

## Pages

- **Accueil** : hero plein ecran-large (backdrop du premier contenu
  tendance, degrade noir, titre + boutons) puis shelves horizontales avec
  memes sections et donnees qu'aujourd'hui.
- **Films / Series / Animes / Browse / Listing** : shelves et grilles
  larges (7-8 affiches par rangee).
- **Detail** : backdrop pleine largeur en hero avec degrade, affiche +
  titre + boutons d'action (vu, favori, watchlist, playlists) par-dessus ;
  saisons/episodes et casting en dessous.
- **Recherche** : grand champ centre + grille de resultats.
- **Watchlist, playlists, profil, stats, reglages, avance, onboarding** :
  conteneur centre (max-width ~1100px), style noir Afterdark.
- **Cartes** : effet de zoom leger au survol, boutons d'action visibles au
  hover (equivalent du tap mobile).

## Fonctionnement

Strictement identique au mobile : memes routes hash, memes actions, memes
informations affichees, meme IndexedDB, meme export/import JSON, meme
synchro cloud, meme acces TMDB. Seule la presentation change >= 1024px.

## Hors perimetre

- Aucune nouvelle fonctionnalite.
- Pas de lecteur video ni de "TV en direct" (present sur Afterdark mais
  sans equivalent Bobine).
- Pas de packaging desktop (Electron...) : c'est la meme PWA, installable
  depuis Chrome/Edge sur ordinateur.

## Verification

1. Parcours complet de toutes les pages dans Chrome >= 1024px.
2. Verification en fenetre etroite (< 1024px) que le rendu mobile est
   inchange (comparaison avant/apres sur les pages principales).
3. Test des interactions : navigation header, hover cartes, fleches de
   shelves, actions (vu/favori/watchlist/playlist), recherche, detail.
