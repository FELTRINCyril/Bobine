# Bobine - Accès TMDB et secrets

Comment Bobine accède à TMDB sans exposer de clé dans le dépôt public.

## Principe

Une app **statique** (HTML/JS livré au navigateur) ne peut pas cacher une clé
partagée : elle est toujours visible dans l'onglet Réseau. Il n'existe donc que
deux vraies solutions, et Bobine gère les deux :

1. **Clé perso** : l'utilisateur colle sa propre clé TMDB. Stockée en local
   (`localStorage`), jamais dans le dépôt.
2. **Proxy** : un Cloudflare Worker garde la clé côté serveur ; l'app appelle
   le Worker. La clé ne quitte jamais le serveur. Voir `worker/README.md`.

Résultat : **le dépôt ne contient aucun secret** et peut rester public.

## Où vit quoi

| Endroit | Contenu |
| --- | --- |
| Dépôt GitHub (public OK) | Tout le code + code du Worker, **zéro secret** |
| Secret du Worker Cloudflare | La clé TMDB partagée (mode proxy) |
| localStorage de l'appareil | La clé perso (mode clé) |
| IndexedDB | Données de visionnage, jamais exposées (inchangé) |

## Fichiers concernés

- `js/config.js` : résout l'accès au runtime (mode `key` ou `proxy`). Contient
  `DEFAULT_PROXY` (URL publique du Worker, **pas un secret**), vide par défaut.
- `js/api.js` : lit la config, ne contient plus aucun jeton.
- `js/onboarding.js` : écran de première ouverture (choix clé / proxy + test).
- `worker/worker.js` + `worker/README.md` : le proxy et son déploiement.
- Paramètres -> "Accès TMDB" : voir le mode actif et le reconfigurer.

## Première ouverture

Aucun accès configuré -> écran d'onboarding :
- si `DEFAULT_PROXY` est renseigné : bouton **Commencer** (zéro config) ;
- sinon / au choix : **Options avancées** -> coller sa clé TMDB ou une URL de
  proxy. L'accès est **testé** (appel `/configuration`) avant d'être enregistré.

## IMPORTANT - jeton dans l'historique git

L'ancien jeton TMDB codé en dur est toujours présent dans l'historique git
(commit `ada956a`). Le retirer du code ne l'efface pas du passé. Comme c'est un
jeton **lecture seule**, le risque est faible, mais le propre est de le
**régénérer sur TMDB** (ce qui invalide l'ancien) :
https://www.themoviedb.org/settings/api

## Rappel

Ce produit utilise l'API TMDB mais n'est ni approuvé ni certifié par TMDB.
