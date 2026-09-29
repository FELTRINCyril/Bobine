// Actions sur les items (note, bibliotheque, vus, playlists)
import {
  ensureItem, saveItem, getItem, state, isSeen, isStarted,
  createPlaylist, savePlaylist,
} from './db.js';
import { api } from './api.js';
import { h, esc, I, openSheet, toast } from './ui.js';
import { tr } from './i18n.js';
import { openAskSheet } from './confirm.js';
import { RATINGS, ratingOf, ratingLabel } from './ratings.js';

// meta = { type, tmdbId, title, poster, backdrop, year, isAnime }

// "watchlist" = titre ajoute a la bibliotheque (suivi actif).
export function isInLibrary(it) {
  return !!it?.watchlist;
}

export async function ensureInLibrary(meta) {
  const it = ensureItem(meta);
  if (!it.watchlist) {
    it.watchlist = true;
    await saveItem(it);
  }
  return it;
}

// Retirer un titre de la liste se fait en un geste (bouton "Ajoute", coche
// d'une affiche, croix en vue liste) : un tap distrait faisait disparaitre un
// titre deja vu. On demande donc confirmation, en le disant clairement
// quand le titre a deja ete vu ou note.
export function confirmRemoveFromList(it) {
  const seen = it && (isSeen(it) || isStarted(it) || (it.plays || 0) > 0);
  const rated = ratingOf(it) > 0;
  let message = tr('Il disparaitra de Ma liste.');
  if (seen) message = tr('Tu as deja vu ce titre. Il disparaitra de Ma liste, mais tes visionnages et ta note sont conserves.');
  else if (rated) message = tr('Il disparaitra de Ma liste, mais ta note est conservee.');
  return openAskSheet({
    title: `${tr('Retirer')} "${it?.title || ''}" ?`,
    message,
    confirmLabel: tr('Retirer'),
    cancelLabel: tr('Annuler'),
    danger: true,
  });
}

// Retire de la liste apres confirmation. Retourne true si retire.
export async function removeFromList(it) {
  if (!it?.watchlist) return false;
  if (!(await confirmRemoveFromList(it))) return false;
  it.watchlist = false;
  await saveItem(it);
  toast(tr('Retire de ma liste'));
  return true;
}

export async function toggleAdd(meta) {
  const it = ensureItem(meta);
  if (it.watchlist) {
    await removeFromList(it);
    return !!it.watchlist;
  }
  it.watchlist = true;
  await saveItem(it);
  toast(tr('Ajoute a ma liste'));
  return true;
}

// ---- Notes ----

// rating : 1..5, ou 0 pour retirer la note.
export async function setRating(meta, rating) {
  const it = ensureItem(meta);
  const r = RATINGS.some((x) => x.value === rating) ? rating : 0;
  it.rating = r;
  it.favorite = r === 5;
  // Comme l'ancien favori : noter un titre le range dans la bibliotheque.
  // Sauvegarde dans tous les cas : ensureInLibrary n'ecrit rien quand le
  // titre est deja dans la liste, la note aurait ete perdue.
  if (r) it.watchlist = true;
  await saveItem(it);
  toast(r ? `${tr('Note :')} ${ratingLabel(r)}` : tr('Note retiree'));
  return r;
}

