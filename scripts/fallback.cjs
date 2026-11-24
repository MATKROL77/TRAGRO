/**
 * Regenera las imágenes del fallback sin WebGL (public/fallback/<tipo>.jpg) a partir
 * del visor real. Uso: con el build servido (`npm run preview`), `node scripts/fallback.cjs`.
 */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const BASE_URL = process.env.BASE_URL || 'http://localhost:4173';
const OUT = path.resolve(__dirname, '..', 'public', 'fallback');

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: process.env.E2E_GPU === '1' ? [] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await page.goto(BASE_URL + '/embed', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__store && window.__store.getState().ready, null, { timeout: 180000 });
  await page.evaluate(() => { window.__fast = true; });
  for (const tipo of ['tolva', 'batea', 'plataforma', 'furgon']) {
    await page.evaluate((t) => window.__store.getState().setTipo(t), tipo);
    await page.waitForTimeout(2500);
    const url = await page.evaluate(() => window.__captura({ preset: 'tresCuartos', width: 1120, height: 700, type: 'image/jpeg', quality: 0.86 }));
    if (!url) throw new Error(`No se pudo capturar ${tipo}`);
    fs.writeFileSync(path.join(OUT, `${tipo}.jpg`), Buffer.from(url.split(',')[1], 'base64'));
    console.log(`✓ ${tipo}.jpg`);
  }
  await browser.close();
})();
