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

const current = () => REGISTRY[getProvider()] || null;

let ready = false;    // tant que faux, on ne pousse pas (boot/hydratation)
let suppress = false;  // vrai pendant l'adoption d'un snapshot distant
let pushTimer = null;
let lastSync = 0;

function schedulePush(delay = 2000) {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(doPush, delay);
}

async function doPush() {
  const ad = current();
  if (!ad) return;
  try {
    await ad.push(buildSnapshot());
    lastSync = Date.now();
  } catch (e) {
    console.warn('[bobine] synchro distante (push) echouee', e);
  }
}

// Adoption complete d'un snapshot distant.
async function adoptRemote(remote) {
  suppress = true;
  let r = {};
  try { r = await applySnapshot(remote); }
  finally { suppress = false; }
  setStamp(remote.updatedAt || Date.now());
  lastSync = Date.now();
  return r;
}

// Connexion initiale : si un fichier cloud existe deja, il ecrase le local
// (meme si l'utilisateur avait saisi des donnees avant de se connecter).
async function connectSync() {
  const ad = current();
  if (!ad) return {};
  let remote;
  try { remote = await ad.pull(); }
  catch (e) { console.warn('[bobine] synchro distante (pull) echouee', e); return {}; }

  if (remote) return await adoptRemote(remote);

  // Cloud vide : premier envoi si on a des donnees locales.
  if (state.items.size || state.playlists.size) {
    touch();
    await doPush();
  }
  return {};
}

// Recupere le distant et departage avec le local (dernier ecrit gagne).
async function pullAndReconcile() {
  const ad = current();
  if (!ad) return { adopted: false, langChanged: false };
  let remote;
  try { remote = await ad.pull(); }
  catch (e) { console.warn('[bobine] synchro distante (pull) echouee', e); return { adopted: false, langChanged: false }; }

  const localAt = localStamp();
  if (!remote) {
    if (state.items.size || state.playlists.size) { touch(); schedulePush(0); }
    return { adopted: false, langChanged: false };
  }
  if ((remote.updatedAt || 0) > localAt) {
    const r = await adoptRemote(remote);
    return { ...r, adopted: true };
  }
  if (localAt > (remote.updatedAt || 0)) schedulePush(0);
  return { adopted: false, langChanged: false };
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
      } catch (e) { console.warn('[bobine] fin d\'authentification echouee', e); }
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

export async function syncNow() {
  if (!hasSync()) return {};
  const r = await pullAndReconcile();
  if (!r.adopted) await doPush();
  return r;
}

// Pousse l'etat local vers le cloud (ex. apres onboarding TMDB avec cloud deja connecte).
export async function uploadLocal() {
  if (!hasSync()) return;
  await doPush();
}

export function syncStatus() {
  return { provider: getProvider(), lastSync };
}

export const PROVIDERS = Object.keys(REGISTRY);