// Selecteur de note, en bulle au-dessus du bouton `anchor`.
// Deux facons de choisir : toucher une option, ou (apres un appui long)
// glisser le doigt jusqu'a une option et relacher. Resout la note choisie,
// 0 pour "retirer", ou null si on ferme sans choisir.
export function openRatingPicker(anchor, current = 0) {
  const root = document.getElementById('overlay-root');
  const veil = h('<div class="rate-veil"></div>');
  const pop = h(`
    <div class="rate-pop" role="dialog" aria-label="${tr('Noter')}">
      <div class="rate-opts">
        ${RATINGS.map((r) => `
          <button type="button" class="rate-opt rate-${r.key} ${r.value === current ? 'on' : ''}" data-v="${r.value}" aria-label="${esc(tr(r.label))}">
            <span class="rate-ico">${r.icon}</span>
          </button>`).join('')}
      </div>
      <div class="rate-caption">${current ? esc(ratingLabel(current)) : tr('Reste appuye et glisse, ou touche')}</div>
      ${current ? `<button type="button" class="rate-clear" data-v="0">${I.x}<span>${tr('Retirer la note')}</span></button>` : ''}
    </div>
  `);
  root.append(veil, pop);

  // Placement : centre sur le bouton, au-dessus si la place le permet.
  const a = anchor.getBoundingClientRect();
  const w = pop.offsetWidth;
  const hgt = pop.offsetHeight;
  const left = Math.min(Math.max(8, a.left + a.width / 2 - w / 2), window.innerWidth - w - 8);
  const top = a.top - hgt - 10 > 8 ? a.top - hgt - 10 : a.bottom + 10;
  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;
  requestAnimationFrame(() => pop.classList.add('in'));

  const caption = pop.querySelector('.rate-caption');
  let hover = null;
  const setHover = (btn) => {
    if (btn === hover) return;
    hover?.classList.remove('hover');
    hover = btn;
    if (btn) {
      btn.classList.add('hover');
      caption.textContent = Number(btn.dataset.v) ? ratingLabel(btn.dataset.v) : tr('Retirer la note');
    }
  };

  let done;
  const result = new Promise((resolve) => { done = resolve; });
  const finish = (value) => {
    veil.remove();
    pop.remove();
    done(value);
  };

  veil.addEventListener('click', () => finish(null));
  pop.addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (b) finish(Number(b.dataset.v));
  });

  // Suivi du doigt reste pose apres l'appui long (appele par bindRatingButton)
  const track = (x, y) => {
    const el = document.elementFromPoint(x, y);
    setHover(el?.closest?.('.rate-pop [data-v]') || null);
  };
  const release = () => {
    if (hover) finish(Number(hover.dataset.v));
  };
  return { result, track, release };
}

// Bouton de note : un tap sur un titre non note = J'adore (le geste de
// l'ancien favori) ; un tap sur un titre deja note ouvre le selecteur, pour
// ne jamais perdre une note par megarde ; un appui long l'ouvre toujours.
// onChange(rating) est appele apres chaque modification.
const LONG_MS = 420;
const HINT_KEY = 'bobine_rate_hint';

export function bindRatingButton(btn, meta, onChange) {
  let timer = null;
  let picker = null;
  let longFired = false;
  let startXY = null;

  const current = () => ratingOf(getItem(meta.type, meta.tmdbId));

  const apply = async (value) => {
    if (value === null || value === undefined) return;
    if (value === current()) return;
    await setRating(meta, value);
    onChange?.(value);
  };

  const openPicker = () => {
    picker = openRatingPicker(btn, current());
    picker.result.then((v) => { picker = null; apply(v); });
  };

  const tap = async () => {
    if (picker) return;
    if (current()) { openPicker(); return; }
    await apply(5);
    if (!localStorage.getItem(HINT_KEY)) {
      try { localStorage.setItem(HINT_KEY, '1'); } catch { /* quota */ }
      setTimeout(() => toast(tr('Astuce : reste appuye pour choisir une autre note')), 900);
    }
  };

  // Pendant l'appui, toute la page est rendue non selectionnable (classe sur
  // body) : sur iPhone, un appui long lance sinon la selection de texte
  // native, qui s'etendait a toute la page.
  const pressing = (on) => {
    document.body.classList.toggle('rate-pressing', on);
    if (on) window.getSelection?.()?.removeAllRanges();
  };

  btn.addEventListener('contextmenu', (e) => e.preventDefault());

  // Le touchstart annule (non passif) est ce qui empeche vraiment iOS de
  // lancer la selection / la loupe. Consequence : iOS ne genere plus de
  // "click" apres un tap, le tap est donc gere sur pointerup.
  btn.addEventListener('touchstart', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });

  btn.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    longFired = false;
    startXY = { x: e.clientX, y: e.clientY };
    pressing(true);
    clearTimeout(timer);
    timer = setTimeout(() => {
      longFired = true;
      window.getSelection?.()?.removeAllRanges();
      try { navigator.vibrate?.(12); } catch { /* ignore */ }
      openPicker();
    }, LONG_MS);
  });

  btn.addEventListener('pointermove', (e) => {
    if (!longFired && startXY && Math.hypot(e.clientX - startXY.x, e.clientY - startXY.y) > 12) {
      clearTimeout(timer); // le doigt part ailleurs : ce n'est pas un appui long
      startXY = null;      // ... ni un tap
    }
    if (longFired && picker) picker.track(e.clientX, e.clientY);
  });

  btn.addEventListener('pointerup', () => {
    clearTimeout(timer);
    pressing(false);
    if (longFired) {
      picker?.release();
      return;
    }
    if (startXY) tap();
    startXY = null;
  });

  btn.addEventListener('pointercancel', () => {
    clearTimeout(timer);
    pressing(false);
    startXY = null;
  });

  // Souris et tactile passent par pointerup ci-dessus ; le click ne sert plus
  // qu'au clavier (Entree / Espace), reconnaissable a detail === 0.
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    if (e.detail === 0) tap();
  });
}

