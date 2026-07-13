# Phase 2 — Fusion Worker TMDB + AniList

> **Durée estimée** : 3–5 jours  
> **Dépendance** : Phase 1 terminée (indépendante fonctionnellement, mais livrer dans l'ordre)  
> **Prérequis déploiement** : Worker Cloudflare redéployé après implémentation

---

## Objectif

Quand l'utilisateur active le mode **Fusion** :

- Les **films et séries occidentales** restent pilotés par TMDB (comme aujourd'hui).
- Les **animes** sont enrichis par **AniList** (studios, staff, score, synopsis, liens streaming).
- Les **animes absents de TMDB** deviennent trouvables via la recherche fusionnée.
- Le mode **TMDB seul** reste le défaut et ne change rien au comportement actuel.

---

## Modèle de réponse fusion (Worker)

Endpoint : `GET /bobine/fusion/detail/:type/:id`

Query params :
- `language` — ex. `fr-FR` (transmis à TMDB)
- `is_anime` — `1` ou `0` (hint client depuis `isAnime()`)

Réponse JSON :

```json
{
  "source": "fusion",
  "tmdb": { /* réponse TMDB brute /movie|tv/id */ },
  "anilist": { /* objet normalisé ou null */ },
  "merged": {
    "overview": { "value": "...", "from": "tmdb" },
    "studios": { "value": ["Madhouse"], "from": "anilist" },
    "staff": { "value": [{ "name": "...", "role": "Director" }], "from": "anilist" },
    "scoreAnilist": { "value": 87, "from": "anilist" },
    "streamingLinks": { "value": [{ "site": "Crunchyroll", "url": "..." }], "from": "anilist" }
  },
  "ids": {
    "tmdb": 123,
    "anilist": 456
  }
}
```

---

## Worker — `worker/worker.js`

### Routage

```javascript
// Pseudo-code routage
const path = url.pathname;

if (path.startsWith('/bobine/fusion/')) {
  return handleFusion(request, env, url);
}

// Legacy : tout le reste → proxy TMDB actuel (inchangé)
return handleTmdbProxy(request, env, url);
```

### `handleFusion`

| Route | Action |
|-------|--------|
| `GET /bobine/fusion/detail/:type/:id` | Merge fiche |
| `GET /bobine/fusion/search` | `?q=&type=multi&page=1` — recherche |

### Résolution AniList ID

Ordre de résolution (côté Worker) :

1. Si `is_anime=1` : recherche AniList par titre TMDB + année (`Media.search`)
2. Si `external_ids` TMDB contient un lien — **non, TMDB n'a pas anilist_id nativement**
3. Fallback : `searchMedia(search: title, format: TV|MOVIE, isAdult: false)` → prendre le meilleur match (titre romaji/english, même année ±1)
4. Cache le mapping `tmdb:{type}:{id}` → `anilistId` en Cache API (TTL 7 jours)

Sources de mapping futures (Phase 3) : Anibridge JSON embarqué — **pas dans cette phase**.

### Requête AniList GraphQL

```graphql
query ($id: Int) {
  Media(id: $id, type: ANIME) {
    id
    title { romaji english native }
    description(asHtml: false)
    averageScore
    studios(isMain: true) { nodes { name } }
    staff(perPage: 12, sort: RELEVANCE) {
      edges { role nodes { id name { full } image { large } } } }
    }
    externalLinks { site url }
    format
    episodes
    duration
    season
    seasonYear
  }
}
```

Endpoint : `POST https://graphql.anilist.co` — pas de clé, `Content-Type: application/json`.

Rate limit AniList : ~90 req/min — le cache Worker est **obligatoire**.

### Règles de merge

| Champ | Primaire | Secondaire | Condition |
|-------|----------|------------|-----------|
| title, poster, backdrop | TMDB | — | toujours |
| overview | TMDB | AniList si TMDB vide | anime |
| genres | TMDB | — | — |
| cast | TMDB | — | — |
| crew | TMDB | — | Phase 1 |
| studios | — | AniList | anime + fusion |
| staff (réal, musique) | — | AniList | anime + fusion |
| score affiché | TMDB vote_average | + chip AniList | anime |
| streaming | TMDB watch/providers | AniList externalLinks | anime : les deux |
| épisodes | TMDB | AniList count si TMDB 0 | anime |

**Ne jamais écraser** un champ TMDB non vide par AniList (sauf `overview` si vide).

### Cache

```javascript
const cacheKey = new Request(url.toString(), { method: 'GET' });
const cached = await caches.default.match(cacheKey);
if (cached) return cached;
// ... fetch, merge, store with Cache-Control: public, max-age=3600
```

---

## Client — `js/config.js`

```javascript
const K_METADATA_MODE = 'bobine_metadata_mode'; // 'tmdb-only' | 'fusion'

export function getMetadataMode() {
  return localStorage.getItem(K_METADATA_MODE) || 'tmdb-only';
}

export function setMetadataMode(mode) {
  if (mode !== 'tmdb-only' && mode !== 'fusion') throw new Error('mode invalide');
  localStorage.setItem(K_METADATA_MODE, mode);
}

export function canUseFusion() {
  const cfg = getConfig();
  // Fusion enrichie passe par le Worker (AniList + cache + merge)
  return cfg?.mode === 'proxy';
}
```

**Décision** : en mode **clé perso**, la fusion est **désactivée dans l'UI** (toggle grisé + note explicative). Évite la complexité CORS/merge côté client. L'utilisateur peut passer en mode proxy pour activer la fusion.

> Alternative future : appeler AniList directement depuis le navigateur en mode clé — hors scope sauf si simple.

---

## Client — `js/api.js`

```javascript
export function getMetadataMode() { /* re-export from config */ }

async function fusionGet(path, params = {}) {
  const cfg = getConfig();
  if (cfg?.mode !== 'proxy') throw new Error('Fusion requiert le proxy');
  const url = new URL(cfg.base + path);
  url.searchParams.set('language', getLang());
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fusion ${res.status}`);
  return res.json();
}

