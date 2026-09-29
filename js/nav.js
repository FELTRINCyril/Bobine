// Reperage des entrees d'historique et retour arriere borne a l'app.
//
// Historique du probleme :
// 1. Le routeur devinait le sens de navigation en comparant le hash courant a
//    une pile maintenue a la main, qui se desynchronisait. On numerote donc
//    chaque entree : comparer deux numeros dit exactement si on avance ou si
//    on recule.
// 2. L'historique du navigateur contient aussi des entrees d'AUTRES
//    documents : celles d'avant un rechargement (mise a jour de l'app, iOS
//    qui relance la PWA) et surtout celles d'avant une reconnexion Google
//    Drive, qui quitte l'app pour la page de Google puis revient. Un
//    history.back() qui franchit cette frontiere recharge toute l'app (ecran
//    fige quelques secondes) et atterrit sur une page imprevisible - souvent
//    l'accueil, parfois la page de Google elle-meme.
//
// Solution : on ne fait history.back() que vers une entree creee par CE
// document. Au-dela, on s'appuie sur notre propre pile (sessionStorage, qui
// survit aux rechargements et aux redirections dans l'onglet) : la page
// precedente est affichee a la place de l'entree courante (replaceState),
// sans aucun rechargement.
//
// Ce module est volontairement isole : app.js et views.js l'importent tous les
// deux, un etat porte par app.js aurait cree un import circulaire.

const STACK_KEY = 'bobine_nav_stack'; // { [numero]: { h: hash, y: scroll } }
const SEQ_KEY = 'bobine_nav_seq';

let stack = {};
let seq = 0;          // dernier numero distribue
let index = 0;        // numero de l'entree affichee
let docStart = 0;     // premiere entree creee par ce document

try {
  stack = JSON.parse(sessionStorage.getItem(STACK_KEY) || '{}') || {};
  // Les numeros continuent d'un document a l'autre : sans ca, la premiere
  // entree apres une redirection repartait a 1 et ecrasait la pile.
  seq = Number(sessionStorage.getItem(SEQ_KEY)) || 0;
} catch { /* sessionStorage indisponible : pile en memoire seulement */ }

function persist() {
  try {
    sessionStorage.setItem(STACK_KEY, JSON.stringify(stack));
    sessionStorage.setItem(SEQ_KEY, String(seq));
  } catch { /* quota */ }
}

const keysBelow = (n) => Object.keys(stack).map(Number).filter((k) => k < n).sort((a, b) => b - a);

export const navIndex = () => index;

// Marque l'entree courante et retourne 'back' | 'forward' | 'same'.
// Une entree creee par une navigation hash n'a pas d'etat : on lui en pose un
// (replaceState n'ajoute pas d'entree). Une entree atteinte par retour ou
// avance porte deja son numero, qu'il suffit de comparer.
export function stampHistory() {
  const known = history.state?.bobineIndex;
  let sens;
  if (typeof known === 'number') {
    sens = known < index ? 'back' : (known > index ? 'forward' : 'same');
    index = known;
    if (known > seq) seq = known;
  } else {
    const from = index;
    index = ++seq;
    sens = 'forward';
    try {
      history.replaceState({ ...(history.state || {}), bobineIndex: index }, '');
    } catch { /* historique indisponible */ }
    // Nouvelle entree : les entrees qui etaient "devant" la page quittee
    // (apres un retour) ont ete detruites par le navigateur.
    if (from) for (const k of Object.keys(stack)) if (Number(k) > from && Number(k) < index) delete stack[k];
  }
  stack[index] = { ...(stack[index] || {}), h: location.hash || '#/home' };
  persist();
  return sens;
}

// Position de scroll d'une entree, gardee avec la pile pour survivre a un
// rechargement.
export function saveScroll(n, y) {
  if (!stack[n]) return;
  stack[n].y = Math.round(y);
  persist();
}
export const savedScroll = (n) => stack[n]?.y || 0;

// Fige la frontiere du document courant : les entrees plus anciennes
// appartiennent a un document precedent, on n'y retourne jamais par
// history.back().
export function markFirst() { docStart = index; }

// Vrai s'il reste une page de l'app derriere celle affichee.
export const canGoBack = () => index > docStart || keysBelow(index).length > 0;

// Affiche `hash` a la place de l'entree courante, sous le numero `n`, puis
// declenche le routeur (replaceState ne le fait pas de lui-meme).
function showInPlace(n, hash) {
  try {
    history.replaceState({ ...(history.state || {}), bobineIndex: n }, '', hash);
  } catch {
    location.hash = hash;
    return;
  }
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

// Retour arriere, toujours vers une page de l'app, jamais hors de l'app.
export function goBack() {
  if (index > docStart) {
    history.back();
    return true;
  }
  const prev = keysBelow(index)[0];
  const from = index;
  if (prev !== undefined) {
    delete stack[from];
    docStart = prev;
    persist();
    showInPlace(prev, stack[prev].h);
    return true;
  }
  // Rien derriere : accueil, sans creer d'entree supplementaire.
  if ((location.hash || '#/home') !== '#/home') {
    stack = { [from]: { h: '#/home' } };
    persist();
    showInPlace(from, '#/home');
  }
  return false;
}
