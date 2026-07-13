# Fusion métadonnées Bobine — Vue d'ensemble

> **Objectif** : enrichir Bobine sans casser l'existant.
> 1. Afficher l'équipe technique TMDB (crew) déjà récupérée mais non affichée.
> 2. Ajouter une fusion **TMDB + AniList** via le Worker Cloudflare, avec un mode **TMDB seul** conservé par défaut.
> 3. Repousser TVDB, Trakt, Anibridge tant qu'il n'y a pas de besoin précis.

---

## Documents du plan

| Fichier | Rôle |
|---------|------|
| **[GO.md](./GO.md)** | **Point d'entrée** — dire « go » à l'agent avec ce fichier suffit |
| [PHASE-1-CREW.md](./PHASE-1-CREW.md) | Spec détaillée : affichage crew TMDB |
| [PHASE-2-FUSION-WORKER.md](./PHASE-2-FUSION-WORKER.md) | Spec détaillée : Worker + AniList |
| [IMPACT-UTILISATEURS.md](./IMPACT-UTILISATEURS.md) | Ce qui change côté utilisateur final |

---

## Architecture cible

```
┌─────────────────────────────────────────────────────────────┐
│  Bobine PWA (js/)                                            │
│                                                              │
│  config.js                                                   │
│    bobine_metadata_mode: "tmdb-only" (défaut) | "fusion"    │
│                                                              │
│  api.js                                                      │
│    tmdb-only  → TMDB direct (clé) ou proxy TMDB (actuel)      │
│    fusion     → endpoint /bobine/fusion/... sur le Worker     │
│                                                              │
│  views.js                                                    │
│    Onglet Casting : cast + crew (Phase 1)                   │
│    Fiche anime : studios, staff AniList si fusion (Phase 2) │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  Cloudflare Worker (worker/worker.js)                        │
│                                                              │
│  GET /*           → proxy TMDB inchangé (rétrocompat)         │
│  GET /bobine/fusion/detail/:type/:id  → merge TMDB+AniList   │
│  GET /bobine/fusion/search?q=...      → recherche fusionnée  │
│                                                              │
│  Cache: Cache API Cloudflare (TTL 1h fiches, 15min search)   │
└──────────────┬─────────────────────────┬────────────────────┘
               │                         │
           TMDB API                  AniList GraphQL
        (secret Worker)            (public, sans clé)
```

---

## Principes non négociables

1. **TMDB-only reste le défaut** — aucun utilisateur existant n'est forcé de changer quoi que ce soit.
2. **Aucune nouvelle clé API utilisateur** — AniList est public ; la clé TMDB actuelle suffit.
3. **Rétrocompatibilité proxy** — les URLs Worker actuelles (`/movie/123`, `/tv/456`) continuent de fonctionner.
4. **Identité locale inchangée** — les items restent indexés `{type}_{tmdbId}` ; AniList est un enrichissement, pas un remplacement d'ID primaire (Phase 2).
5. **Pas de TVDB** dans ce plan.

---

## Phases

### Phase 1 — Crew TMDB (★★, ~1 jour)

- Afficher compositeurs, réalisateurs, producteurs depuis `credits.crew` (déjà dans `append_to_response`).
- Aucun changement Worker, aucun changement config.
- Fichiers : `js/views.js`, `js/ui.js` (optionnel), `css/app.css`, `js/i18n.js`.

→ Voir [PHASE-1-CREW.md](./PHASE-1-CREW.md)

### Phase 2 — Fusion Worker TMDB + AniList (★★★, ~3–5 jours)

- Étendre le Worker avec routes `/bobine/fusion/*`.
- Ajouter `metadataMode` dans `config.js` + toggle dans Paramètres.
- Enrichir les fiches anime : studios, staff, score AniList, synopsis alternatif.
- Recherche anime : compléter TMDB avec résultats AniList-only.
- Sync cloud : propager `metadataMode` dans `bobine.json`.

→ Voir [PHASE-2-FUSION-WORKER.md](./PHASE-2-FUSION-WORKER.md)

### Phase 3 — (hors scope, futur)

- Trakt / Wikidata / Anibridge pour mapping IDs épisodes.
- TVDB si besoin crew/awards plus complets sur séries occidentales.

---

## Fichiers impactés (résumé)

| Fichier | Phase 1 | Phase 2 |
|---------|---------|---------|
| `js/views.js` | ✅ crew UI | ✅ fiche anime enrichie |
| `js/ui.js` | optionnel `crewCard` | — |
| `css/app.css` | styles crew | badge source |
| `js/i18n.js` | libellés crew | libellés fusion |
| `js/api.js` | — | routes fusion |
| `js/config.js` | — | `metadataMode` |
| `js/storage/index.js` | — | sync prefs |
| `js/onboarding.js` | — | mention optionnelle |
| `worker/worker.js` | — | routes fusion |
| `worker/README.md` | — | doc déploiement |
| `sw.js` | — | bump cache si besoin |

---

## Critères d'acceptation globaux

- [ ] Mode TMDB-only : comportement identique à aujourd'hui (régression zéro).
- [ ] Onglet Casting affiche cast + crew groupé par département.
- [ ] Mode fusion activable dans Paramètres, désactivable sans perte de données.
- [ ] Fiches anime affichent au moins : studios AniList, staff clé, score AniList.
- [ ] Worker déployé : routes TMDB legacy + routes fusion coexistent.
- [ ] Sync cloud propage le mode fusion entre appareils.
- [ ] Aucun secret AniList côté client (pas nécessaire).
- [ ] Tests manuels documentés dans GO.md passent.
