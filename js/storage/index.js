// Couche stockage distant : configuration du fournisseur actif + serialisation
// de l'etat complet en un "document" JSON, et son application inverse.
// AUCUN secret dans le depot : seuls des jetons utilisateur (localStorage) et
// des client_id publics (dans les adaptateurs) sont manipules. Voir PLAN-PHASE2.md.
import { state, localStamp, replaceAll } from '../db.js';

// Cles de config du stockage distant (localStorage)
const K_PROVIDER = 'bobine_sync_provider'; // 'dropbox' | 'gdrive' | ''
const K_TOKEN = 'bobine_sync_token';       // JSON du jeton du fournisseur actif

// Cles reprises de config.js / api.js / views.js (source de verite ailleurs,
// on les lit/ecrit ici pour embarquer TOUT dans le document distant).
const K_TMDB_MODE = 'bobine_tmdb_mode';
const K_TMDB_KEY = 'bobine_tmdb_key';
const K_TMDB_PROXY = 'bobine_tmdb_proxy';
const K_LANG = 'bobine_lang';
const K_THEME = 'bobine_theme';

export const getProvider = () => localStorage.getItem(K_PROVIDER) || '';
export const hasSync = () => getProvider() !== '';

export function setProvider(id) { localStorage.setItem(K_PROVIDER, id); }

export function getToken() {
  try { return JSON.parse(localStorage.getItem(K_TOKEN) || 'null'); }
  catch { return null; }
}
export function setToken(tok) { localStorage.setItem(K_TOKEN, JSON.stringify(tok)); }

export function clearSync() {
  localStorage.removeItem(K_PROVIDER);
  localStorage.removeItem(K_TOKEN);
}

// Nom du fichier distant (dans le dossier prive d'app du fournisseur)
export const REMOTE_FILE = 'bobine.json';

// Construit le document complet a envoyer au stockage distant.
export function buildSnapshot() {
  const config = { mode: localStorage.getItem(K_TMDB_MODE) || '' };
  if (config.mode === 'key') config.key = localStorage.getItem(K_TMDB_KEY) || '';
  if (config.mode === 'proxy') config.proxy = localStorage.getItem(K_TMDB_PROXY) || '';
  return {
    v: 1,
    updatedAt: localStamp(),
    config,
    prefs: {
      lang: localStorage.getItem(K_LANG) || '',
      theme: localStorage.getItem(K_THEME) || '',
    },
    items: [...state.items.values()],
    playlists: [...state.playlists.values()],
  };
}

// Applique un document distant sur l'etat local (adoption "dernier ecrit
// gagne"). Retourne { langChanged } pour que l'appelant recharge si besoin.
export async function applySnapshot(doc) {
  if (!doc || typeof doc !== 'object') return { langChanged: false };
  const prevLang = localStorage.getItem(K_LANG) || '';

  // Config TMDB
  const c = doc.config || {};
  if (c.mode) {
    localStorage.setItem(K_TMDB_MODE, c.mode);
    if (c.mode === 'key' && c.key) {
      localStorage.setItem(K_TMDB_KEY, c.key);
      localStorage.removeItem(K_TMDB_PROXY);
    } else if (c.mode === 'proxy' && c.proxy) {
      localStorage.setItem(K_TMDB_PROXY, c.proxy);
      localStorage.removeItem(K_TMDB_KEY);
    }
  }
  // Preferences
  const p = doc.prefs || {};
  if (p.lang) localStorage.setItem(K_LANG, p.lang);
  if (p.theme) localStorage.setItem(K_THEME, p.theme);

  // Donnees
  await replaceAll(doc.items, doc.playlists);

  return { langChanged: !!p.lang && p.lang !== prevLang };
}
