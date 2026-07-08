// Actions sur les items (favori, watchlist, vus, playlists)
import {
  ensureItem, saveItem, getItem, state, isSeen,
  createPlaylist, savePlaylist,
} from './db.js';
import { api } from './api.js';
import { h, esc, I, openSheet, toast } from './ui.js';

// meta = { type, tmdbId, title, poster, backdrop, year, isAnime }

export async function toggleFavorite(meta) {
  const it = ensureItem(meta);
  it.favorite = !it.favorite;
  await saveItem(it);
  toast(it.favorite ? 'Ajoute aux favoris' : 'Retire des favoris');
  return it.favorite;
}

export async function toggleWatchlist(meta) {
  const it = ensureItem(meta);
  it.watchlist = !it.watchlist;
  await saveItem(it);
  toast(it.watchlist ? 'Ajoute a la watchlist' : 'Retire de la watchlist');
  return it.watchlist;
}

export async function setMoviePlays(meta, plays) {
  const it = ensureItem(meta);
  if (!it.runtime && meta.runtime) it.runtime = meta.runtime;
  it.plays = Math.max(0, plays);
  await saveItem(it);
  return it.plays;
}

export async function setEpisodePlays(meta, season, episode, plays) {
  const it = ensureItem(meta);
  if (!it.episodeRuntime) it.episodeRuntime = meta.episodeRuntime || 50;
  const key = `${season}:${episode}`;
  if (plays > 0) it.episodes[key] = plays;
  else delete it.episodes[key];
  await saveItem(it);
  return it.episodes[key] || 0;
}

export async function markSeason(meta, season, episodeNumbers, mode) {
  const it = ensureItem(meta);
  if (!it.episodeRuntime) it.episodeRuntime = meta.episodeRuntime || 50;
  for (const ep of episodeNumbers) {
    const key = `${season}:${ep}`;
    const cur = it.episodes[key] || 0;
    if (mode === 'all' && cur === 0) it.episodes[key] = 1;
    if (mode === 'none') delete it.episodes[key];
    if (mode === 'rewatch') it.episodes[key] = cur + 1;
  }
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

// Bascule vu / non vu sans passer par la fiche.
// Pour une serie : marque toutes les saisons (via le detail TMDB).
export async function toggleSeenQuick(meta) {
  if (meta.type === 'movie') {
    const cur = getItem('movie', meta.tmdbId)?.plays || 0;
    await setMoviePlays(meta, cur > 0 ? 0 : 1);
    return cur === 0;
  }
  const d = await api.detail('tv', meta.tmdbId);
  const it = getItem('tv', meta.tmdbId);
  const target = !(it && isSeen(it));
  for (const s of d.seasons || []) {
    if (s.season_number === 0) continue;
    const eps = Array.from({ length: s.episode_count }, (_, i) => i + 1);
    await markSeason(meta, s.season_number, eps, target ? 'all' : 'none');
  }
  updateItemTotals(meta, d);
  if (target) syncTvRuntimes(meta, meta.tmdbId); // durees en arriere-plan
  return target;
}

// ---- Sheet actions rapides (bouton + sur les affiches) ----

export function openQuickSheet(meta, onChange) {
  const box = h('<div></div>');
  box.appendChild(h(`<h3 style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(meta.title)}</h3>`));
  const list = h('<div></div>');
  box.appendChild(list);
  let busy = false;

  const render = () => {
    const it = getItem(meta.type, meta.tmdbId);
    const seen = it ? isSeen(it) : false;
    const mark = `<span class="mark">${I.check}</span>`;
    list.innerHTML = '';

    const rows = [
      {
        icon: seen ? I.check : I.eye,
        label: seen ? 'Vu' : 'Marquer vu',
        on: seen,
        async run() {
          if (busy) return;
          busy = true;
          try {
            const nowSeen = await toggleSeenQuick(meta);
            toast(nowSeen ? 'Marque comme vu' : 'Marque non vu');
          } catch {
            toast('Impossible (hors ligne ?)');
          }
          busy = false;
        },
      },
      {
        icon: it?.favorite ? I.heartFill : I.heart,
        label: 'Favori',
        on: !!it?.favorite,
        run: () => toggleFavorite(meta),
      },
      {
        icon: it?.watchlist ? I.bookmarkFill : I.bookmark,
        label: 'Watchlist',
        on: !!it?.watchlist,
        run: () => toggleWatchlist(meta),
      },
      {
        icon: I.plus,
        label: 'Ajouter a une playlist',
        on: false,
        run: () => { openPlaylistSheet(meta, onChange); return 'keep'; },
      },
    ];

    for (const r of rows) {
      const btn = h(`
        <button class="sheet-opt">
          ${r.icon}
          <span>${r.label}</span>
          ${r.on ? mark : ''}
        </button>
      `);
      btn.addEventListener('click', async () => {
        const res = await r.run();
        if (res !== 'keep') {
          render();
          onChange?.();
        }
      });
      list.appendChild(btn);
    }
  };
  render();

  return openSheet(box);
}

// ---- Sheet playlists ----

export function openPlaylistSheet(meta, onChange) {
  const box = h('<div></div>');
  box.appendChild(h('<h3>Ajouter a une playlist</h3>'));

  const list = h('<div></div>');
  box.appendChild(list);

  const renderList = () => {
    list.innerHTML = '';
    const pls = [...state.playlists.values()].sort((a, b) => a.createdAt - b.createdAt);
    if (!pls.length) {
      list.appendChild(h('<p style="color:var(--text-muted);font-size:13.5px;padding:4px 0 10px">Aucune playlist pour le moment. Cree la premiere !</p>'));
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
          toast(`Retire de "${pl.name}"`);
        } else {
          ensureItem(meta);
          await saveItem(getItem(meta.type, meta.tmdbId));
          pl.items.push({
            id, type: meta.type, tmdbId: meta.tmdbId,
            title: meta.title, poster: meta.poster, year: meta.year || '',
          });
          toast(`Ajoute a "${pl.name}"`);
        }
        await savePlaylist(pl);
        renderList();
        onChange?.();
      });
      list.appendChild(row);
    }
  };
  renderList();

  const newBtn = h(`<button class="sheet-opt accent">${I.plus}<span>Nouvelle playlist</span></button>`);
  newBtn.addEventListener('click', () => {
    if (box.querySelector('.sheet-input')) return;
    const input = h('<input class="sheet-input" placeholder="Nom de la playlist" autocapitalize="sentences">');
    const ok = h('<button class="btn">Creer</button>');
    box.append(input, ok);
    input.focus();
    const create = async () => {
      const name = input.value.trim();
      if (!name) return;
      const pl = createPlaylist(name);
      // le titre depuis lequel on cree la playlist y est ajoute directement
      const id = `${meta.type}_${meta.tmdbId}`;
      ensureItem(meta);
      await saveItem(getItem(meta.type, meta.tmdbId));
      pl.items.push({
        id, type: meta.type, tmdbId: meta.tmdbId,
        title: meta.title, poster: meta.poster, year: meta.year || '',
      });
      await savePlaylist(pl);
      toast(`"${pl.name}" creee, titre ajoute`);
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
