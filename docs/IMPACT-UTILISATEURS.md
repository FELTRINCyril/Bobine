# Impact utilisateurs — Fusion métadonnées

> Ce document répond à : **« Qu'est-ce que les utilisateurs devront faire de plus ? »**

---

## Réponse courte

**Presque rien.** Par défaut, tout reste identique. Les seuls changements visibles sans action sont les **nouvelles infos d'équipe technique** (Phase 1). La fusion TMDB + AniList est **optionnelle** et **désactivée par défaut**.

---

## Par profil utilisateur

### Utilisateur actuel (déjà configuré)

| Action requise | Détail |
|----------------|--------|
| **Rien (défaut)** | L'app continue en mode TMDB seul. Même clé, même proxy, même onboarding. |
| **Optionnel** | Aller dans **Paramètres → Métadonnées → Fusion** s'il veut enrichir les animes. |
| **Si fusion souhaitée en clé perso** | Passer en **mode proxy** (une fois) — voir ci-dessous. |

### Nouvel utilisateur (première installation)

| Action requise | Détail |
|----------------|--------|
| **Identique à aujourd'hui** | Configurer l'accès TMDB (bouton Commencer, clé perso, ou proxy). |
| **Rien de plus** | Pas de compte AniList, pas de PIN TVDB, pas de nouvelle clé. |
| **Optionnel** | Activer la fusion dans Paramètres après configuration. |

### Toi (déployeur / mainteneur)

| Action requise | Détail |
|----------------|--------|
| **Phase 1** | Déployer l'app (GitHub Pages, etc.) — aucun changement Worker. |
| **Phase 2** | **Redéployer le Worker Cloudflare** avec le nouveau `worker.js`. |
| **URL proxy** | Si l'URL Worker ne change pas, les utilisateurs proxy n'ont **rien à reconfigurer**. |
| **DEFAULT_PROXY** | Si tu le renseignes dans `config.js`, les nouveaux users en profitent automatiquement. |

---

## Ce qui change visuellement (sans rien faire)

### Phase 1 — Crew (automatique pour tous)

Sur chaque fiche film/série, onglet **Casting** :

- Avant : acteurs uniquement
- Après : acteurs + **réalisation, scénario, production, musique**

Aucun réglage, aucune clé, aucun rechargement de config.

### Phase 2 — Fusion (seulement si activée)

Sur les fiches **anime**, en plus :

- Studios (ex. Madhouse, MAPPA)
- Équipe clé AniList (réalisateur, musique…)
- Score AniList (en complément du score TMDB)
- Liens streaming AniList si disponibles

Badge discret **AniList** sur les sections enrichies.

---

## Tableau récapitulatif des actions

| Situation | Doit faire quelque chose ? | Quoi ? |
|-----------|---------------------------|--------|
| Utilise TMDB seul, ne veut rien changer | **Non** | — |
| Veut voir compositeurs/producteurs | **Non** | Automatique (Phase 1) |
| Veut fusion anime | **Oui, 1 tap** | Paramètres → Fusion ON |
| Fusion + clé TMDB perso | **Oui** | Repasser par onboarding/proxy, ou reconfigurer l'accès en mode proxy |
| Fusion + proxy déjà configuré | **Oui, 1 tap** | Paramètres → Fusion ON |
| Utilisateur cloud sync | **Non** | Le mode fusion se synchronise seul entre appareils |
| Créer un compte AniList | **Non** | — |
| Payer TVDB | **Non** | TVDB hors scope |
| Nouvelle clé API | **Non** | — |

---

## Ce qui ne change PAS

- Données de visionnage (vus, favoris, watchlist, playlists) — 100 % locales
- Identifiants des items en bibliothèque (`tmdbId`) — inchangés
- Onboarding TMDB (clé ou proxy) — même flux
- Sync Dropbox / Google Drive — même principe, + préférence fusion propagée
- Export / import JSON — compatible
- Quota TMDB utilisateur — identique en mode TMDB seul ; en fusion, le Worker absorbe les appels AniList (gratuit)

---

## Cas limites à connaître

### « J'ai une clé TMDB perso et je veux la fusion »

La fusion passe par le Worker (cache + merge). **Choix Phase 2** : toggle fusion grisé en mode clé perso.

Options pour l'utilisateur :
1. Continuer en TMDB seul (crew Phase 1 reste disponible)
2. Passer en mode proxy (URL Worker) — **une seule reconfiguration**, pas de nouvelle clé

### « Mon proxy ne marche plus après mise à jour »

Si tu redéploies le Worker **sans changer l'URL**, rien à faire. Si tu changes l'URL, les utilisateurs proxy doivent reconfigurer (comme aujourd'hui).

### « Je cherche un anime introuvable sur TMDB »

En mode fusion : peut apparaître en recherche avec badge AniList. **Ajout à la bibliothèque** pour les entrées AniList-only : hors scope Phase 2 (affichage recherche seulement, ou mapping futur).

---

## Message utilisateur suggéré (Paramètres)

> **Fusion TMDB + AniList**  
> Enrichit les fiches anime avec studios, équipe et score AniList.  
> Aucune clé supplémentaire. Nécessite le mode proxy.  
> Désactivé par défaut — ton accès TMDB actuel ne change pas.

---

## En résumé pour tes utilisateurs

Tu peux leur dire :

> *« La prochaine mise à jour affiche automatiquement les réalisateurs, producteurs et compositeurs sur les fiches. Si tu veux des infos anime plus complètes (studios, équipe), tu peux activer "Fusion" dans les Paramètres — c'est optionnel et ça ne demande aucune nouvelle clé. Par défaut, rien ne change. »*
