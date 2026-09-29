// Page "Au hasard" : tire un titre a regarder, soit dans Ma liste, soit
// parmi des suggestions tirees de ce qu'on a aime, soit totalement au hasard.
import { api, img, isAnime } from './api.js';
import { tr } from './i18n.js';
import { state, getItem, isSeen, isStarted, watchedEpisodeCount } from './db.js';
import { ratingOf, ratingLabel } from './ratings.js';
import { h, esc, I, emptyState, spinner, mediaTitle, mediaYear, typeLabel } from './ui.js';
import { toggleAdd } from './actions.js';
import { pageHead, bindBack, apiErrorState } from './views.js';

const PREFS_KEY = 'bobine_random_prefs';

const SOURCES = [
  { key: 'list', label: 'Ma liste', hint: 'Un titre que tu as mis de cote' },
  { key: 'foryou', label: 'Pour moi', hint: "D'apres ce que tu as aime" },
  { key: 'surprise', label: 'Surprise', hint: 'Un titre bien note, au hasard' },
];

const TYPES = [
  { key: 'all', label: 'Tout' },
  { key: 'movie', label: 'Films' },
  { key: 'tv', label: 'Series' },
  { key: 'anime', label: 'Animes' },
];

// Titres deja tires pendant la session : "Un autre" ne ressort pas le meme.
const drawn = new Set();

function loadPrefs() {
  try { return { source: 'list', type: 'all', withSeen: false, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }; }
  catch { return { source: 'list', type: 'all', withSeen: false }; }
}

function savePrefs(p) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* quota */ }
}

const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function matchesType(c, type) {
  if (type === 'all') return true;
  if (type === 'anime') return c.isAnime;
  return c.type === type && !c.isAnime;
}

// Candidat = forme commune aux trois sources.
function fromItem(it, reason = '') {
  return {
    type: it.type, id: it.tmdbId, title: it.title, poster: it.poster,
    backdrop: it.backdrop, year: it.year, isAnime: !!it.isAnime, reason,
  };
}

function fromTmdb(m, type, reason = '') {
  return {
    type, id: m.id, title: mediaTitle(m), poster: m.poster_path, backdrop: m.backdrop_path,
    year: mediaYear(m), isAnime: isAnime(m), overview: m.overview || '',
    note: m.vote_average || 0, reason,
  };
}

// Deja connu = deja vu, commence, note ou range dans la liste : une
// suggestion ne doit proposer que de la decouverte.
function isKnown(type, id) {
  const it = getItem(type, id);
  if (!it) return false;
  return it.watchlist || ratingOf(it) > 0 || (it.plays || 0) > 0 || watchedEpisodeCount(it) > 0;
}

// ---- Sources ----

function listCandidates({ type, withSeen }) {
  return [...state.items.values()]
    .filter((it) => it.watchlist)
    .filter((it) => withSeen || !isSeen(it))
    .map((it) => fromItem(it, isStarted(it) && !isSeen(it) ? tr('En cours') : ''))
    .filter((c) => matchesType(c, type));
}

async function forYouCandidates({ type }) {
  const liked = [...state.items.values()].filter((it) => ratingOf(it) >= 4);
  let seeds = liked.filter((it) => matchesType(fromItem(it), type));
  // Pas assez de notes pour ce type : on se rabat sur les titres vus
  // (jamais ceux notes Bof ou Nul).
  if (!seeds.length) {
    seeds = [...state.items.values()]
      .filter((it) => (it.plays > 0 || watchedEpisodeCount(it) > 0) && !(ratingOf(it) && ratingOf(it) <= 2))
      .filter((it) => matchesType(fromItem(it), type));
  }
  if (!seeds.length) return { list: [], noSeed: true };

  const picked = shuffle(seeds).slice(0, 3);
  const out = [];
  const seen = new Set();
  await Promise.all(picked.map(async (seed) => {
    try {
      const d = await api.detail(seed.type, seed.tmdbId, { isAnime: seed.isAnime });
      const r = ratingOf(seed);
      const reason = r >= 4
        ? `${tr('Parce que tu as note')} "${seed.title}" : ${ratingLabel(r)}`
        : `${tr('Parce que tu as vu')} "${seed.title}"`;
      for (const m of d.recommendations?.results || []) {
        const mt = m.media_type === 'movie' || m.media_type === 'tv' ? m.media_type : seed.type;
        const key = `${mt}_${m.id}`;
        if (seen.has(key) || isKnown(mt, m.id)) continue;
        seen.add(key);
        out.push(fromTmdb(m, mt, reason));
      }
    } catch { /* hors ligne : ce point de depart ne donne rien */ }
  }));

  // Acteurs / realisateurs favoris : une source de plus
  const people = [...state.people.values()];
  if (people.length) {
    const person = pickOne(people);
    const apiType = type === 'movie' ? 'movie' : (type === 'all' ? pickOne(['movie', 'tv']) : 'tv');
    try {
      const data = await api.discoverByPerson(apiType, person.id, 1);
      for (const m of data.results || []) {
        const key = `${apiType}_${m.id}`;
        if (seen.has(key) || isKnown(apiType, m.id)) continue;
        seen.add(key);
        out.push(fromTmdb(m, apiType, `${tr('Avec')} ${person.name}`));
      }
    } catch { /* ignore */ }
  }
  return { list: out.filter((c) => matchesType(c, type)) };
}

