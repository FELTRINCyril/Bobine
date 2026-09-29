// Notes personnelles : remplacent l'ancien "favori" binaire.
// item.rating = 1..5 (5 = J'adore), 0 / absent = pas note.
// Module sans dependance vers ui/db : ui.js l'importe pour les badges des
// affiches, un import dans l'autre sens aurait cree un cycle.
import { tr } from './i18n.js';

const face = (mouth) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9 10h.01M15 10h.01" stroke-width="2.8"/><path d="${mouth}"/></svg>`;

// Du meilleur au moins bon : c'est l'ordre d'affichage du selecteur.
export const RATINGS = [
  { value: 5, key: 'love', label: "J'adore", icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 20.5s-7.5-4.7-9.3-9.2C1.3 7.7 3.6 4.5 7 4.5c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.4 0 5.7 3.2 4.3 6.8-1.8 4.5-9.3 9.2-9.3 9.2Z"/></svg>' },
  { value: 4, key: 'like', label: "J'aime", icon: face('M8 14c1 1.7 2.4 2.6 4 2.6s3-.9 4-2.6') },
  { value: 3, key: 'ok', label: 'Ca passe', icon: face('M8.5 15h7') },
  { value: 2, key: 'meh', label: 'Bof', icon: face('M8.5 15.6c1.1-.9 2.3-.9 3.5 0s2.4.9 3.5 0') },
  { value: 1, key: 'bad', label: 'Nul', icon: face('M8 16.6c1-1.6 2.4-2.4 4-2.4s3 .8 4 2.4') },
];

export const ratingOf = (it) => {
  const r = Number(it?.rating) || 0;
  return r >= 1 && r <= 5 ? r : 0;
};

export const ratingInfo = (value) => RATINGS.find((r) => r.value === Number(value)) || null;

export const ratingLabel = (value) => {
  const r = ratingInfo(value);
  return r ? tr(r.label) : '';
};

// Donnees d'avant les notes : un favori devient la note la plus haute, pour
// ne rien perdre. `favorite` reste tenu a jour en miroir (= J'adore) afin
// qu'un export relu par une ancienne version garde ses favoris.
// Retourne true si l'item a ete modifie.
export function normalizeRating(it) {
  if (!it) return false;
  const before = `${it.rating}|${it.favorite}`;
  let r = ratingOf(it);
  if (!r && it.rating === undefined && it.favorite) r = 5;
  it.rating = r;
  it.favorite = r === 5;
  return before !== `${it.rating}|${it.favorite}`;
}
