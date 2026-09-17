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
  lastError = { at: Date.now(), op, message: String(err?.message || err || '') };
  console.warn(`[bobine] synchro distante (${op}) echouee`, err);
  if (first) window.dispatchEvent(new CustomEvent('bobine:sync-error', { detail: lastError }));
}

function noteSuccess() {
  lastError = null;
  lastSync = Date.now();
  try { localStorage.setItem(K_LAST_SYNC, String(lastSync)); } catch { /* quota */ }
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

// Appele au boot APRES loadState. Gere un eventuel retour OAuth, puis
// synchronise. Retourne { langChanged } si l'adoption a change la langue.
export async function initSync() {
  let justConnected = false;
  for (const ad of Object.values(REGISTRY)) {
    if (ad.isRedirectCallback && ad.isRedirectCallback()) {
      try {
        if (await ad.completeAuth()) {
          setProvider(ad.id);
          justConnected = true;
        }
      } catch (e) { noteFailure('auth', e); }
      break;
    }
  }
  ready = true;
  if (!hasSync()) return {};
  if (justConnected) return await connectSync();
  return await pullAndReconcile();
}

// Modification locale -> push differe (sauf pendant boot/adoption).
window.addEventListener('bobine:changed', () => {
  if (!ready || suppress || !hasSync()) return;
  schedulePush();
});

// Demarre la connexion a un fournisseur.
// - modele redirection (Dropbox) : quitte la page ; le provider est active au
//   retour, dans initSync (connectSync = cloud prioritaire).
// - modele popup (Google Drive) : on attend le jeton, puis on active + synchro.
export async function connect(providerId) {
  const ad = REGISTRY[providerId];
  if (!ad) return {};
  if (ad.usesRedirect) { ad.beginAuth(); return {}; }
  await ad.beginAuth();
  setProvider(providerId);
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
  const r = await pullAndReconcile();
  const pushed = await doPush();
  return { ...r, ok: !r.failed && pushed, error: lastError };
}

// Pousse l'etat local vers le cloud (ex. apres onboarding TMDB avec cloud deja connecte).
export async function uploadLocal() {
  if (!hasSync()) return;
  await doPush();
}

export function syncStatus() {
  return { provider: getProvider(), lastSync, lastError, healthy: !lastError };
}

export const PROVIDERS = Object.keys(REGISTRY);