async function surpriseCandidates({ type }) {
  const kind = type === 'all' ? pickOne(['movie', 'tv', 'anime']) : type;
  const apiType = kind === 'movie' ? 'movie' : 'tv';
  const params = {
    sort_by: 'popularity.desc',
    include_adult: 'false',
    'vote_average.gte': kind === 'anime' ? '7' : '6.8',
    'vote_count.gte': kind === 'movie' ? '500' : '200',
  };
  if (kind === 'anime') {
    params.with_genres = '16';
    params.with_origin_country = 'JP';
  }
  // Premiere page pour connaitre le nombre de pages, puis une page au hasard
  // parmi les 20 premieres (au-dela, les titres deviennent confidentiels).
  const first = await api.discover(apiType, params, 1);
  const pages = Math.min(20, first.total_pages || 1);
  const page = 1 + Math.floor(Math.random() * pages);
  const data = page === 1 ? first : await api.discover(apiType, params, page);
  return {
    list: (data.results || [])
      .map((m) => fromTmdb(m, apiType, ''))
      .filter((c) => !isKnown(c.type, c.id))
      .filter((c) => matchesType(c, kind)),
  };
}

// ---- Page ----

export function renderRandom() {
  const v = document.getElementById('view');
  v.innerHTML = '';
  const page = h('<div class="page page-random"></div>');
  page.appendChild(pageHead(tr('Au hasard'), { back: true }));
  bindBack(page);
  v.appendChild(page);

  const prefs = loadPrefs();

  const form = h(`
    <div class="rnd-form">
      <p class="rnd-intro">${tr('Tu ne sais pas quoi regarder ? Laisse Bobine choisir.')}</p>
      <div class="rnd-sources">
        ${SOURCES.map((s) => `
          <button type="button" class="rnd-source" data-src="${s.key}">
            <span class="t">${tr(s.label)}</span>
            <span class="s">${tr(s.hint)}</span>
          </button>`).join('')}
      </div>
      <div class="chips rnd-types">
        ${TYPES.map((t) => `<button type="button" class="chip" data-type="${t.key}">${tr(t.label)}</button>`).join('')}
      </div>
      <label class="rnd-seen">
        <input type="checkbox" ${prefs.withSeen ? 'checked' : ''}>
        <span>${tr('Inclure les titres deja vus')}</span>
      </label>
      <button type="button" class="btn rnd-go">${I.dice}<span>${tr('Tirer au sort')}</span></button>
    </div>
  `);
  const result = h('<div class="rnd-result-slot"></div>');
  page.append(form, result);

  const seenRow = form.querySelector('.rnd-seen');
  const seenBox = seenRow.querySelector('input');
  const goBtn = form.querySelector('.rnd-go');

  const syncForm = () => {
    form.querySelectorAll('[data-src]').forEach((b) => b.classList.toggle('on', b.dataset.src === prefs.source));
    form.querySelectorAll('[data-type]').forEach((b) => b.classList.toggle('on', b.dataset.type === prefs.type));
    seenRow.hidden = prefs.source !== 'list';
  };
  syncForm();

  form.addEventListener('click', (e) => {
    const src = e.target.closest('[data-src]');
    const typ = e.target.closest('[data-type]');
    if (src) prefs.source = src.dataset.src;
    else if (typ) prefs.type = typ.dataset.type;
    else return;
    savePrefs(prefs);
    syncForm();
  });
  seenBox.addEventListener('change', () => { prefs.withSeen = seenBox.checked; savePrefs(prefs); });

  let busy = false;
  const draw = async () => {
    if (busy) return;
    busy = true;
    goBtn.disabled = true;
    result.innerHTML = '';
    result.appendChild(spinner());
    try {
      await drawOnce(prefs, result, draw);
    } catch (e) {
      result.innerHTML = '';
      result.appendChild(apiErrorState(e, 'popcorn'));
    }
    busy = false;
    goBtn.disabled = false;
  };
  goBtn.addEventListener('click', draw);
}

