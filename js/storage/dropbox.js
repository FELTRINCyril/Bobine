// Adaptateur Dropbox : OAuth 2.0 PKCE (client public, pas de secret) + lecture
// et ecriture d'un fichier unique dans le dossier prive d'app.
// client_id public (visible cote navigateur par nature) - ce n'est pas un secret.
import { getToken, setToken, REMOTE_FILE } from './index.js';

const CLIENT_ID = 'wmpszhrdbuyrrbm';
const AUTHORIZE = 'https://www.dropbox.com/oauth2/authorize';
const TOKEN = 'https://api.dropboxapi.com/oauth2/token';
const DL = 'https://content.dropboxapi.com/2/files/download';
const UL = 'https://content.dropboxapi.com/2/files/upload';
const PATH = '/' + REMOTE_FILE;
const K_VERIFIER = 'bobine_dbx_verifier';

// URL de redirection = origine + chemin de l'app (sans hash ni query). Doit
// correspondre exactement a une URI declaree dans la console Dropbox.
const redirectUri = () => location.origin + location.pathname;

// ---- PKCE ----
function randomVerifier() {
  const a = new Uint8Array(64);
  crypto.getRandomValues(a);
  return b64url(a.buffer);
}
function b64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function challenge(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return b64url(digest);
}

// ---- Auth ----
export async function beginAuth() {
  const verifier = randomVerifier();
  localStorage.setItem(K_VERIFIER, verifier);
  const url = new URL(AUTHORIZE);
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('code_challenge', await challenge(verifier));
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('redirect_uri', redirectUri());
  url.searchParams.set('token_access_type', 'offline'); // -> refresh_token
  location.href = url.toString();
}

// Un retour de redirection Dropbox est-il present dans l'URL ?
export function isRedirectCallback() {
  return new URLSearchParams(location.search).has('code') && !!localStorage.getItem(K_VERIFIER);
}

// Echange le code contre les jetons. Retourne true si OK.
export async function completeAuth() {
  const code = new URLSearchParams(location.search).get('code');
  const verifier = localStorage.getItem(K_VERIFIER);
  if (!code || !verifier) return false;
  const body = new URLSearchParams({
    code,
    grant_type: 'authorization_code',
    client_id: CLIENT_ID,
    code_verifier: verifier,
    redirect_uri: redirectUri(),
  });
  const res = await fetch(TOKEN, { method: 'POST', body });
  localStorage.removeItem(K_VERIFIER);
  // Nettoie l'URL (retire ?code=...) sans casser le hash de navigation.
  history.replaceState(null, '', location.pathname + location.hash);
  if (!res.ok) return false;
  const t = await res.json();
  setToken({
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    expires_at: Date.now() + (t.expires_in || 14400) * 1000,
  });
  return true;
}

async function refresh(tok) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tok.refresh_token,
    client_id: CLIENT_ID,
  });
  const res = await fetch(TOKEN, { method: 'POST', body });
  if (!res.ok) throw new Error('refresh dropbox echoue');
  const t = await res.json();
  const next = { ...tok, access_token: t.access_token, expires_at: Date.now() + (t.expires_in || 14400) * 1000 };
  setToken(next);
  return next.access_token;
}

async function accessToken() {
  let tok = getToken();
  if (!tok) throw new Error('non connecte');
  if (Date.now() > tok.expires_at - 60000 && tok.refresh_token) tok.access_token = await refresh(tok);
  return tok.access_token;
}

// ---- Fichier ----
export async function pull() {
  const at = await accessToken();
  const res = await fetch(DL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${at}`, 'Dropbox-API-Arg': JSON.stringify({ path: PATH }) },
  });
  if (res.status === 409) return null; // fichier absent
  if (!res.ok) throw new Error(`dropbox download ${res.status}`);
  return JSON.parse(await res.text());
}

export async function push(doc) {
  const at = await accessToken();
  const res = await fetch(UL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${at}`,
      'Dropbox-API-Arg': JSON.stringify({ path: PATH, mode: 'overwrite', mute: true }),
      'Content-Type': 'application/octet-stream',
    },
    body: JSON.stringify(doc),
  });
  if (!res.ok) throw new Error(`dropbox upload ${res.status}`);
}

export const adapter = { id: 'dropbox', beginAuth, isRedirectCallback, completeAuth, pull, push };
