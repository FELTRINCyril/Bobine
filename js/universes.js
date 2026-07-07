// Univers / franchises — collections TMDB uniquement (pas de keyword/company trop larges)

export const UNIVERSES = [
  {
    id: 'middle-earth',
    name: 'Terre du Milieu',
    match: {
      collections: [119, 121938],
      tv: [84773],
    },
  },
  {
    id: 'mcu',
    name: 'Marvel Cinematic Universe',
    match: {
      collections: [
        131292, 131295, 131296, 386382, 748, 131299, 86311, 295,
        131296, 131293, 131294, 623911, 131300,
      ],
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
    match: { collections: [1241, 435259] },
  },
  {
    id: 'dceu',
    name: 'DC Extended Universe',
    match: { collections: [52783, 468552, 724848] },
  },
];

export function findUniverse({ type, tmdbId, collectionId }) {
  for (const u of UNIVERSES) {
    const m = u.match || {};
    if (collectionId && m.collections?.includes(collectionId)) return u;
    if (type === 'movie' && m.movies?.includes(tmdbId)) return u;
    if (type === 'tv' && m.tv?.includes(tmdbId)) return u;
  }
  return null;
}