async function drawOnce(prefs, slot, again) {
  let pool = [];
  let note = '';
  if (prefs.source === 'list') {
    pool = listCandidates(prefs);
    if (!pool.length) {
      slot.innerHTML = '';
      slot.appendChild(emptyState('bookmark', tr('Rien a tirer dans Ma liste'),
        prefs.withSeen ? tr('Ajoute des titres a ta liste avec le bouton +.') : tr('Tout est deja vu ici. Coche "Inclure les titres deja vus" ou change de type.')));
      return;
    }
  } else if (prefs.source === 'foryou') {
    const r = await forYouCandidates(prefs);
    pool = r.list;
    if (r.noSeed || !pool.length) {
      note = tr('Note quelques titres (coeur sur une fiche) pour des suggestions plus justes. En attendant, voici une surprise.');
      pool = (await surpriseCandidates(prefs)).list;
    }
  } else {
    pool = (await surpriseCandidates(prefs)).list;
  }

  const key = (c) => `${c.type}_${c.id}`;
  let fresh = pool.filter((c) => !drawn.has(key(c)));
  if (!fresh.length) {
    // Tout le panier a deja ete tire : on repart de zero pour ce panier.
    for (const c of pool) drawn.delete(key(c));
    fresh = pool;
  }
  if (!fresh.length) {
    slot.innerHTML = '';
    slot.appendChild(emptyState('popcorn', tr('Aucun titre trouve'), tr('Essaie un autre type ou une autre source.')));
    return;
  }

  const winner = pickOne(fresh);
  drawn.add(key(winner));
  await spin(slot, shuffle(pool).slice(0, 10), winner);
  showWinner(slot, winner, note, again);
}

// Petit effet "machine a sous" : les affiches defilent puis ralentissent.
function spin(slot, pool, winner) {
  slot.innerHTML = '';
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const posters = pool.filter((c) => c.poster);
  if (reduce || posters.length < 3) return Promise.resolve();
  const box = h('<div class="rnd-spin"><div class="rnd-spin-card"></div></div>');
  const card = box.firstElementChild;
  slot.appendChild(box);
  // Precharge l'affiche gagnante pendant l'animation
  if (winner.poster) new Image().src = img(winner.poster, 'w500');
  let i = 0;
  let delay = 60;
  return new Promise((resolve) => {
    const tick = () => {
      const c = posters[i % posters.length];
      card.innerHTML = `<img src="${img(c.poster, 'w342')}" alt="">`;
      card.classList.remove('flip');
      void card.offsetWidth;
      card.classList.add('flip');
      i++;
      delay *= 1.18;
      if (delay > 320) { resolve(); return; }
      setTimeout(tick, delay);
    };
    tick();
  });
}

function showWinner(slot, c, note, again) {
  slot.innerHTML = '';
  const detailHash = `#/detail/${c.type}/${c.id}`;
  const poster = img(c.poster, 'w500');
  const meta = [c.year, typeLabel(c.type, c.isAnime)].filter(Boolean);
  const el = h(`
    <div class="rnd-result">
      ${note ? `<p class="rnd-note">${esc(note)}</p>` : ''}
      <a class="rnd-poster" href="${detailHash}">
        ${poster ? `<img src="${poster}" alt="">` : `<span class="no-img">${esc(c.title)}</span>`}
      </a>
      <div class="rnd-info">
        ${c.reason ? `<div class="rnd-reason">${esc(c.reason)}</div>` : ''}
        <h2 class="rnd-title">${esc(c.title)}</h2>
        <div class="rnd-meta">
          ${c.note ? `<span class="note">&#9733; ${c.note.toFixed(1)}</span>` : ''}
          ${meta.map((m) => `<span>${esc(m)}</span>`).join('')}
        </div>
        <p class="rnd-overview">${esc(c.overview || '')}</p>
        <div class="rnd-actions">
          <a class="btn" href="${detailHash}">${tr('Voir la fiche')}</a>
          <button type="button" class="btn ghost rnd-again">${I.dice}<span>${tr('Un autre')}</span></button>
          <button type="button" class="btn ghost rnd-add"></button>
        </div>
      </div>
    </div>
  `);
  slot.appendChild(el);

  const addBtn = el.querySelector('.rnd-add');
  const syncAdd = () => {
    const inList = !!getItem(c.type, c.id)?.watchlist;
    addBtn.innerHTML = inList ? `${I.check}<span>${tr('Dans ma liste')}</span>` : `${I.plus}<span>${tr('Ajouter a ma liste')}</span>`;
    addBtn.classList.toggle('on', inList);
  };
  syncAdd();
  addBtn.addEventListener('click', async () => {
    await toggleAdd({
      type: c.type, tmdbId: c.id, title: c.title, poster: c.poster,
      backdrop: c.backdrop, year: c.year, isAnime: c.isAnime,
    });
    syncAdd();
  });
  el.querySelector('.rnd-again').addEventListener('click', again);

  // Synopsis et note manquants (titres de Ma liste) : on les complete.
  if (!c.overview || !c.note) {
    api.detail(c.type, c.id, { isAnime: c.isAnime }).then((d) => {
      if (!el.isConnected) return;
      const ov = el.querySelector('.rnd-overview');
      if (!c.overview && d.overview) ov.textContent = d.overview;
      if (!c.note && d.vote_average) {
        el.querySelector('.rnd-meta').insertAdjacentHTML('afterbegin', `<span class="note">&#9733; ${d.vote_average.toFixed(1)}</span>`);
      }
    }).catch(() => {});
  }
}
