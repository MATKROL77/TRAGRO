#!/usr/bin/env node
/**
 * Capturas comparables de las 3 escenas (sin la UI), para el reporte antes/después de cada fase.
 *   node bench/shots.mjs --url https://… --out bench/shots/fase1-antes [--headless] [--q high]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i < 0 ? d : args[i + 1]; };
const URL_ = opt('url', 'http://localhost:4173');
const OUT = opt('out', 'bench/shots/actual');
const Q = opt('q', 'high');
const headless = args.includes('--headless');
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ headless, args: headless ? [] : ['--ignore-gpu-blocklist'] });
for (const [label, vp] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 375, height: 812 }]]) {
  if (label === 'mobile' && !args.includes('--mobile')) continue;
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: label === 'mobile' ? 2 : 1 });
  const page = await ctx.newPage();
  await page.goto(`${URL_}${URL_.includes('?') ? '&' : '?'}q=${Q}`);
  await page.waitForFunction(() => window.__sp?.store.getState().viewerReady === true, null, { timeout: 240000 });
  await page.evaluate(() => { window.__sp.runtime.timeScale = 4; const s = window.__sp.store.getState(); if (s.showHotspots) s.toggle('showHotspots'); });
  await page.addStyleTag({ content: '.price-float,.topbar,.compare-fab,.toast-zone,.sim,.hs-card,.pose-badge,.dim-label{visibility:hidden!important}' });
  const shot = async (name, wait) => { await page.waitForTimeout(wait); await page.locator('.viewer').screenshot({ path: `${OUT}/${label}-${name}.png` }); };
  await shot('estudio', 6000);
  await page.evaluate(() => window.__sp.store.getState().setScene('field'));
  // esperar a que haya sembrado un tramo (sin GPU los cuadros son lentos y la simulación avanza por cuadro)
  await page.waitForFunction(() => window.__sp.runtime.distance > 15, null, { timeout: 300000, polling: 500 });
  await shot('campo', 500);
  await page.evaluate(() => window.__sp.store.getState().setScene('road'));
  await page.waitForFunction(() => window.__sp.runtime.model?.state.poseT > 0.99, null, { timeout: 120000 });
  await shot('ruta', 8000);
  await ctx.close();
}
await b.close();
console.log('capturas en', OUT);
