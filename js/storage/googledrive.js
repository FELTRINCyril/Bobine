// Adaptateur Google Drive : lecture/ecriture d'un fichier unique dans le
// dossier cache d'app (appDataFolder). Le client_id est public par nature.
//
// AUTHENTIFICATION - pourquoi une redirection et plus une popup
// -------------------------------------------------------------
// L'ancienne version passait par Google Identity Services, qui n'ouvre l'ecran
// de consentement que dans une POPUP. Deux consequences vecues :
//  1. dans une PWA installee sur iOS, la popup s'ouvre dans Safari et ne revient
//     jamais vers l'app : la reconnexion echouait systematiquement ;
//  2. le renouvellement du jeton etait tente au demarrage, donc hors geste
//     utilisateur, et le navigateur bloquait la popup.
// On utilise desormais une redirection pleine page (flux implicite OAuth 2.0),
// qui fonctionne a l'identique en onglet et en PWA installee.
//
// LIMITE ASSUMEE : Google ne delivre pas de refresh_token a un client public.
// Le jeton dure une heure et ne peut PAS etre renouvele sans un geste de
// l'utilisateur. On ne tente donc jamais de renouvellement automatique : on
// signale clairement l'etat et on propose la reconnexion en un tap.
// Pour supprimer ce renouvellement periodique il faudrait un echange de code
// cote serveur (Worker Cloudflare), voir worker/README.md.
import { getToken, setToken, clearToken, REMOTE_FILE } from './index.js';

const CLIENT_ID = '288064990347-3kq8r7j393rkppj8unkl21k84a0j41kb.apps.googleusercontent.com';
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

const K_STATE = 'bobine_gdrive_state';   // anti-rejeu, le temps de l'aller-retour
const K_RETURN = 'bobine_gdrive_return'; // hash a restaurer apres le retour

let fileId = null; // id du fichier distant, mis en cache sur la session

// Erreur dediee : l'appelant doit proposer une reconnexion, pas afficher un
// message technique ni reessayer en boucle.
export class AuthExpiredError extends Error {
  constructor(msg = 'jeton Google expire') {
    super(msg);
    this.name = 'AuthExpiredError';
    this.needsAuth = true;
    // Code partage avec l'adaptateur Dropbox, sur lequel s'appuie
    // restoreFromCloud() (sync.js) pour savoir qu'une reautorisation aiderait.
    this.code = 'AUTH_REQUIRED';
  }
}

// URI de retour : doit correspondre EXACTEMENT a une "URI de redirection
// autorisee" du client OAuth dans la console Google Cloud.
export function redirectUri() {
  return location.origin + location.pathname.replace(/index\.html$/, '');
}

const randomState = () => {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return [...a].map((n) => n.toString(16).padStart(2, '0')).join('');
};

export function hasValidToken() {
  const tok = getToken();
  return !!tok?.access_token && Date.now() < (tok.expires_at || 0) - 60000;
}

// Quitte la page vers l'ecran Google. Le retour est traite par completeAuth().
export function beginAuth() {
  const state = randomState();
  try {
    sessionStorage.setItem(K_STATE, state);
    // On memorise la page en cours pour y revenir apres l'aller-retour.
    sessionStorage.setItem(K_RETURN, location.hash || '#/home');
  } catch { /* navigation privee */ }

  const url = new URL(AUTH);
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('redirect_uri', redirectUri());
  url.searchParams.set('response_type', 'token');
  url.searchParams.set('scope', SCOPE);
  url.searchParams.set('state', state);
  url.searchParams.set('include_granted_scopes', 'true');
  // Pas de prompt=consent : si l'autorisation a deja ete donnee, Google
  // renvoie directement, sans aucun ecran. La reconnexion est alors
  // quasi instantanee.
  location.assign(url.toString());
}