export async function setMoviePlays(meta, plays) {
  const it = ensureItem(meta);
  if (!it.runtime && meta.runtime) it.runtime = meta.runtime;
  it.plays = Math.max(0, plays);
  if (it.plays > 0) it.watchlist = true;
  await saveItem(it);
  return it.plays;
}

export async function setEpisodePlays(meta, season, episode, plays) {
  const it = ensureItem(meta);
  if (!it.episodeRuntime) it.episodeRuntime = meta.episodeRuntime || 50;
  const key = `${season}:${episode}`;
  if (plays > 0) {
    it.episodes[key] = plays;
    it.watchlist = true;
  } else delete it.episodes[key];
  await saveItem(it);
  return it.episodes[key] || 0;
}

// ---- Rattrapage : completer les episodes precedents d'une saison ----
// Un seul mecanisme couvre les trois cas d'usage : premier visionnage (on
// coche le 56e, les 55 premiers suivent), reprise apres interruption (1-56
// deja vus, on coche le 76e, 57-75 suivent) et revisionnage (saison deja vue,
// on remet +1 sur le 40e, les 39 precedents passent aussi a 2). Dans tous les
// cas on ne fait que remonter au niveau vise : un compteur deja superieur
// n'est jamais abaisse.

// Episodes de `epNumbers` dont le compteur de visionnages est sous `target`.
export function episodesUnder(it, season, epNumbers, target) {
  if (!it) return [...epNumbers];
  return epNumbers.filter((n) => (it.episodes[`${season}:${n}`] || 0) < target);
}

// Aligne sur `target` les episodes indiques restes en dessous.
// Retourne le nombre d'episodes reellement modifies.
export async function levelUpEpisodes(meta, season, epNumbers, target) {
  const it = ensureItem(meta);
  if (!it.episodeRuntime) it.episodeRuntime = meta.episodeRuntime || 50;
  let changed = 0;
  for (const ep of epNumbers) {
    const key = `${season}:${ep}`;
    if ((it.episodes[key] || 0) < target) {
      it.episodes[key] = target;
      changed++;
    }
  }
  if (changed) {
    it.watchlist = true;
    await saveItem(it);
  }
  return changed;
}

export async function markSeason(meta, season, episodeNumbers, mode) {
  const it = ensureItem(meta);
  if (!it.episodeRuntime) it.episodeRuntime = meta.episodeRuntime || 50;
  let touched = false;
  for (const ep of episodeNumbers) {
    const key = `${season}:${ep}`;
    const cur = it.episodes[key] || 0;
    if (mode === 'all' && cur === 0) { it.episodes[key] = 1; touched = true; }
    if (mode === 'none') delete it.episodes[key];
    if (mode === 'rewatch') { it.episodes[key] = cur + 1; touched = true; }
  }
  if (touched || mode === 'all') it.watchlist = true;
  await saveItem(it);
}

export function updateItemTotals(meta, detail) {
  const it = getItem(meta.type, meta.tmdbId);
  if (!it || meta.type !== 'tv') return;
  const totals = {};
  let sum = 0;
  for (const s of detail.seasons || []) {
    if (s.season_number === 0) continue;
    totals[s.season_number] = s.episode_count;
    sum += s.episode_count;
  }
  it.seasonEpisodeTotals = totals;
  it.episodeTotal = sum;
  if (detail.episode_run_time?.length) {
    it.episodeRuntime = Math.round(
      detail.episode_run_time.reduce((a, b) => a + b, 0) / detail.episode_run_time.length
    );
  }
  saveItem(it);
}

