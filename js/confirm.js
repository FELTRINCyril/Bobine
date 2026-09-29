// Confirmation modale (actions sensibles : deco, reconfig...).
import { h, esc, openSheet } from './ui.js';
import { tr } from './i18n.js';

// Retourne true si l'utilisateur confirme.
export function openConfirmSheet({ title, message, confirmLabel, danger = false }) {
  const body = h(`
    <div class="confirm-sheet">
      <h3>${esc(title)}</h3>
      <p class="confirm-msg">${message}</p>
      <label class="reset-check confirm-check">
        <input type="checkbox">
        <span>${tr('Je comprends les consequences')}</span>
      </label>
      <div class="reset-actions">
        <button class="btn ghost confirm-cancel">${tr('Annuler')}</button>
        <button class="btn confirm-go" disabled>${esc(confirmLabel)}</button>
      </div>
    </div>
  `);
  const check = body.querySelector('input[type="checkbox"]');
  const go = body.querySelector('.confirm-go');
  if (danger) go.classList.add('reset-confirm');

  return new Promise((resolve) => {
    const close = openSheet(body, { onClose: () => resolve(false) });
    const refresh = () => { go.disabled = !check.checked; };
    check.addEventListener('change', refresh);
    body.querySelector('.confirm-cancel').addEventListener('click', () => { close(); resolve(false); });
    go.addEventListener('click', () => {
      if (!check.checked) return;
      close();
      resolve(true);
    });
  });
}

// Question simple (oui / non), sans case a cocher : pour les propositions
// courantes et reversibles, la ou openConfirmSheet serait trop lourd.
// Retourne true si l'utilisateur accepte.
export function openAskSheet({ title, message, confirmLabel, cancelLabel, danger = false }) {
  const body = h(`
    <div class="confirm-sheet">
      <h3>${esc(title)}</h3>
      <p class="confirm-msg">${esc(message)}</p>
      <div class="reset-actions">
        <button class="btn ghost ask-cancel">${esc(cancelLabel || tr('Non merci'))}</button>
        <button class="btn ask-go ${danger ? 'reset-confirm' : ''}">${esc(confirmLabel)}</button>
      </div>
    </div>
  `);
  return new Promise((resolve) => {
    const close = openSheet(body, { onClose: () => resolve(false) });
    body.querySelector('.ask-cancel').addEventListener('click', () => { close(); resolve(false); });
    body.querySelector('.ask-go').addEventListener('click', () => { close(); resolve(true); });
  });
}
