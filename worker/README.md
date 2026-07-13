# Proxy TMDB + fusion AniList (Cloudflare Worker)

Ce Worker garde la clé TMDB **côté serveur**. Le navigateur ne la voit jamais :
l'app appelle le Worker, le Worker relaie vers TMDB en ajoutant la clé.

Depuis la v1.16, le même Worker expose aussi des routes **fusion TMDB + AniList**
pour enrichir les fiches anime (studios, équipe, score). AniList est public :
**aucun secret supplémentaire** n'est requis.

100% gratuit, **sans carte bancaire** (offre gratuite Cloudflare Workers).

## Routes

| Route | Rôle |
|-------|------|
| `GET /movie/*`, `GET /tv/*`, etc. | Proxy TMDB **inchangé** (rétrocompatibilité) |
| `GET /bobine/fusion/detail/:type/:id` | Fiche fusionnée (`type` = `movie` ou `tv`) |
| `GET /bobine/fusion/search?q=...&page=1` | Recherche TMDB + compléments AniList |

Paramètres utiles :
- `language` — langue TMDB (ex. `fr-FR`)
- `is_anime` — `1` ou `0` (hint client, le Worker détecte aussi automatiquement)

Cache Cloudflare : 1 h (fiches), 15 min (recherche).

## Déploiement (via le dashboard, le plus simple)

1. Créer un compte sur https://dash.cloudflare.com (email + mot de passe, pas de CB).
2. Menu **Workers & Pages** -> **Create** -> **Create Worker**.
3. Donner un nom (ex: `bobine-tmdb`) -> **Deploy** (crée un worker vide).
4. **Edit code** : coller le contenu de `worker.js`, puis **Deploy**.
5. Onglet **Settings** -> **Variables and Secrets** -> **Add** :
   - Type **Secret**, nom `TMDB_TOKEN`, valeur = ton **jeton v4 TMDB** (Bearer).
   - (Alternative : nom `TMDB_KEY` avec ta **clé v3** à la place.)
   - **Save and deploy**.

Ton Worker est alors joignable à une URL du type :
`https://bobine-tmdb.<ton-compte>.workers.dev`

**Mise à jour** : si tu avais déjà déployé l'ancien proxy, remplace le code par
le nouveau `worker.js` et redéploie. L'URL ne change pas.

## Brancher l'app dessus

Deux options :

- **Global (pour tout le monde)** : coller cette URL dans `DEFAULT_PROXY`
  (fichier `js/config.js`). Au premier lancement, un bouton "Commencer" suffit.
- **Ponctuel (juste toi)** : au premier lancement, section "Options avancées"
  -> "Utiliser un proxy" -> coller l'URL.

Ensuite, dans **Paramètres → Métadonnées**, l'utilisateur peut activer la
**Fusion TMDB + AniList** (optionnel, désactivé par défaut).

## Sécurité / quota

- Le code du Worker ne contient **aucun secret** : il peut rester public.
- Pour éviter que d'autres consomment ton quota, mets l'URL de ton app dans
  `ALLOWED_ORIGIN` (dans `worker.js`) au lieu de `*`.

## Obtenir une clé / un jeton TMDB

https://www.themoviedb.org/settings/api (compte TMDB gratuit).
- **API Key (v3 auth)** = la clé courte -> à mettre dans `TMDB_KEY`.
- **API Read Access Token (v4 auth)** = le jeton long -> à mettre dans `TMDB_TOKEN`.
