// Themes visuels : skin (palette + formes) x mode (clair / sombre).
// Seul le rendu change ; aucune logique metier ne depend du theme actif.

export const SKINS = [
  { id: 'cinema', label: 'Cinema', desc: 'Salle obscure, accent framboise', preview: ['#0c0a10', '#ff3d6e', '#3ddc97'] },
  { id: 'neon', label: 'Neon', desc: 'Cyberpunk, bords nets, lueurs', preview: ['#06060f', '#00f0ff', '#ff2d9a'] },
  { id: 'minimal', label: 'Minimal', desc: 'Epure, contrastes nets', preview: ['#111111', '#ffffff', '#4ade80'] },
  { id: 'retro', label: 'Retro', desc: 'Chaleureux, style affiche vintage', preview: ['#14100c', '#e8a030', '#6bc96b'] },
  { id: 'ocean', label: 'Ocean', desc: 'Bleu profond, formes douces', preview: ['#041018', '#2ec4b6', '#70e000'] },
];

const SKIN_KEY = 'bobine_skin';
const MODE_KEY = 'bobine_mode';
const LEGACY_KEY = 'bobine_theme';

const META = {
  'cinema-dark': '#0c0a10',
  'cinema-light': '#f4f2f8',
  'neon-dark': '#06060f',
  'neon-light': '#ece8ff',
  'minimal-dark': '#111111',
  'minimal-light': '#fafafa',
  'retro-dark': '#14100c',
  'retro-light': '#f5efe4',
  'ocean-dark': '#041018',
  'ocean-light': '#e8f4f8',
};

function migrateLegacy() {
  if (localStorage.getItem(SKIN_KEY)) return;
  const legacy = localStorage.getItem(LEGACY_KEY);
  localStorage.setItem(SKIN_KEY, 'cinema');
  localStorage.setItem(MODE_KEY, legacy === 'light' ? 'light' : 'dark');
}

export function getSkin() {
  migrateLegacy();
  const s = localStorage.getItem(SKIN_KEY) || 'cinema';
  return SKINS.some((x) => x.id === s) ? s : 'cinema';
}

export function getMode() {
  migrateLegacy();
  return localStorage.getItem(MODE_KEY) === 'light' ? 'light' : 'dark';
}

export function applyAppearance(skin, mode) {
  const s = SKINS.some((x) => x.id === skin) ? skin : 'cinema';
  const m = mode === 'light' ? 'light' : 'dark';
  localStorage.setItem(SKIN_KEY, s);
  localStorage.setItem(MODE_KEY, m);
  localStorage.setItem(LEGACY_KEY, m); // compat index.html inline + cloud ancien
  const root = document.documentElement;
  root.dataset.skin = s;
  root.dataset.mode = m;
  delete root.dataset.theme;
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', META[`${s}-${m}`] || META['cinema-dark']);
}

export function initAppearance() {
  applyAppearance(getSkin(), getMode());
}
