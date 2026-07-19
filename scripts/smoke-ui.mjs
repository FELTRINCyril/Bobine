#!/usr/bin/env node
/**
 * Smoke UI Bobine — filtre/tri + taille bouton favori personne.
 * Usage: node scripts/smoke-ui.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.BOBINE_URL || 'http://127.0.0.1:8765';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.addInitScript(() => {
    localStorage.setItem('bobine_tmdb_mode', 'proxy');
    localStorage.setItem('bobine_tmdb_proxy', 'https://example.invalid');
    navigator.serviceWorker?.getRegistrations?.().then((regs) => {
      regs.forEach((r) => r.unregister());
    });
  });

  await page.goto(`${BASE}/?smoke=1#/watchlist`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForSelector('.chips-row .chip-filter', { timeout: 10000 });

  await page.click('.chips-row .chip-filter');
  await page.waitForSelector('.sheet h3', { timeout: 4000 });
  const sheetTitle = (await page.locator('.sheet h3').first().textContent()) || '';
  if (!/Filtres|Filters/i.test(sheetTitle)) {
    throw new Error(`Sheet filtre absente ou mauvais titre: "${sheetTitle}"`);
  }
  await page.click('.sheet-veil');
  await page.waitForTimeout(200);

  // Design bouton fav personne (CSS)
  await page.setContent(`<!DOCTYPE html>
    <html data-skin="cinema" data-mode="dark">
    <head>
      <link rel="stylesheet" href="${BASE}/css/themes.css?v=1.19">
      <link rel="stylesheet" href="${BASE}/css/app.css?v=1.19">
    </head>
    <body style="background:#0c0a10;margin:0;padding:20px">
      <div class="person-hero">
        <div class="person-photo"><span class="no-img">ED</span></div>
        <h1 class="person-name">Emma D'Arcy</h1>
        <div class="person-meta"><span class="person-chip">Acteur</span></div>
        <button type="button" class="person-fav">
          <span class="person-fav-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20.5s-7.5-4.7-9.3-9.2C1.3 7.7 3.6 4.5 7 4.5c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.4 0 5.7 3.2 4.3 6.8-1.8 4.5-9.3 9.2-9.3 9.2Z"/></svg></span>
          <span>Ajouter aux favoris</span>
        </button>
      </div>
    </body></html>`);
  await page.waitForSelector('.person-fav');
  const box = await page.locator('.person-fav').boundingBox();
  if (!box) throw new Error('Bouton .person-fav introuvable');
  if (box.height > 56) throw new Error(`Bouton fav trop haut: ${box.height}px`);
  if (box.width > 280) throw new Error(`Bouton fav trop large: ${box.width}px`);
  if (box.width < 120) throw new Error(`Bouton fav trop etroit: ${box.width}px`);

  // Verifie que le JS servi contient bien le wiring corrige
  const viewsSrc = await page.evaluate(async (base) => {
    const r = await fetch(`${base}/js/views.js?v=1.19`, { cache: 'no-store' });
    return r.text();
  }, BASE);
  if (viewsSrc.includes('{ extras } = {}')) {
    throw new Error('views.js contient encore le bug { extras }');
  }
  if (!viewsSrc.includes('opts.onFilter')) {
    throw new Error('views.js ne contient pas opts.onFilter');
  }
  if (!viewsSrc.includes('class="person-fav"') && !viewsSrc.includes("class=\"person-fav\"")) {
    // template uses person-fav
    if (!/person-fav/.test(viewsSrc)) throw new Error('views.js sans classe person-fav');
  }

  if (errors.length) console.warn('pageerrors (ignores si hors ligne TMDB):', errors.slice(0, 3));

  console.log(`OK smoke-ui (filtre sheet + fav ${Math.round(box.width)}x${Math.round(box.height)}px)`);
  await browser.close();
}

main().catch((e) => {
  console.error('FAIL:', e.message || e);
  process.exit(1);
});
