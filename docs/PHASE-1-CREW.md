# Phase 1 — Affichage crew TMDB

> **Durée estimée** : 0,5–1 jour  
> **Dépendances** : aucune  
> **Impact utilisateur** : aucune action requise — nouvelles infos visibles dans l'app

---

## Contexte

Bobine récupère déjà les crédits complets via TMDB :

```javascript
// js/api.js — detail()
append_to_response: 'credits,recommendations,keywords,translations,watch/providers'
```

Le cast est affiché (`d.credits.cast`) mais le crew (`d.credits.crew`) est ignoré :

```javascript
// js/views.js ~L799
const cast = d.credits?.cast || [];
```

TMDB expose dans `crew[]` : `id`, `name`, `profile_path`, `department`, `job`.

---

## Objectif UX

Dans l'onglet **Casting** de la fiche détail (films et séries), afficher sous le carrousel acteurs :

1. **Réalisation** (`Directing`) — Director, Co-Director
2. **Scénario** (`Writing`) — Writer, Screenplay, Story
3. **Production** (`Production`) — Producer, Executive Producer
4. **Musique** (`Sound`) — Original Music Composer, Music

Autres départements (`Camera`, `Editing`, `Art`, …) : afficher seulement s'il reste de la place ou via « Voir tout ».

---

## Implémentation

### 1. Fonction utilitaire — `js/views.js` (ou `js/ui.js`)

```javascript
const CREW_DEPARTMENTS = [
  { key: 'Directing', labelKey: 'crew.directing', jobs: ['Director', 'Co-Director'] },
  { key: 'Writing', labelKey: 'crew.writing', jobs: ['Writer', 'Screenplay', 'Story', 'Novel', 'Characters'] },
  { key: 'Production', labelKey: 'crew.production', jobs: ['Producer', 'Executive Producer', 'Co-Producer'] },
  { key: 'Sound', labelKey: 'crew.music', jobs: ['Original Music Composer', 'Music', 'Composer'] },
];

function pickCrew(crew, department, jobs) {
  const seen = new Set();
  return (crew || [])
    .filter((c) => c.department === department && jobs.includes(c.job))
    .filter((c) => !seen.has(c.id) && seen.add(c.id));
}
```

### 2. Rendu — `renderDetailContent()` dans `js/views.js`

Après le bloc cast existant (~L799–808), ajouter :

```javascript
const crew = d.credits?.crew || [];
for (const dep of CREW_DEPARTMENTS) {
  const people = pickCrew(crew, dep.key, dep.jobs);
  if (!people.length) continue;
  const row = h('<div class="hscroll"><div class="hscroll-inner"></div></div>');
  const inner = row.firstElementChild;
  const slice = people.slice(0, 8);
  for (const p of slice) inner.appendChild(crewCard(p)); // réutiliser castCard avec p.job
  const link = people.length > 8
    ? stashListing(`crew-${dep.key}-${type}-${id}`, `${tr(dep.labelKey)} - ${meta.title}`, 'crew', people)
    : null;
  panelMore.appendChild(section(tr(dep.labelKey), row, link));
}
```

### 3. Carte crew — `js/ui.js`

Option A (minimal) : réutiliser `castCard` en passant `{ ...p, character: p.job }`.

Option B (propre) : nouvelle fonction `crewCard(p)` identique à `castCard` mais affiche `p.job` au lieu de `p.character`.

### 4. Listing « Voir tout » — `js/views.js`

Le mode `listing` gère déjà `cast` (~L1627). Ajouter le cas `kind === 'crew'` : même grille `castCard`/`crewCard` avec `job` affiché.

### 5. CSS — `css/app.css`

Pas de nouveau composant obligatoire — réutiliser `.cast-card`, `.hscroll`. Optionnel :

```css
.crew-job { font-size: var(--text-xs); color: var(--muted); text-align: center; }
```

### 6. i18n — `js/i18n.js`

```javascript
// FR
'crew.directing': 'Réalisation',
'crew.writing': 'Scénario',
'crew.production': 'Production',
'crew.music': 'Musique',

// EN
'crew.directing': 'Directing',
'crew.writing': 'Writing',
'crew.production': 'Production',
'crew.music': 'Music',
```

---

## Hors scope Phase 1

- Pas de modification Worker
- Pas de nouveau mode config
- Pas d'appel API supplémentaire
- Pas de changement `db.js` / modèle Item

---

## Critères d'acceptation

- [ ] Film blockbuster : au moins réalisateur + compositeur visibles
- [ ] Série TV : producteurs exécutifs visibles
- [ ] Clic sur une personne crew → `#/person/:id` (page personne TMDB existante)
- [ ] Onglet Casting ne déborde pas verticalement de façon excessive (limite 8 + lien)
- [ ] Fonctionne en français et anglais
