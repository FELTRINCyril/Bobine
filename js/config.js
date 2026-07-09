// Resolution de l'acces TMDB au runtime. AUCUN secret n'est stocke dans le
// depot : soit l'utilisateur fournit sa propre cle TMDB (gardee en local sur
// son appareil), soit l'app passe par un proxy (Cloudflare Worker) qui garde
// la cle cote serveur. Voir SECURITE.md.

import { touch } from './db.js';

const K_MODE = 'bobine_tmdb_mode';   // 'proxy' | 'key'
const K_PROXY = 'bobine_tmdb_proxy'; // base URL du Worker (sans slash final)
const K_KEY = 'bobine_tmdb_key';     // cle TMDB v3 perso

// Proxy public par defaut (mode simple, zero config cote utilisateur). Laisser
// vide tant que le Worker n'est pas deploye ; une fois deploye, coller ici son
// URL (ex: 'https://bobine-tmdb.mon-compte.workers.dev').
// CE N'EST PAS UN SECRET : c'est juste une adresse publique.
export const DEFAULT_PROXY = '';

const clean = (s) => (s || '').trim().replace(/\/+$/, '');

// TMDB fournit deux identifiants : une cle v3 (courte, hex) utilisee en query
// ?api_key=, et un jeton v4 (long, JWT avec des points) utilise en Bearer. On
// accepte les deux et on choisit l'auth selon la forme.
export const isV4Token = (s) => /\./.test((s || '').trim());

// Retourne la config active, ou null si l'app n'est pas encore configuree.
export function getConfig() {
  const mode = localStorage.getItem(K_MODE);
  if (mode === 'key') {
    const key = localStorage.getItem(K_KEY);
    return key ? { mode: 'key', key } : null;
  }
  if (mode === 'proxy') {
    const base = clean(localStorage.getItem(K_PROXY) || DEFAULT_PROXY);
    return base ? { mode: 'proxy', base } : null;
  }
  return null;
}

export const isConfigured = () => getConfig() !== null;
export const hasDefaultProxy = () => clean(DEFAULT_PROXY) !== '';

export function useKey(key) {
  const k = (key || '').trim();
  if (!k) throw new Error('cle vide');
  localStorage.setItem(K_MODE, 'key');
  localStorage.setItem(K_KEY, k);
  localStorage.removeItem(K_PROXY);
  touch();
}

export function useProxy(base) {
  const b = clean(base || DEFAULT_PROXY);
  if (!b) throw new Error('proxy vide');
  localStorage.setItem(K_MODE, 'proxy');
  localStorage.setItem(K_PROXY, b);
  localStorage.removeItem(K_KEY);
  touch();
}

export function resetConfig() {
  localStorage.removeItem(K_MODE);
  localStorage.removeItem(K_PROXY);
  localStorage.removeItem(K_KEY);
}
