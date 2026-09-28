// Synchronisation distante : recupere au demarrage, pousse (anti-rebond) apres
// chaque modification. A la connexion, le cloud fait toujours foi s'il existe deja.
// Ensuite : "dernier ecrit gagne" (horodatage des vraies modifs de donnees).
import { localStamp, touch, setStamp, state, clearAllData } from './db.js';
import {
  getProvider, setProvider, clearSync, hasSync, buildSnapshot, applySnapshot,
} from './storage/index.js';
import { adapter as dropbox } from './storage/dropbox.js';
import { adapter as gdrive } from './storage/googledrive.js';

// Registre des fournisseurs de stockage.
const REGISTRY = { dropbox, gdrive };

// Horodatage de la derniere synchro reussie, garde d'une session a l'autre.
const K_LAST_SYNC = 'bobine_sync_last';

const current = () => REGISTRY[getProvider()] || null;

let ready = false;    // tant que faux, on ne pousse pas (boot/hydratation)
let suppress = false;  // vrai pendant l'adoption d'un snapshot distant
let pushTimer = null;
let lastSync = Number(localStorage.getItem(K_LAST_SYNC)) || 0;
let lastError = null;  // { at, op, message } de la derniere operation ratee

// Une synchro qui echoue en silence, c'est l'utilisateur qui continue a saisir
// sans savoir que plus rien ne part. On memorise donc le dernier echec pour
// que les reglages puissent l'afficher, et on previent l'app une seule fois.
function noteFailure(op, err) {
  const first = !lastError;
  lastError = {
    at: Date.now(),
    op,
    message: String(err?.message || err || ''),
    needsAuth: !!err?.needsAuth,
  };
  console.warn(`[bobine] synchro distante (${op}) echouee`, err);
  if (first) window.dispatchEvent(new CustomEvent('bobine:sync-error', { detail: lastError }));
}

function noteSuccess() {
  lastError = null;
  lastSync = Date.now();
  try { localStorage.setItem(K_LAST_SYNC, String(lastSync)); } catch { /* quota */ }
}

// Vrai quand un compte est bien lie mais que son autorisation n'est plus
// valable : le seul remede est un geste de l'utilisateur. On distingue ce cas
// d'une panne reseau, qui se resoudra toute seule.
export function needsReconnect() {
  const ad = current();
  if (!ad || !hasSync()) return false;
  if (ad.hasValidToken && !ad.hasValidToken()) return true;
  return !!lastError?.needsAuth;
}

// Relance l'autorisation. A n'appeler QUE depuis un geste utilisateur : le
// fournisseur quitte la page vers son ecran de consentement.
export function reconnect() {
  const ad = current();
  if (!ad) return false;
  ad.beginAuth();
  return true;
}

// Vrai quand la derniere tentative de reconnexion n'est jamais revenue : le
// fournisseur a refuse la demande avant meme d'afficher l'ecran (URI de
// redirection non declaree). Message actionnable plutot que bouton inerte.
export function redirectionNonAutorisee() {
  const ad = current();
  return !!(ad?.tentativeRedirectionEchouee && ad.tentativeRedirectionEchouee());
}

export function oublierTentativeAuth() {
  const ad = current();
  ad?.oublierTentative?.();
}

export function uriDeRedirection() {
  const ad = current();
  return ad?.redirectUri ? ad.redirectUri() : '';
}

function schedulePush(delay = 2000) {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(doPush, delay);
}

// Retourne true si l'envoi a abouti.
async function doPush() {
  const ad = current();
  if (!ad) return false;
  try {
    await ad.push(buildSnapshot());
    noteSuccess();
    return true;
  } catch (e) {
    noteFailure('push', e);
    return false;
  }
}

// Integration d'un snapshot distant : fusion par entree, jamais d'effacement.
async function adoptRemote(remote) {
  suppress = true;
  let r = {};
  try { r = await applySnapshot(remote); }
  finally { suppress = false; }
  // L'etat local resultant contient au moins autant que le distant : on garde
  // l'horodatage le plus recent des deux, puis on renvoie la fusion au cloud
  // pour que les deux cotes convergent.
  setStamp(Math.max(remote.updatedAt || 0, localStamp()) || Date.now());
  noteSuccess();
  return r;
}

// Connexion initiale : le contenu du cloud est FUSIONNE avec le local, jamais
// substitue. C'est le scenario ou l'ancienne version perdait tout ce qui avait
// ete ajoute pendant que la synchro etait coupee.
async function connectSync() {
  const ad = current();
  if (!ad) return {};
  let remote;
  try { remote = await ad.pull(); }
  catch (e) { noteFailure('pull', e); return { failed: true }; }

  if (remote) {
    const r = await adoptRemote(remote);
    await doPush(); // le cloud recoit la fusion
    return r;
  }

  // Cloud vide : premier envoi si on a des donnees locales.
  if (state.items.size || state.playlists.size) {
    touch();
    await doPush();
  }
  return {};
}

// Recupere le distant et le fusionne avec le local. La fusion etant non
// destructive, on l'applique des que le distant a quelque chose a apporter,
// sans avoir a departager un "gagnant" global.
async function pullAndReconcile() {
  const ad = current();
  if (!ad) return { adopted: false, langChanged: false };
  let remote;
  try { remote = await ad.pull(); }
  catch (e) { noteFailure('pull', e); return { adopted: false, langChanged: false, failed: true }; }

  const localAt = localStamp();
  if (!remote) {
    if (state.items.size || state.playlists.size) { touch(); schedulePush(0); }
    else noteSuccess();
    return { adopted: false, langChanged: false };
  }

  const remoteAt = remote.updatedAt || 0;
  const r = await adoptRemote(remote);
  // Le local avait de l'avance (ou la fusion a ajoute quelque chose) : on
  // renvoie l'etat consolide.
  if (localAt !== remoteAt) schedulePush(0);
  return { ...r, adopted: remoteAt > localAt };
}

