// Univers / franchises multi-collections (TMDB ids)
// Quand un titre appartient a un univers, on affiche tous ses elements.

export const UNIVERSES = [
  {
    id: 'middle-earth',
    name: 'Terre du Milieu',
    match: {
      collections: [119, 121938], // LOTR, Hobbit
      movies: [],
      tv: [84773], // Les Anneaux de Pouvoir
    },
  },
  {
    id: 'mcu',
    name: 'Marvel Cinematic Universe',
    keyword: 180547,
    match: {
      collections: [131292, 131295, 131296, 386382, 748, 131299], // Iron Man, Thor, Cap, etc.
      companies: [420], // Marvel Studios
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
    match: { collections: [1241, 435259] }, // Harry Potter, Fantastic Beasts
  },
  {
    id: 'dceu',
    name: 'DC Extended Universe',
    keyword: 84977,
    match: { collections: [52783, 468552] },
  },
];

export function findUniverse({ type, tmdbId, collectionId, keywords = [], companies = [] }) {
  for (const u of UNIVERSES) {
    const m = u.match || {};
    if (collectionId && m.collections?.includes(collectionId)) return u;
    if (type === 'movie' && m.movies?.includes(tmdbId)) return u;
    if (type === 'tv' && m.tv?.includes(tmdbId)) return u;
    if (u.keyword && keywords.includes(u.keyword)) return u;
    if (m.companies?.some((c) => companies.includes(c))) return u;
  }
  return null;
}