// Le retour de Google arrive dans le FRAGMENT (#access_token=... ou #error=...),
// au meme endroit que la route de l'app : il faut donc le traiter avant que le
// routeur ne lise le hash.
export function isRedirectCallback() {
  const h = location.hash || '';
  return /[#&](access_token|error)=/.test(h) && /[#&]state=/.test(h);
}

export async function completeAuth() {
  const params = new URLSearchParams((location.hash || '').replace(/^#/, ''));
  const attendu = (() => {
    try { return sessionStorage.getItem(K_STATE); } catch { return null; }
  })();
  const recu = params.get('state');

  // Nettoie l'URL quoi qu'il arrive : un fragment OAuth laisse en place
  // casserait le routeur et reviendrait a chaque rechargement.
  const retour = (() => {
    try { return sessionStorage.getItem(K_RETURN) || '#/home'; } catch { return '#/home'; }
  })();
  try {
    sessionStorage.removeItem(K_STATE);
    sessionStorage.removeItem(K_RETURN);
  } catch { /* ignore */ }
  try { history.replaceState(history.state, '', location.pathname + location.search + retour); }
  catch { location.hash = retour; }

  if (!attendu || recu !== attendu) throw new Error('reponse Google non concordante (state)');

  const err = params.get('error');
  if (err) {
    // redirect_uri_mismatch se voit normalement sur la page Google elle-meme,
    // mais on le traite ici aussi pour donner un message actionnable.
    if (err === 'redirect_uri_mismatch') {
      throw new Error(`URI de redirection non autorisee. Ajoute ${redirectUri()} dans la console Google Cloud.`);
    }
    throw new Error(`Google a refuse l'autorisation (${err})`);
  }

  const at = params.get('access_token');
  if (!at) throw new Error('aucun jeton dans la reponse Google');
  const ttl = Number(params.get('expires_in')) || 3600;
  setToken({ access_token: at, expires_at: Date.now() + ttl * 1000 });
  return true;
}

// Une tentative de redirection laisse un marqueur en session, efface au
// retour par completeAuth(). Le retrouver intact signifie que Google n'a
// jamais redirige vers nous : dans 99% des cas l'URI de redirection n'est pas
// declaree dans la console Google Cloud. On le detecte pour afficher la marche
// a suivre au lieu de laisser l'utilisateur devant un bouton sans effet.
export function tentativeRedirectionEchouee() {
  try { return !!sessionStorage.getItem(K_STATE); } catch { return false; }
}

export function oublierTentative() {
  try {
    sessionStorage.removeItem(K_STATE);
    sessionStorage.removeItem(K_RETURN);
  } catch { /* ignore */ }
}

// Jeton utilisable, ou AuthExpiredError. Ne declenche JAMAIS d'authentification
// tout seul : c'est a l'interface de la proposer, depuis un geste utilisateur.
function accessToken() {
  const tok = getToken();
  if (tok?.access_token && Date.now() < (tok.expires_at || 0) - 60000) return tok.access_token;
  throw new AuthExpiredError();
}

// Un 401/403 signifie jeton revoque ou perime : on le jette pour que l'app
// bascule proprement en "reconnexion necessaire".
function checkResponse(res, op) {
  if (res.status === 401 || res.status === 403) {
    clearToken();
    throw new AuthExpiredError(`Google a refuse l'acces (${res.status})`);
  }
  if (!res.ok) throw new Error(`gdrive ${op} ${res.status}`);
  return res;
}

// Toute requete reseau est bornee : sans cela un appel qui ne repond jamais
// laissait la synchro (et son bouton) bloquee indefiniment.
async function fetchBorne(url, opts = {}, ms = 20000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } catch (e) {
    if (e?.name === 'AbortError') throw new Error('Google Drive ne repond pas');
    throw e;
  } finally {
    clearTimeout(t);
  }
}

async function findId(at) {
  const q = encodeURIComponent(`name='${REMOTE_FILE}' and trashed=false`);
  const res = await fetchBorne(`${API}/files?spaces=appDataFolder&fields=files(id)&q=${q}`, {
    headers: { Authorization: `Bearer ${at}` },
  });
  checkResponse(res, 'list');
  fileId = (await res.json()).files?.[0]?.id || null;
  return fileId;
}

// L'option { interactive } est acceptee pour rester compatible avec
// restoreFromCloud(), mais elle n'a plus d'objet : sans popup a declencher,
// l'obtention d'un jeton passe toujours par une redirection explicite.
export async function pull(_opts) {
  const at = accessToken();
  const id = await findId(at);
  if (!id) return null; // fichier absent
  const res = await fetchBorne(`${API}/files/${id}?alt=media`, { headers: { Authorization: `Bearer ${at}` } });
  checkResponse(res, 'download');
  return JSON.parse(await res.text());
}

export async function push(doc, _opts) {
  const at = accessToken();
  const body = JSON.stringify(doc);
  const id = fileId || await findId(at);
  if (id) {
    const res = await fetchBorne(`${UPLOAD}/files/${id}?uploadType=media`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' },
      body,
    });
    checkResponse(res, 'update');
  } else {
    const boundary = 'bobinegdrive';
    const meta = { name: REMOTE_FILE, parents: ['appDataFolder'] };
    const multipart =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
    const res = await fetchBorne(`${UPLOAD}/files?uploadType=multipart&fields=id`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${at}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
      body: multipart,
    });
    checkResponse(res, 'create');
    fileId = (await res.json()).id;
  }
}

export async function wipe(_opts) {
  const at = accessToken();
  const id = await findId(at);
  if (!id) return;
  const res = await fetchBorne(`${API}/files/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${at}` },
  });
  checkResponse(res, 'delete');
  fileId = null;
}

export const adapter = {
  id: 'gdrive',
  label: 'Google Drive',
  usesRedirect: true,
  beginAuth,
  reauth: beginAuth,
  isRedirectCallback,
  completeAuth,
  hasValidToken,
  tentativeRedirectionEchouee,
  oublierTentative,
  redirectUri,
  pull,
  push,
  wipe,
};
