# Bobine

PWA mobile de suivi de films / series / animes (style TV Time).
100% locale : les donnees restent sur l'appareil (IndexedDB), seul TMDB est
appele pour les metadonnees. L'acces TMDB est configure au premier lancement
(cle perso ou proxy) - aucun secret n'est stocke dans le depot. Voir
`SECURITE.md`.

## Lancer en local

```bash
cd bobine
python3 -m http.server 8765
# puis ouvrir http://localhost:8765
```

## Installer sur iPhone

1. Heberger le dossier en HTTPS (GitHub Pages, Cloudflare Pages...) ou y
   acceder depuis l'iPhone sur le meme reseau local.
2. Ouvrir l'URL dans Safari.
3. Partager -> "Sur l'ecran d'accueil".

## Structure

- `index.html` - coquille de l'app
- `css/app.css` - theme "salle obscure" (tokens en haut de fichier)
- `js/app.js` - router (hash) + tab bar
- `js/api.js` - client TMDB (+ detection anime : animation JP)
- `js/config.js` - resolution de l'acces TMDB au runtime (cle perso / proxy)
- `js/onboarding.js` - ecran de premiere ouverture (choix de l'acces)
- `worker/` - proxy TMDB optionnel (Cloudflare Worker), voir son README
- `js/db.js` - IndexedDB (items, playlists) + export/import JSON
- `js/actions.js` - mutations (favori, watchlist, vus, playlists)
- `js/views.js` - toutes les pages
- `sw.js` - service worker (hors-ligne + cache des affiches)

## Donnees

- Item : `{ type, tmdbId, favorite, watchlist, plays, episodes: {"saison:ep": nbVisionnages} }`
- Sauvegarde : Profil -> Exporter mes donnees (JSON), reimportable.
