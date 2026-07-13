# GO — Implémentation fusion métadonnées Bobine

> **Usage** : envoyer à l'agent Cursor le message suivant :
>
> ```
> go docs/GO.md
> ```
>
> L'agent doit lire ce fichier et les specs référencées, puis implémenter **Phase 1 puis Phase 2** dans l'ordre, sans toucher à TVDB.

---

## Mission

Implémenter le plan décrit dans :

1. [PHASE-1-CREW.md](./PHASE-1-CREW.md) — affichage crew TMDB
2. [PHASE-2-FUSION-WORKER.md](./PHASE-2-FUSION-WORKER.md) — fusion Worker TMDB + AniList

Référence architecture : [METADATA-FUSION.md](./METADATA-FUSION.md)

Impact utilisateur (ne pas implémenter, juste respecter) : [IMPACT-UTILISATEURS.md](./IMPACT-UTILISATEURS.md)

---

## Ordre d'exécution

```
Phase 1 (crew)
  → commit intermédiaire possible si demandé
Phase 2a (Worker routes fusion)
Phase 2b (config + api.js client)
Phase 2c (UI Paramètres + fiches anime)
Phase 2d (sync cloud + i18n)
  → tests manuels
```

**Ne pas sauter Phase 1.** Elle est indépendante et livre de la valeur immédiate.

---

## Règles pour l'agent

- **Minimiser le scope** : pas de TVDB, Trakt, Wikidata, Anibridge.
- **TMDB-only = défaut** : `localStorage` clé `bobine_metadata_mode`, valeur par défaut `tmdb-only`.
- **Proxy TMDB legacy** : toute requête `GET /movie/*`, `GET /tv/*`, etc. sur le Worker doit continuer à fonctionner exactement comme avant.
- **Pas de npm/bundler** : rester en ES modules natifs comme le projet actuel.
- **i18n** : ajouter les chaînes FR + EN dans `js/i18n.js`.
- **Ne pas commit** sauf demande explicite de l'utilisateur.
- Lire le code existant avant d'écrire ; matcher le style (commentaires FR, pas de sur-ingénierie).

---

## Phase 1 — Checklist

Référence : [PHASE-1-CREW.md](./PHASE-1-CREW.md)

- [ ] Extraire et grouper `d.credits.crew` par `department`
- [ ] Afficher dans l'onglet « Casting » (`panelMore`) sous le cast existant
- [ ] Départements prioritaires : `Directing`, `Writing`, `Production`, `Sound`
- [ ] Jobs affichés : Director, Writer, Producer, Executive Producer, Original Music Composer
- [ ] Lien vers `#/person/:id` si `crew.id` présent
- [ ] Limiter à ~8 personnes par département, lien « Voir tout » si > 8 (réutiliser `stashListing` comme pour le cast)
- [ ] Styles CSS cohérents avec `.cast-card` / `.hscroll`
- [ ] Traductions i18n

### Tests manuels Phase 1

1. Ouvrir une fiche film (ex. Inception) → onglet Casting → voir « Réalisation », « Production », « Musique ».
2. Ouvrir une série → idem + cast inchangé.
3. Hors ligne sur fiche déjà visitée → pas de crash (crew déjà en cache mémoire session).
4. Mode TMDB-only inchangé (aucun nouveau réglage visible en Phase 1).

---

## Phase 2 — Checklist

Référence : [PHASE-2-FUSION-WORKER.md](./PHASE-2-FUSION-WORKER.md)

### Worker

- [ ] Routes `/bobine/fusion/detail/:type/:id` et `/bobine/fusion/search`
- [ ] Fetch parallèle TMDB + AniList (si anime ou type tv/movie)
- [ ] Merge selon règles documentées
- [ ] Cache Cloudflare `caches.default`
- [ ] CORS inchangé
- [ ] README Worker mis à jour

### Client config

- [ ] `getMetadataMode()` / `setMetadataMode()` dans `config.js`
- [ ] Clé `bobine_metadata_mode` : `tmdb-only` | `fusion`
- [ ] Toggle dans `renderSettings()` section « Métadonnées »
- [ ] Propagation sync dans `storage/index.js` (`prefs.metadataMode`)

### Client API

- [ ] `api.fusionDetail(type, id)` — appelle Worker si mode fusion + proxy configuré
- [ ] `api.detail()` : si fusion + proxy → déléguer ; sinon TMDB direct (comportement actuel)
- [ ] `api.search()` : en fusion, merger résultats anime AniList-only en fin de liste dédupliquée
- [ ] Helper `resolveAnilistId(tmdbId, title, type)` côté Worker (pas client)

### UI

- [ ] Fiche détail anime : section « Studios » (AniList)
- [ ] Fiche détail anime : section « Équipe » staff AniList (Director, Music, etc.)
- [ ] Badge discret score AniList si différent de TMDB vote_average
- [ ] Chip « AniList » sur les champs enrichis (transparence source)
- [ ] Recherche : animes absents de TMDB apparaissent avec badge source

### Tests manuels Phase 2

1. **Régression TMDB-only** : mode par défaut, tout fonctionne comme avant.
2. **Fusion + proxy** : activer fusion, ouvrir un anime (ex. Frieren) → studios + staff AniList visibles.
3. **Fusion + clé perso** : si implémenté (AniList direct navigateur) → même enrichissement ; sinon message « fusion nécessite le proxy » (documenter le choix dans la spec).
4. **Recherche** : chercher un anime rare absent de TMDB → résultat AniList proposé.
5. **Sync cloud** : activer fusion sur appareil A, sync, récupérer sur B → mode fusion actif.
6. **Proxy legacy** : `GET {proxy}/configuration` fonctionne toujours.

---

## Déploiement (toi, pas l'agent — sauf si demandé)

Après Phase 2, redéployer le Worker Cloudflare :

1. Coller le nouveau `worker.js` dans le dashboard Cloudflare.
2. Secrets inchangés (`TMDB_TOKEN` ou `TMDB_KEY`).
3. Si `DEFAULT_PROXY` est renseigné dans `config.js`, aucun changement URL côté users.

---

## Definition of Done

- Toutes les checklists ci-dessus cochées.
- Aucune régression sur le parcours onboarding existant.
- `read_lints` propre sur les fichiers modifiés.
- Pas de fichier `.md` supplémentaire créé par l'agent (sauf mise à jour `worker/README.md`).