export function cacheEpisodeRuntimes(meta, season, episodes) {
  const it = getItem(meta.type, meta.tmdbId);
  if (!it) return;
  if (!it.episodeRuntimes) it.episodeRuntimes = {};
  for (const ep of episodes) {
    if (ep.runtime) it.episodeRuntimes[`${season}:${ep.episode_number}`] = ep.runtime;
  }
  const vals = Object.values(it.episodeRuntimes);
  if (vals.length) {
    it.episodeRuntime = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }
  saveItem(it);
}

export async function syncTvRuntimes(meta, tmdbId) {
  const it = getItem('tv', tmdbId);
  if (!it || !Object.keys(it.episodes || {}).length) return;
  const seasons = new Set();
  for (const key of Object.keys(it.episodes)) {
    if (!it.episodeRuntimes?.[key]) seasons.add(Number(key.split(':')[0]));
  }
  for (const sn of seasons) {
    try {
      const data = await api.season(tmdbId, sn);
      cacheEpisodeRuntimes(meta, sn, data.episodes || []);
    } catch { /* hors ligne */ }
  }
}

// ---- Sheet playlists ----

export function openPlaylistSheet(meta, onChange) {
  const box = h('<div></div>');
  box.appendChild(h(`<h3>${tr('Ajouter a une playlist')}</h3>`));

  const list = h('<div></div>');
  box.appendChild(list);

  const renderList = () => {
    list.innerHTML = '';
    const pls = [...state.playlists.values()].sort((a, b) => a.createdAt - b.createdAt);
    if (!pls.length) {
      list.appendChild(h(`<p style="color:var(--text-muted);font-size:13.5px;padding:4px 0 10px">${tr('Aucune playlist pour le moment. Cree la premiere !')}</p>`));
    }
    for (const pl of pls) {
      const inIt = pl.items.some((x) => x.id === `${meta.type}_${meta.tmdbId}`);
      const row = h(`
        <button class="sheet-opt">
          ${I.list}
          <span>${esc(pl.name)}</span>
          <span style="color:var(--text-faint);font-size:12px;margin-left:6px">${pl.items.length}</span>
          ${inIt ? `<span class="mark">${I.check.replace('svg ', 'svg width="18" height="18" ')}</span>` : ''}
        </button>
      `);
      row.addEventListener('click', async () => {
        const id = `${meta.type}_${meta.tmdbId}`;
        if (inIt) {
          pl.items = pl.items.filter((x) => x.id !== id);
          toast(`${tr('Retire de')} "${pl.name}"`);
        } else {
          await ensureInLibrary(meta);
          pl.items.push({
            id, type: meta.type, tmdbId: meta.tmdbId,
            title: meta.title, poster: meta.poster, year: meta.year || '',
          });
          toast(`${tr('Ajoute a')} "${pl.name}"`);
        }
        await savePlaylist(pl);
        renderList();
        onChange?.();
      });
      list.appendChild(row);
    }
  };
  renderList();

  const newBtn = h(`<button class="sheet-opt accent">${I.plus}<span>${tr('Nouvelle playlist')}</span></button>`);
  newBtn.addEventListener('click', () => {
    if (box.querySelector('.sheet-input')) return;
    const input = h(`<input class="sheet-input" placeholder="${tr('Nom de la playlist')}" autocapitalize="sentences">`);
    const ok = h(`<button class="btn">${tr('Creer')}</button>`);
    box.append(input, ok);
    input.focus();
    const create = async () => {
      const name = input.value.trim();
      if (!name) return;
      const pl = createPlaylist(name);
      const id = `${meta.type}_${meta.tmdbId}`;
      await ensureInLibrary(meta);
      pl.items.push({
        id, type: meta.type, tmdbId: meta.tmdbId,
        title: meta.title, poster: meta.poster, year: meta.year || '',
      });
      await savePlaylist(pl);
      toast(`"${pl.name}" ${tr('creee, titre ajoute')}`);
      input.remove();
      ok.remove();
      renderList();
      onChange?.();
    };
    ok.addEventListener('click', create);
    input.addEventListener('keydown', (e) => e.key === 'Enter' && create());
  });
  box.appendChild(newBtn);

  return openSheet(box);
}
