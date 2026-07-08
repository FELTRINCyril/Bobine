// Ecran de premiere ouverture : configuration de l'acces TMDB. L'app ne peut
// pas fonctionner sans une source de donnees ; on demande donc a l'utilisateur
// soit sa propre cle TMDB, soit d'utiliser le proxy. Aucun secret embarque.
import { h } from './ui.js';
import { tr } from './i18n.js';
import { useKey, useProxy, hasDefaultProxy, DEFAULT_PROXY, isV4Token } from './config.js';

const TMDB_API_URL = 'https://www.themoviedb.org/settings/api';

// Verifie qu'un acces fonctionne avant de l'enregistrer (feedback immediat).
async function testAccess({ mode, value }) {
  const base = mode === 'proxy'
    ? value.trim().replace(/\/+$/, '')
    : 'https://api.themoviedb.org/3';
  const url = new URL(base + '/configuration');
  const headers = { accept: 'application/json' };
  if (mode === 'key') {
    if (isV4Token(value)) headers.Authorization = `Bearer ${value.trim()}`;
    else url.searchParams.set('api_key', value.trim());
  }
  const res = await fetch(url, { headers });
  return res.ok;
}

export function renderOnboarding(onDone) {
  const view = document.getElementById('view');
  view.innerHTML = '';
  document.body.classList.add('onboarding-on'); // masque la tab bar (CSS)
  const page = h('<div class="page onboarding"></div>');
  view.appendChild(page);

  page.appendChild(h(`
    <div class="onb-head">
      <h1>${tr('Bienvenue sur Bobine')}</h1>
      <p>${tr('Bobine a besoin d\'un acces a TMDB pour afficher films et series. Tes donnees de visionnage restent, elles, 100% sur ton appareil.')}</p>
    </div>
  `));

  const status = h('<p class="onb-status" role="status"></p>');
  const setStatus = (msg, ok = false) => {
    status.textContent = msg;
    status.classList.toggle('err', !!msg && !ok);
    status.classList.toggle('ok', ok);
  };

  const busy = (btn, on) => {
    btn.disabled = on;
    btn.classList.toggle('loading', on);
  };

  // Enregistre + valide un acces, puis lance l'app si tout est bon.
  async function commit(saveFn, test, btn) {
    setStatus('');
    busy(btn, true);
    try {
      const ok = await test();
      if (!ok) { setStatus(tr('Acces refuse par TMDB. Verifie et reessaie.')); return; }
      saveFn();
      onDone();
    } catch {
      setStatus(tr('Impossible de contacter TMDB (hors ligne ?).'));
    } finally {
      busy(btn, false);
    }
  }

  // ---- Mode simple : proxy par defaut (si deploye) ----
  if (hasDefaultProxy()) {
    const start = h(`<button class="btn onb-primary">${tr('Commencer')}</button>`);
    start.addEventListener('click', () => commit(
      () => useProxy(DEFAULT_PROXY),
      () => testAccess({ mode: 'proxy', value: DEFAULT_PROXY }),
      start,
    ));
    page.appendChild(start);
    page.appendChild(h(`<p class="onb-hint">${tr('Recommande : rien a configurer.')}</p>`));
  }

  // ---- Mode avance : cle perso + proxy personnalise ----
  const details = h(`<details class="onb-adv" ${hasDefaultProxy() ? '' : 'open'}></details>`);
  details.appendChild(h(`<summary>${tr('Options avancees')}</summary>`));

  // Cle perso TMDB
  const keyCard = h(`
    <div class="onb-card">
      <h2>${tr('Utiliser ma cle TMDB')}</h2>
      <input class="onb-input" type="text" inputmode="latin" autocapitalize="off"
             autocorrect="off" spellcheck="false"
             placeholder="${tr('Coller la cle API ou le jeton TMDB...')}">
      <div class="onb-row">
        <a class="onb-link" href="${TMDB_API_URL}" target="_blank" rel="noopener">${tr('Obtenir une cle TMDB')}</a>
        <button class="btn ghost onb-validate">${tr('Valider')}</button>
      </div>
    </div>
  `);
  const keyInput = keyCard.querySelector('.onb-input');
  const keyBtn = keyCard.querySelector('.onb-validate');
  keyBtn.addEventListener('click', () => {
    const val = keyInput.value.trim();
    if (!val) { setStatus(tr('Colle d\'abord ta cle.')); return; }
    commit(() => useKey(val), () => testAccess({ mode: 'key', value: val }), keyBtn);
  });
  details.appendChild(keyCard);

  // Proxy personnalise
  const proxyCard = h(`
    <div class="onb-card">
      <h2>${tr('Utiliser un proxy')}</h2>
      <input class="onb-input" type="url" inputmode="url" autocapitalize="off"
             autocorrect="off" spellcheck="false"
             placeholder="https://...workers.dev">
      <div class="onb-row">
        <span class="onb-hint">${tr('Cloudflare Worker (voir SECURITE.md)')}</span>
        <button class="btn ghost onb-validate">${tr('Valider')}</button>
      </div>
    </div>
  `);
  const proxyInput = proxyCard.querySelector('.onb-input');
  const proxyBtn = proxyCard.querySelector('.onb-validate');
  proxyBtn.addEventListener('click', () => {
    const val = proxyInput.value.trim();
    if (!val) { setStatus(tr('Colle d\'abord l\'URL du proxy.')); return; }
    commit(() => useProxy(val), () => testAccess({ mode: 'proxy', value: val }), proxyBtn);
  });
  details.appendChild(proxyCard);

  page.appendChild(details);
  page.appendChild(status);
}
