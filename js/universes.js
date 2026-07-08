// Univers / franchises.
//
// Deux modes de detection :
// - keyword : mot-cle officiel TMDB porte par chaque film/serie de l'univers.
//   C'est la source la plus fiable (maintenue par TMDB) : elle couvre tout
//   l'univers (Gardiens de la Galaxie, Spider-Man, Doctor Strange...) sans
//   liste a entretenir a la main.
// - collections/tv : IDs de collections TMDB, pour les univers sans mot-cle
//   dedie exploitable.
//
// Les IDs sont verifies contre l'API (les collections se verifient via
// GET /collection/<id>, les keywords via GET /search/keyword).

export const UNIVERSES = [
  {
    id: 'mcu',
    name: 'Marvel Cinematic Universe',
    keyword: 180547, // "marvel cinematic universe (mcu)"
  },
  {
    id: 'dceu',
    name: 'DC Extended Universe',
    keyword: 229266, // "dc extended universe (dceu)"
  },
  {
    id: 'middle-earth',
    name: 'Terre du Milieu',
    match: {
      collections: [119, 121938], // Le Seigneur des anneaux, Le Hobbit
      tv: [84773], // Les Anneaux de Pouvoir
    },
  },
  {
    id: 'star-wars',
    name: 'Star Wars',
    match: { collections: [10] },
  },
  {
    id: 'wizarding-world',
    name: 'Monde des sorciers',
    match: { collections: [1241, 435259] }, // Harry Potter, Les Animaux fantastiques
  },
];

// keywordIds : mots-cles TMDB du media courant (detail.keywords)
export function findUniverse({ type, tmdbId, collectionId, keywordIds = [] }) {
  for (const u of UNIVERSES) {
    if (u.keyword && keywordIds.includes(u.keyword)) return u;
    const m = u.match || {};
    if (collectionId && m.collections?.includes(collectionId)) return u;
    if (type === 'movie' && m.movies?.includes(tmdbId)) return u;
    if (type === 'tv' && m.tv?.includes(tmdbId)) return u;
  }
  return null;
}
