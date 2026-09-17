// Reperage des entrees d'historique et retour arriere borne a l'app.
//
// Historique du probleme : le routeur devinait le sens de navigation en
// comparant le hash courant a une pile maintenue a la main. Cette pile se
// desynchronisait des qu'on naviguait vers une page deja visitee ou via les
// boutons du navigateur, et l'app restaurait alors une page en cache au
// mauvais moment. On numerote donc chaque entree : comparer deux numeros dit
// exactement si on avance ou si on recule, sans rien deviner.
//
// Ce module est volontairement isole : app.js et views.js l'importent tous les
// deux, un etat porte par app.js aurait cree un import circulaire.

let seq = 0;        // dernier numero distribue
let index = 0;      // numero de l'entree affichee
let first = 0;      // premiere entree de l'app : borne du retour arriere

export const navIndex = () => index;

// Marque l'entree courante et retourne 'back' | 'forward' | 'same'.
// Une entree creee par une navigation hash n'a pas d'etat : on lui en pose un
// (replaceState n'ajoute pas d'entree). Une entree atteinte par retour ou
// avance porte deja son numero, qu'il suffit de comparer.
export function stampHistory() {
  const known = history.state?.bobineIndex;
  if (typeof known === 'number') {
    const sens = known < index ? 'back' : (known > index ? 'forward' : 'same');
    index = known;
    // Indispensable : l'etat d'historique survit aux rechargements, alors que
    // `seq` repart de zero. Sans ce rattrapage, apres un rechargement les
    // nouvelles entrees recevaient des numeros INFERIEURS a l'entree courante
    // et passaient donc pour des retours - le routeur restaurait alors des
    // pages en cache a contretemps et le retour sautait des etapes.
    if (known > seq) seq = known;
    return sens;
  }
  index = ++seq;
  try {
    history.replaceState({ ...(history.state || {}), bobineIndex: index }, '');
  } catch { /* historique indisponible */ }
  return 'forward';
}

// Fige la borne du retour arriere sur l'entree courante.
export function markFirst() { first = index; }

// Vrai s'il reste une page de l'app derriere celle affichee.
export const canGoBack = () => index > first;

// Retour arriere. Sans cette garde, un retour depuis la premiere page quitte
// la PWA ou aboutit sur l'URL sans hash, ce qui donnait l'impression que
// l'app "revient a l'accueil" toute seule.
export function goBack() {
  if (!canGoBack()) {
    if (location.hash !== '#/home') location.hash = '#/home';
    return false;
  }
  history.back();
  return true;
}
