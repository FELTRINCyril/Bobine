// Actions sur les items (note, bibliotheque, vus, playlists)
import {
  ensureItem, saveItem, getItem, state, isSeen, isStarted,
  createPlaylist, savePlaylist,
} from './db.js';
import { api } from './api.js';
import { h, esc, I, openSheet, toast } from './ui.js';
import { tr } from './i18n.js';
import { openAskSheet } from './confirm.js';
import { RATINGS, ratingOf, ratingInfo, ratingLabel } from './ratings.js';

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

// Selecteur de note en eventail : les 5 notes s'ouvrent en demi-cercle
// autour du bouton `anchor`, de Nul (a gauche) a J'adore (a droite), en
// passant par le haut. On glisse le doigt dans la direction d'une note et on
// relache pour la choisir ; relacher sans avoir vise de note annule.
// Relacher sur la note deja posee la retire.
// Retourne { result, track(x, y), release(), cancel() } ; result resout la
// note choisie, 0 pour "retirer", ou null si annule.
const FAN_RADIUS = 96;    // rayon de l'eventail, en px
const FAN_DEADZONE = 26;  // en dessous, le doigt est encore "sur" le bouton

export function openRatingPicker(anchor, current = 0) {
  const root = document.getElementById('overlay-root');
  const a = anchor.querySelector('.act-ico')?.getBoundingClientRect() || anchor.getBoundingClientRect();
  const margin = 34;
  // Centre de l'eventail : sur le bouton, decale au besoin pour que les
  // notes des extremites restent a l'ecran.
  const cx = Math.min(Math.max(a.left + a.width / 2, FAN_RADIUS + margin), window.innerWidth - FAN_RADIUS - margin);
  const cy = a.top + a.height / 2;
  // Pas la place au-dessus : l'eventail s'ouvre vers le bas.
  const up = cy - FAN_RADIUS - 70 > 0;
  const dir = up ? -1 : 1;

  // Nul -> J'adore, de gauche a droite : angles 180, 135, 90, 45, 0 degres.
  const order = [...RATINGS].sort((x, y) => x.value - y.value);
  const angleOf = (i) => 180 - i * 45;

  const fan = h(`
    <div class="rate-fan ${up ? '' : 'down'}" role="dialog" aria-label="${tr('Noter')}">
      <div class="rate-fan-veil"></div>
      <svg class="rate-fan-arc" width="${FAN_RADIUS * 2 + 60}" height="${FAN_RADIUS + 60}" viewBox="0 0 ${FAN_RADIUS * 2 + 60} ${FAN_RADIUS + 60}">
        <path d="M 30 ${FAN_RADIUS + 30} A ${FAN_RADIUS} ${FAN_RADIUS} 0 0 1 ${FAN_RADIUS * 2 + 30} ${FAN_RADIUS + 30}"/>
      </svg>
      <div class="rate-fan-hub">${ratingInfo(current)?.icon || I.heart}</div>
      ${order.map((r, i) => {
        const rad = (angleOf(i) * Math.PI) / 180;
        const x = Math.cos(rad) * FAN_RADIUS;
        const y = Math.sin(rad) * FAN_RADIUS * dir;
        return `
          <div class="rate-fan-opt rate-${r.key} ${r.value === current ? 'current' : ''}" data-v="${r.value}"
               style="--x:${x.toFixed(1)}px;--y:${y.toFixed(1)}px;--i:${i}">
            <span class="rate-ico">${r.icon}</span>
          </div>`;
      }).join('')}
      <div class="rate-fan-label">${tr('Glisse vers une note')}</div>
    </div>
  `);
  fan.style.setProperty('--cx', `${cx}px`);
  fan.style.setProperty('--cy', `${cy}px`);
  fan.style.setProperty('--r', `${FAN_RADIUS}px`);
  root.appendChild(fan);
  requestAnimationFrame(() => requestAnimationFrame(() => fan.classList.add('in')));

  const opts = [...fan.querySelectorAll('.rate-fan-opt')];
  const label = fan.querySelector('.rate-fan-label');
  const hub = fan.querySelector('.rate-fan-hub');
  let hover = null;

  const setHover = (el) => {
    if (el === hover) return;
    hover?.classList.remove('hover');
    hover = el;
    fan.classList.toggle('aiming', !!el);
    if (!el) {
      label.textContent = tr('Glisse vers une note');
      label.style.removeProperty('--lc');
      hub.innerHTML = ratingInfo(current)?.icon || I.heart;
      hub.className = 'rate-fan-hub';
      return;
    }
    el.classList.add('hover');
    const v = Number(el.dataset.v);
    const info = ratingInfo(v);
    label.textContent = v === current ? tr('Retirer la note') : tr(info.label);
    label.style.setProperty('--lc', `var(--rate-${info.key})`);
    hub.innerHTML = info.icon;
    hub.className = `rate-fan-hub rate-${info.key}`;
    try { navigator.vibrate?.(8); } catch { /* ignore */ }
  };

  // Vise par la DIRECTION du doigt, pas par sa position exacte : pas besoin
  // de tomber pile sur une pastille, il suffit de partir du bon cote.
  const track = (x, y) => {
    const dx = x - cx;
    const dy = (y - cy) * dir; // vers l'ouverture de l'eventail = positif
    if (Math.hypot(dx, dy) < FAN_DEADZONE) { setHover(null); return; }
    const deg = (Math.atan2(dy, dx) * 180) / Math.PI; // 0 = droite, 90 = ouverture
    if (deg < -35 && deg > -145) { setHover(null); return; } // doigt parti a l'oppose
    const norm = deg < -90 ? deg + 360 : deg; // -35..0 et 180..215 restent aux extremites
    let best = 0;
    for (let i = 1; i < opts.length; i++) {
      if (Math.abs(angleOf(i) - norm) < Math.abs(angleOf(best) - norm)) best = i;
    }
    setHover(opts[best]);
  };

  let done;
  const result = new Promise((resolve) => { done = resolve; });
  let closed = false;
  const finish = (value) => {
    if (closed) return;
    closed = true;
    fan.classList.remove('in');
    fan.classList.add('out');
    setTimeout(() => fan.remove(), 180);
    done(value);
  };

  const release = () => {
    if (!hover) { finish(null); return; }
    const v = Number(hover.dataset.v);
    hover.classList.add('picked');
    finish(v === current ? 0 : v);
  };

  return { result, track, release, cancel: () => finish(null) };
}

// Bouton de note : un tap sur un titre non note = J'adore (le geste de
// l'ancien favori) ; un appui long ouvre l'eventail des notes. Un tap sur un
// titre deja note ne change rien (on ne perd jamais une note par megarde) :
// il rappelle juste le geste.
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
    if (startXY) picker.track(startXY.x, startXY.y);
    picker.result.then((v) => { picker = null; apply(v); });
  };

  const tap = async () => {
    if (picker) return;
    if (current()) {
      btn.classList.remove('nudge');
      void btn.offsetWidth;
      btn.classList.add('nudge');
      toast(tr('Reste appuye et glisse pour changer la note'));
      return;
    }
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
    picker?.cancel();
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
