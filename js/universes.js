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

// Ordre chronologique (timeline MCU / histoire), pas ordre de sortie.
// Index bas = plus tot dans l'univers. Source : timeline Disney+ / Marvel.
export const MCU_CHRONO = [
  1771,    // Captain America: The First Avenger
  299537,  // Captain Marvel
  1726,    // Iron Man
  10138,   // Iron Man 2
  1724,    // The Incredible Hulk
  10195,   // Thor
  24428,   // The Avengers
  68721,   // Iron Man 3
  76338,   // Thor: The Dark World
  100402,  // Captain America: The Winter Soldier
  118340,  // Guardians of the Galaxy
  283995,  // Guardians of the Galaxy Vol. 2
  99861,   // Avengers: Age of Ultron
  102899,  // Ant-Man
  271110,  // Captain America: Civil War
  284052,  // Doctor Strange
  315635,  // Spider-Man: Homecoming
  284054,  // Black Panther
  284053,  // Thor: Ragnarok
  497698,  // Black Widow (chrono avant Infinity War)
  299536,  // Avengers: Infinity War
  363088,  // Ant-Man and the Wasp
  299534,  // Avengers: Endgame
  429617,  // Spider-Man: Far From Home
  85271,   // WandaVision
  84958,   // The Falcon and the Winter Soldier
  88396,   // Loki
  91363,   // What If...?
  566525,  // Shang-Chi and the Legend of the Ten Rings
  524434,  // Eternals
  92749,   // Hawkeye
  92782,   // Moon Knight
  92783,   // Ms. Marvel
  634649,  // Spider-Man: No Way Home
  453395,  // Doctor Strange in the Multiverse of Madness
  616037,  // Thor: Love and Thunder
  92785,   // She-Hulk
  114472,  // Werewolf by Night
  114471,  // The Guardians of the Galaxy Holiday Special
  505642,  // Black Panther: Wakanda Forever
  84958,   // (deja liste)
  202555,  // Secret Invasion
  114868,  // Loki S2
  640146,  // Ant-Man and the Wasp: Quantumania
  447365,  // Guardians of the Galaxy Vol. 3
  609681,  // The Marvels
  122226,  // Echo
  138501,  // Agatha All Along
  202671,  // What If...? S2
  533535,  // Deadpool & Wolverine
  157742,  // Your Friendly Neighborhood Spider-Man
  157336,  // Daredevil: Born Again
  822119,  // Captain America: Brave New World
  986056,  // Thunderbolts*
];

const MCU_RANK = new Map(MCU_CHRONO.map((id, i) => [id, i]));

export function mcuChronoRank(tmdbId) {
  const r = MCU_RANK.get(Number(tmdbId));
  return r === undefined ? 1e9 : r;
}

export function sortByMcuChrono(items, getId = (x) => x.id ?? x.tmdbId) {
  return [...items].sort((a, b) => {
    const ra = mcuChronoRank(getId(a));
    const rb = mcuChronoRank(getId(b));
    if (ra !== rb) return ra - rb;
    const da = a.release_date || a.first_air_date || a.year || '';
    const db = b.release_date || b.first_air_date || b.year || '';
    return String(da).localeCompare(String(db));
  });
}

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
