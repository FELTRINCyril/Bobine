// Synchronisation distante : recupere au demarrage, pousse (anti-rebond) apres
// chaque modification. Conflit resolu au niveau du document entier, "dernier
// ecrit gagne" (comparaison des horodatages local/distant). Voir PLAN-PHASE2.md.
import { localStamp } from './db.js';
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

// Recupere le distant et departage avec le local (dernier ecrit gagne).
async function pullAndReconcile() {
  const ad = current();
  if (!ad) return {};
  let remote;
  try { remote = await ad.pull(); }
  catch (e) { console.warn('[bobine] synchro distante (pull) echouee', e); return {}; }

  const localAt = localStamp();
  if (!remote) { schedulePush(0); return {}; }           // rien en ligne -> 1er envoi
  if ((remote.updatedAt || 0) > localAt) {               // distant plus recent -> adoption
    suppress = true;
    let r = {};
    try { r = await applySnapshot(remote); }
    finally { suppress = false; }
    lastSync = Date.now();
    return r;
  }
  if (localAt > (remote.updatedAt || 0)) schedulePush(0); // local plus recent -> envoi
  return {};
}

// Appele au boot APRES loadState. Gere un eventuel retour OAuth, puis
// synchronise. Retourne { langChanged } si l'adoption a change la langue.
export async function initSync() {
  for (const ad of Object.values(REGISTRY)) {
    if (ad.isRedirectCallback && ad.isRedirectCallback()) {
      try {
        if (await ad.completeAuth()) setProvider(ad.id);
      } catch (e) { console.warn('[bobine] fin d\'authentification echouee', e); }
      break;
    }
  }
  ready = true;
  if (!hasSync()) return {};
  return await pullAndReconcile();
}

// Modification locale -> push differe (sauf pendant boot/adoption).
window.addEventListener('bobine:changed', () => {
  if (!ready || suppress || !hasSync()) return;
  schedulePush();
});

// Demarre la connexion a un fournisseur.
// - modele redirection (Dropbox) : quitte la page ; le provider est active au
//   retour, dans initSync.
// - modele popup (Google Drive) : on attend le jeton, puis on active + synchro.
export async function connect(providerId) {
  const ad = REGISTRY[providerId];
  if (!ad) return;
  if (ad.usesRedirect) { ad.beginAuth(); return; }
  await ad.beginAuth();
  setProvider(providerId);
  await syncNow();
}

export function disconnect() {
  clearSync();
  clearTimeout(pushTimer);
}

export async function syncNow() {
  if (!hasSync()) return;
  await pullAndReconcile();
  await doPush();
}

export function syncStatus() {
  return { provider: getProvider(), lastSync };
}

export const PROVIDERS = Object.keys(REGISTRY);
