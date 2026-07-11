// Themes visuels : skin (style complet) x mode (clair / sombre).
import { touch } from './db.js';
import { h, esc, openSheet } from './ui.js';
import { tr } from './i18n.js';

export const SKINS = [
  { id: 'cinema', label: 'Cinema', desc: 'Salle obscure, affiches en vedette', preview: ['#0c0a10', '#ff3d6e', '#3ddc97'] },
  { id: 'neon', label: 'Neon', desc: 'Cyberpunk, traits nets, lueurs', preview: ['#06060f', '#00f0ff', '#ff2d9a'] },
  { id: 'minimal', label: 'Minimal', desc: 'Monochrome epure, coins ronds', preview: ['#111111', '#ffffff', '#4ade80'] },
  { id: 'retro', label: 'Retro', desc: 'Affiche vintage, serif chaleureux', preview: ['#14100c', '#e8a030', '#6bc96b'] },
  { id: 'ocean', label: 'Ocean', desc: 'Bleu profond, pilules fluides', preview: ['#041018', '#2ec4b6', '#70e000'] },
  { id: 'noir', label: 'Noir', desc: 'Film noir, or et noir strict', preview: ['#000000', '#c9a227', '#ffffff'] },
  { id: 'sakura', label: 'Sakura', desc: 'Pastel japonais, doux et leger', preview: ['#1a1018', '#ff6b9d', '#ffc2d4'] },
  { id: 'terminal', label: 'Terminal', desc: 'Console retro, phosphore vert', preview: ['#0a0f0a', '#33ff66', '#1a3a1a'] },
  { id: 'paper', label: 'Paper', desc: 'Editorial journal, colonnes nettes', preview: ['#f0ebe3', '#1a1a1a', '#c41e3a'] },
  { id: 'candy', label: 'Candy', desc: 'Pop coloré, bulles et ombres douces', preview: ['#1a0a20', '#ff6bcb', '#6bcfff'] },
];

const SKIN_KEY = 'bobine_skin';
const MODE_KEY = 'bobine_mode';
const LEGACY_KEY = 'bobine_theme';

const META = {
  'cinema-dark': '#0c0a10', 'cinema-light': '#f4f2f8',
  'neon-dark': '#06060f', 'neon-light': '#ece8ff',
  'minimal-dark': '#111111', 'minimal-light': '#fafafa',
  'retro-dark': '#14100c', 'retro-light': '#f5efe4',
  'ocean-dark': '#041018', 'ocean-light': '#e8f4f8',
  'noir-dark': '#000000', 'noir-light': '#f5f0e6',
  'sakura-dark': '#1a1018', 'sakura-light': '#fff5f8',
  'terminal-dark': '#0a0f0a', 'terminal-light': '#e8f5e9',
  'paper-dark': '#1c1916', 'paper-light': '#f0ebe3',
  'candy-dark': '#1a0a20', 'candy-light': '#fff0fa',
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

export function getSkinInfo(id) {
  return SKINS.find((s) => s.id === id) || SKINS[0];
}

export function applyAppearance(skin, mode) {
  const s = SKINS.some((x) => x.id === skin) ? skin : 'cinema';
  const m = mode === 'light' ? 'light' : 'dark';
  localStorage.setItem(SKIN_KEY, s);
  localStorage.setItem(MODE_KEY, m);
  localStorage.setItem(LEGACY_KEY, m);
  const root = document.documentElement;
  root.dataset.skin = s;
  root.dataset.mode = m;
  delete root.dataset.theme;
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', META[`${s}-${m}`] || META['cinema-dark']);
  touch(); // synchro cloud
}

export function initAppearance() {
  applyAppearance(getSkin(), getMode());
}

export function openThemePicker({ onPick } = {}) {
  const body = h('<div class="theme-picker-sheet"></div>');
  body.appendChild(h(`<h3>${tr('Choisir un theme')}</h3>`));

  const grid = h('<div class="theme-grid theme-grid--sheet"></div>');
  const sync = () => {
    grid.querySelectorAll('.theme-card').forEach((c) => {
      c.classList.toggle('on', c.dataset.skin === getSkin());
    });
  };

  for (const sk of SKINS) {
    const card = h(`
      <button type="button" class="theme-card" data-skin="${sk.id}">
        <span class="theme-card-preview">
          <i style="background:${sk.preview[0]}"></i>
          <i style="background:${sk.preview[1]}"></i>
          <i style="background:${sk.preview[2]}"></i>
        </span>
        <span class="theme-card-name">${tr(sk.label)}</span>
        <span class="theme-card-desc">${tr(sk.desc)}</span>
      </button>
    `);
    card.addEventListener('click', () => {
      applyAppearance(sk.id, getMode());
      sync();
      onPick?.();
    });
    grid.appendChild(card);
  }
  sync();
  body.appendChild(grid);

  const modeSeg = h(`
    <p class="theme-picker-mode-lbl">${tr('Mode')}</p>
    <div class="seg">
      <button class="seg-btn" data-m="dark">${tr('Sombre')}</button>
      <button class="seg-btn" data-m="light">${tr('Clair')}</button>
    </div>
  `);
  const syncMode = () => modeSeg.querySelectorAll('.seg-btn')
    .forEach((b) => b.classList.toggle('on', b.dataset.m === getMode()));
  syncMode();
  modeSeg.addEventListener('click', (e) => {
    const b = e.target.closest('.seg-btn');
    if (!b || b.dataset.m === getMode()) return;
    applyAppearance(getSkin(), b.dataset.m);
    syncMode();
  });
  body.appendChild(modeSeg);

  body.appendChild(h(`<p class="settings-note">${tr('Le theme est synchronise avec ton compte cloud si tu es connecte.')}</p>`));

  return openSheet(body);
}
