// Actions sur les items (favori, watchlist, vus, playlists)
import {
  ensureItem, saveItem, getItem, state,
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
    const create = () => {
      const name = input.value.trim();
      if (!name) return;
      createPlaylist(name);
      input.remove();
      ok.remove();
      renderList();
    };
    ok.addEventListener('click', create);
    input.addEventListener('keydown', (e) => e.key === 'Enter' && create());
  });
  box.appendChild(newBtn);

  return openSheet(box);
}
