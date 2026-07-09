// Adaptateur Google Drive : OAuth via Google Identity Services (modele "token",
// popup, sans secret) + lecture/ecriture d'un fichier unique dans le dossier
// cache d'app (appDataFolder). client_id public par nature.
import { getToken, setToken, REMOTE_FILE } from './index.js';

const CLIENT_ID = '288064990347-3kq8r7j393rkppj8unkl21k84a0j41kb.apps.googleusercontent.com';
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const GIS_SRC = 'https://accounts.google.com/gsi/client';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

let fileId = null; // id du fichier distant, mis en cache sur la session

// Charge la lib Google Identity Services (une seule fois).
let gisReady = null;
function loadGis() {
  if (gisReady) return gisReady;
  gisReady = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const s = document.createElement('script');
    s.src = GIS_SRC; s.async = true; s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('chargement Google Identity echoue'));
    document.head.appendChild(s);
  });
  return gisReady;
}

// Demande un jeton d'acces (popup). prompt='consent' pour la connexion
// initiale, '' pour un renouvellement silencieux.
async function requestToken(prompt) {
  await loadGis();
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      prompt,
      callback: (resp) => {
        if (resp.error) { reject(new Error(resp.error)); return; }
        setToken({ access_token: resp.access_token, expires_at: Date.now() + (resp.expires_in || 3600) * 1000 });
        resolve(resp.access_token);
      },
      error_callback: (err) => reject(new Error(err?.type || 'popup fermee')),
    });
    client.requestAccessToken();
  });
}

export async function beginAuth() {
  await requestToken('consent');
}

// Modele popup : pas de retour par redirection d'URL.
export function isRedirectCallback() { return false; }
export async function completeAuth() { return false; }

async function accessToken() {
  const tok = getToken();
  if (tok && Date.now() < tok.expires_at - 60000) return tok.access_token;
  return await requestToken(''); // renouvellement (silencieux si session active)
}

async function findId(at) {
  const q = encodeURIComponent(`name='${REMOTE_FILE}'`);
  const res = await fetch(`${API}/files?spaces=appDataFolder&fields=files(id)&q=${q}`, {
    headers: { Authorization: `Bearer ${at}` },
  });
  if (!res.ok) throw new Error(`gdrive list ${res.status}`);
  fileId = (await res.json()).files?.[0]?.id || null;
  return fileId;
}

export async function pull() {
  const at = await accessToken();
  const id = await findId(at);
  if (!id) return null; // fichier absent
  const res = await fetch(`${API}/files/${id}?alt=media`, { headers: { Authorization: `Bearer ${at}` } });
  if (!res.ok) throw new Error(`gdrive download ${res.status}`);
  return JSON.parse(await res.text());
}

export async function push(doc) {
  const at = await accessToken();
  const body = JSON.stringify(doc);
  const id = fileId || await findId(at);
  if (id) {
    const res = await fetch(`${UPLOAD}/files/${id}?uploadType=media`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' },
      body,
    });
    if (!res.ok) throw new Error(`gdrive update ${res.status}`);
  } else {
    const boundary = 'bobinegdrive';
    const meta = { name: REMOTE_FILE, parents: ['appDataFolder'] };
    const multipart =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
    const res = await fetch(`${UPLOAD}/files?uploadType=multipart&fields=id`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${at}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
      body: multipart,
    });
    if (!res.ok) throw new Error(`gdrive create ${res.status}`);
    fileId = (await res.json()).id;
  }
}

export async function wipe() {
  const at = await accessToken();
  const id = await findId(at);
  if (!id) return;
  const res = await fetch(`${API}/files/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${at}` },
  });
  if (!res.ok) throw new Error(`gdrive delete ${res.status}`);
  fileId = null;
}

export const adapter = { id: 'gdrive', usesRedirect: false, beginAuth, isRedirectCallback, completeAuth, pull, push, wipe };
