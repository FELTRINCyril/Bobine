// Avant connexion cloud : avertit si des donnees locales seraient ecrasees.
import { state, exportJson } from './db.js';
import { hasSync } from './storage/index.js';
import { connect } from './sync.js';
import { h, esc, I, openSheet, toast } from './ui.js';
import { tr } from './i18n.js';

const PROVIDER_LABEL = { dropbox: 'Dropbox', gdrive: 'Google Drive' };

export function hasLocalData() {
  return state.items.size > 0 || state.playlists.size > 0;
}

export function downloadExport() {
  const blob = new Blob([exportJson()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `bobine-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast(tr('Export lance'));
}

async function runConnect(providerId) {
  if (providerId === 'dropbox') {
    await connect('dropbox');
    return {};
  }
  return await connect(providerId);
}

function openLocalDataWarningSheet(providerId) {
  const label = PROVIDER_LABEL[providerId] || providerId;
  const body = h(`
    <div class="cloud-connect-sheet">
      <h3>${tr('Connexion')} ${esc(label)}</h3>
      <p class="cloud-connect-warn">${tr('Tu as des donnees sur cet appareil. En te connectant, elles seront remplacees par celles de ton compte cloud (si le cloud en contient deja).')}</p>
      <p class="cloud-connect-hint">${tr('Exporte-les d\'abord si tu veux les garder.')}</p>
      <button class="btn ghost cloud-connect-export">${I.download}<span>${tr('Exporter mes donnees (JSON)')}</span></button>
      <div class="cloud-connect-actions">
        <button class="btn ghost cloud-connect-cancel">${tr('Annuler')}</button>
        <button class="btn cloud-connect-go">${tr('Se connecter quand meme')}</button>
      </div>
    </div>
  `);
  const close = openSheet(body);
  body.querySelector('.cloud-connect-export').addEventListener('click', downloadExport);

  return new Promise((resolve) => {
    body.querySelector('.cloud-connect-cancel').addEventListener('click', () => {
      close();
      resolve(null);
    });
    body.querySelector('.cloud-connect-go').addEventListener('click', async () => {
      const btn = body.querySelector('.cloud-connect-go');
      btn.disabled = true;
      btn.classList.add('loading');
      try {
        close();
        resolve(await runConnect(providerId));
      } catch {
        resolve(undefined);
      }
    });
  });
}

// Lance la connexion cloud. Si des donnees locales existent (et pas deja
// connecte), ouvre une fenetre d'avertissement avec export avant de continuer.
// Retourne le resultat de connect(), null si annule, undefined si echec.
export async function promptCloudConnect(providerId, { secureGuard } = {}) {
  if (secureGuard && !secureGuard()) return null;
  if (hasSync()) return null;
  if (!hasLocalData()) {
    try { return await runConnect(providerId); }
    catch { return undefined; }
  }
  return await openLocalDataWarningSheet(providerId);
}