// Modifier detail()
detail: async (type, id, opts = {}) => {
  if (getMetadataMode() === 'fusion' && canUseFusion()) {
    const isAnimeHint = opts.isAnime ? '1' : '0';
    const data = await fusionGet(`/bobine/fusion/detail/${type}/${id}`, { is_anime: isAnimeHint });
    // Retourner un objet compatible avec le code views.js existant :
    // spread data.tmdb + attacher data.merged et data.anilist en extras
    return normalizeFusionDetail(data);
  }
  return get(`/${type}/${id}`, { append_to_response: '...' });
},
```

`normalizeFusionDetail()` :
- Retourne `{ ...tmdb, _fusion: { merged, anilist, ids } }` pour que `views.js` puisse lire les enrichissements sans tout refactorer.

---

## Client — `js/views.js`

### Appel detail

Lors du chargement fiche, passer `isAnime` :

```javascript
const data = await api.detail(type, id, { isAnime: meta.isAnime });
const fusion = data._fusion;
```

### Sections anime (si `fusion?.merged`)

Après synopsis dans `panelOverview` :

- **Studios** : `fusion.merged.studios.value.join(', ')`
- **Équipe** (staff AniList) : carrousel horizontal, rôles Director / Music / Original Creator
- **Score AniList** : chip à côté du vote TMDB si présent
- **Où regarder** : garder TMDB/JustWatch ; ajouter liens AniList en dessous si différents

Badge source discret : `<span class="src-chip">AniList</span>` sur les sections enrichies.

### Paramètres — `renderSettings()`

Nouvelle section **Métadonnées** (après Langue, avant Accès TMDB) :

```
Métadonnées
  [ TMDB seul ]  [ Fusion TMDB + AniList ]
  Note : La fusion enrichit les fiches anime (studios, équipe, score).
         Nécessite le mode proxy. Aucune clé supplémentaire.
```

Si `!canUseFusion()` : toggle fusion visible mais désactivé + texte « Passe en mode proxy pour activer la fusion ».

---

## Sync cloud — `js/storage/index.js`

Ajouter dans `prefs` du snapshot :

```javascript
metadataMode: localStorage.getItem('bobine_metadata_mode') || 'tmdb-only',
```

Et dans `applySnapshot()` :

```javascript
if (p.metadataMode) localStorage.setItem('bobine_metadata_mode', p.metadataMode);
```

Bump `v: 1` → pas nécessaire si champ optionnel dans prefs (rétrocompat).

---

## Recherche fusionnée

`GET /bobine/fusion/search?q=&page=1`

1. TMDB `/search/multi` (comme aujourd'hui)
2. Si la query ressemble à un anime ou section anime : AniList `Page(search: $q, type: ANIME)`
3. Pour chaque résultat AniList sans match TMDB : proposer une carte avec `source: 'anilist'`, `anilistId`, titre, poster AniList
4. **Ajout bibliothèque** AniList-only : hors scope Phase 2 — afficher en recherche seulement avec badge « AniList — pas encore ajoutable » OU mapper via recherche TMDB par titre

**Scope minimal recherche** : dédupliquer par titre similaire ; AniList-only en résultats secondaires avec badge.

---

## i18n

```javascript
'metadata.title': 'Métadonnées',
'metadata.tmdb_only': 'TMDB seul',
'metadata.fusion': 'Fusion TMDB + AniList',
'metadata.fusion_hint': 'Enrichit les fiches anime. Nécessite le proxy. Aucune clé supplémentaire.',
'metadata.fusion_requires_proxy': 'Passe en mode proxy pour activer la fusion.',
'fusion.studios': 'Studios',
'fusion.staff': 'Équipe',
'fusion.score_anilist': 'Score AniList',
'fusion.source_anilist': 'AniList',
```

---

## `worker/README.md` — ajouts

- Documenter les routes `/bobine/fusion/*`
- Préciser que le déploiement est rétrocompatible
- Pas de nouveau secret Cloudflare

---

## Hors scope Phase 2

- TVDB
- Trakt / Wikidata / Anibridge
- Mapping épisode par épisode
- Items bibliothèque avec ID primaire AniList (rester sur tmdbId)
- Pistes audio / sous-titres par langue

---

## Critères d'acceptation

- [ ] Proxy legacy TMDB : `/movie/550` fonctionne
- [ ] `tmdb-only` : zéro appel `/bobine/fusion/*`
- [ ] `fusion` + proxy : fiche anime enrichie
- [ ] `fusion` + clé perso : toggle désactivé, pas de régression
- [ ] Sync propage `metadataMode`
- [ ] Cache Worker actif (2e requête identique plus rapide)
- [ ] Pas de clé AniList côté utilisateur