// Retour d'un ecran d'autorisation (redirection). A appeler TOUT AU DEBUT du
// demarrage : le jeton revient dans le fragment d'URL, la ou le routeur lit sa
// route. Tant que ce n'est pas traite et l'URL nettoyee, l'app afficherait
// n'importe quoi et rejouerait le retour a chaque rechargement.
// Retourne { handled, ok, error }.
export async function handleAuthRedirect() {
  for (const ad of Object.values(REGISTRY)) {
    if (!ad.isRedirectCallback || !ad.isRedirectCallback()) continue;
    try {
      if (await ad.completeAuth()) {
        setProvider(ad.id);
        lastError = null;
        return { handled: true, ok: true, provider: ad.id };
      }
      return { handled: true, ok: false };
    } catch (e) {
      noteFailure('auth', e);
      return { handled: true, ok: false, error: lastError };
    }
  }
  return { handled: false };
}

// Appele au boot APRES loadState (et apres handleAuthRedirect).
// `justConnected` force la fusion initiale avec le cloud.
// Retourne { langChanged, changed } ou { needsAuth } si l'autorisation a expire.
export async function initSync(justConnected = false) {
  ready = true;
  if (!hasSync()) return {};
  // Autorisation perimee : inutile de lancer des requetes vouees a echouer,
  // et surtout on ne declenche aucune authentification ici - nous ne sommes
  // pas dans un geste utilisateur, le navigateur la bloquerait.
  if (needsReconnect()) return { needsAuth: true };
  if (justConnected) return await connectSync();
  return await pullAndReconcile();
}

// Modification locale -> push differe (sauf pendant boot/adoption).
window.addEventListener('bobine:changed', () => {
  if (!ready || suppress || !hasSync()) return;
  schedulePush();
});

// Demarre la connexion a un fournisseur. Les deux passent desormais par une
// redirection : la page est quittee, le fournisseur est active au retour dans
// handleAuthRedirect, puis la fusion initiale a lieu (connectSync).
export async function connect(providerId) {
  const ad = REGISTRY[providerId];
  if (!ad) return {};
  ad.beginAuth();
  return {};
}

// Fusion initiale apres une connexion reussie.
export async function afterConnect() {
  if (!hasSync()) return {};
  return await connectSync();
}

// Deconnexion : retire les jetons ET efface les donnees locales pour
// permettre une connexion propre a un autre compte cloud.
export async function disconnect() {
  clearTimeout(pushTimer);
  suppress = true;
  try { await clearAllData(); }
  finally { suppress = false; }
  clearSync();
  lastSync = 0;
  lastError = null;
  try { localStorage.removeItem(K_LAST_SYNC); } catch { /* quota */ }
}

// Reinitialisation complete : efface local (+ cloud si connecte). La connexion
// cloud est conservee (compte toujours lie, mais vide).
export async function resetAllData() {
  clearTimeout(pushTimer);
  suppress = true;
  try {
    const ad = current();
    if (ad?.wipe) await ad.wipe();
    await clearAllData();
  } finally { suppress = false; }
}

// Retourne { ok } : l'appelant doit s'en servir pour dire la verite a
// l'utilisateur au lieu d'annoncer une reussite systematique.
export async function syncNow() {
  if (!hasSync()) return { ok: false, reason: 'no-provider' };
  if (needsReconnect()) return { ok: false, needsAuth: true, reason: 'auth' };
  const r = await pullAndReconcile();
  const pushed = await doPush();
  return {
    ...r,
    ok: !r.failed && pushed,
    needsAuth: needsReconnect(),
    error: lastError,
  };
}

// Pousse l'etat local vers le cloud (ex. apres onboarding TMDB avec cloud deja connecte).
export async function uploadLocal() {
  if (!hasSync()) return;
  await doPush();
}

// Recuperation explicite depuis le cloud, declenchee par un geste utilisateur :
// on a donc le droit de rouvrir une fenetre d'autorisation, ce que la synchro
// automatique du demarrage ne peut pas faire. Sert quand le compte est deja lie
// mais que ce pull automatique a echoue (jeton expire, popup bloquee, hors
// ligne) - sans ca l'onboarding restait bloque sur "Connecte" sans aucune
// action possible. Leve en cas d'echec, pour que l'appelant puisse le dire.
export async function restoreFromCloud() {
  const ad = current();
  if (!ad) throw new Error('aucun fournisseur');
  let remote;
  try {
    remote = await ad.pull({ interactive: true });
  } catch (e) {
    if (e?.code !== 'AUTH_REQUIRED' || !ad.reauth) { noteFailure('pull', e); throw e; }
    try {
      await ad.reauth();
      // Modele redirection (Dropbox) : la page part, on ne revient pas ici.
      if (ad.usesRedirect) return { found: false, langChanged: false, redirected: true };
      remote = await ad.pull({ interactive: true });
    } catch (e2) { noteFailure('pull', e2); throw e2; }
  }
  if (!remote) { noteSuccess(); return { found: false, langChanged: false }; }
  const r = await adoptRemote(remote);
  await doPush(); // le cloud recoit la fusion, comme a la connexion initiale
  return { ...r, found: true };
}

export function syncStatus() {
  const na = needsReconnect();
  return {
    provider: getProvider(),
    label: current()?.label || getProvider(),
    lastSync,
    lastError,
    needsAuth: na,
    healthy: !lastError && !na,
  };
}

export const PROVIDERS = Object.keys(REGISTRY);
