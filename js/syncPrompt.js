// Fenetre de reconnexion cloud.
//
// Avant : un simple toast signalait la coupure et disparaissait en deux
// secondes, souvent avant meme d'etre lu. L'utilisateur continuait donc a
// saisir des visionnages qui ne partaient nulle part.
// Maintenant : une fenetre modale, au premier plan, qui explique l'etat et
// propose la reconnexion en un geste - geste indispensable, puisque seul un
// clic reel autorise le fournisseur a ouvrir son ecran d'autorisation.
import { h, esc, I, openSheet } from './ui.js';
import { tr } from './i18n.js';
import {
  syncStatus, needsReconnect, reconnect,
  redirectionNonAutorisee, oublierTentativeAuth, uriDeRedirection,
} from './sync.js';

// Ne pas harceler : une seule fenetre par session, et si elle est repoussee on
// respecte un delai avant de la reproposer.
const K_SNOOZE = 'bobine_sync_snooze';
const SNOOZE_MS = 2 * 60 * 60 * 1000; // 2 h

// On suit l'element reellement affiche, pas un simple booleen : le routeur
// vide #overlay-root a chaque navigation, donc une fenetre ouverte juste avant
// le premier rendu disparait sans passer par notre fermeture. Un booleen
// serait alors reste bloque a "ouverte" et aurait interdit toute reouverture.
let elCourant = null;
const dejaOuverte = () => !!elCourant?.isConnected;

const snoozeActif = () => {
  try { return Date.now() < Number(localStorage.getItem(K_SNOOZE) || 0); }
  catch { return false; }
};

const poserSnooze = () => {
  try { localStorage.setItem(K_SNOOZE, String(Date.now() + SNOOZE_MS)); }
  catch { /* quota */ }
};

export const leverSnooze = () => {
  try { localStorage.removeItem(K_SNOOZE); } catch { /* quota */ }
};

// Depuis quand la derniere synchro a-t-elle reussi ?
function depuis(ts) {
  if (!ts) return tr('jamais');
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return tr('a l\'instant');
  if (min < 60) return `${min} min`;
  const heures = Math.round(min / 60);
  if (heures < 24) return heures > 1 ? `${heures} ${tr('heures')}` : `1 ${tr('heure')}`;
  const jours = Math.round(heures / 24);
  return jours > 1 ? `${jours} ${tr('jours')}` : `1 ${tr('jour')}`;
}

// Affiche la fenetre. `force` ignore le delai de report (bouton des reglages).
export function openSyncPrompt({ force = false } = {}) {
  if (dejaOuverte()) return false;
  if (!needsReconnect()) return false;
  if (!force && snoozeActif()) return false;

  const { label, lastSync } = syncStatus();
  // Tentative precedente jamais revenue : c'est un probleme de configuration,
  // pas une simple expiration. Reproposer le meme bouton ne menerait nulle
  // part, on affiche donc quoi corriger.
  const bloquee = redirectionNonAutorisee();
  oublierTentativeAuth();

  const corps = bloquee
    ? `
      <p class="sync-prompt-msg">
        ${tr('La derniere tentative n\'a pas abouti : Google a refuse la demande avant d\'afficher l\'ecran d\'autorisation.')}
      </p>
      <p class="sync-prompt-msg">
        ${tr('Dans la console Google Cloud, ajoute cette adresse aux URI de redirection autorisees du client OAuth :')}
      </p>
      <code class="sync-prompt-uri">${esc(uriDeRedirection())}</code>`
    : `
      <p class="sync-prompt-msg">
        ${tr('Ton compte')} <b>${esc(label)}</b> ${tr('doit autoriser Bobine a nouveau. Tant que ce n\'est pas fait, ce que tu ajoutes reste sur cet appareil uniquement.')}
      </p>
      <p class="sync-prompt-meta">${tr('Derniere sauvegarde :')} ${esc(depuis(lastSync))}</p>`;

  const body = h(`
    <div class="sync-prompt">
      <div class="sync-prompt-ico">${I.globe}</div>
      <h3>${bloquee ? tr('Reconnexion bloquee') : tr('Synchronisation interrompue')}</h3>
      ${corps}
      <div class="sync-prompt-actions">
        <button class="btn ghost sync-prompt-later">${tr('Plus tard')}</button>
        <button class="btn sync-prompt-go">${bloquee ? tr('Reessayer') : tr('Reconnecter')}</button>
      </div>
      <p class="sync-prompt-hint">${tr('Aucune donnee ne sera perdue : tes ajouts seront envoyes des la reconnexion.')}</p>
    </div>
  `);

  const close = openSheet(body);
  elCourant = body;
  const fermer = () => { elCourant = null; close(); };

  body.querySelector('.sync-prompt-later').addEventListener('click', () => {
    poserSnooze();
    fermer();
  });

  body.querySelector('.sync-prompt-go').addEventListener('click', () => {
    const btn = body.querySelector('.sync-prompt-go');
    btn.disabled = true;
    btn.textContent = tr('Redirection...');
    leverSnooze();
    // reconnect() quitte la page vers l'ecran du fournisseur. On ne ferme donc
    // pas la fenetre : elle disparait avec la navigation.
    if (!reconnect()) fermer();
  });

  return true;
}

// Propose la reconnexion au bon moment : au demarrage, et quand on revient sur
// l'app apres une absence (c'est la que l'autorisation a expire).
export function watchSyncAuth() {
  const ABSENCE_MIN = 60 * 1000;
  let partiA = 0;

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { partiA = Date.now(); return; }
    if (!partiA || Date.now() - partiA < ABSENCE_MIN) return;
    partiA = 0;
    openSyncPrompt();
  });
}
