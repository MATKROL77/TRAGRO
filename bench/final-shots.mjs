#!/usr/bin/env node
/** Capturas finales (Fase 6): node bench/final-shots.mjs --url <url> --out bench/shots/final */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i < 0 ? d : args[i + 1]; };
const URL_ = opt('url', 'http://localhost:4173');
const OUT = opt('out', 'bench/shots/final');
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch();
const hideUi = '.price-float,.topbar,.compare-fab,.toast-zone,.sim,.hs-card,.pose-badge,.capture-progress{visibility:hidden!important}';
for (const [label, vp, dsf] of [['desktop', { width: 1440, height: 900 }, 1], ['mobile', { width: 375, height: 812 }, 2]]) {
  const page = await (await b.newContext({ viewport: vp, deviceScaleFactor: dsf })).newPage();
  await page.goto(`${URL_}/?q=high`);
  await page.waitForFunction(() => window.__sp?.runtime?.warmup != null, null, { timeout: 300000 });
  await page.evaluate(() => { const s = window.__sp.store.getState(); if (s.showHotspots) s.toggle('showHotspots'); window.__sp.runtime.timeScale = 4; });
  await page.addStyleTag({ content: hideUi });
  const still = async () => {
    await page.evaluate(() => { window.__sp.runtime.lastInteraction = performance.now() + 1e9; });
    await page.waitForFunction(() => window.__sp.refine.samples >= 6 || window.__sp.store.getState().scene !== 'studio', null, { timeout: 300000, polling: 500 });
  };
  const shot = (n) => page.locator('.viewer').screenshot({ path: `${OUT}/${label}-${n}.png`, timeout: 180000 });
  // Estudio 3/4 (refinado)
  await page.evaluate(() => window.__sp.store.getState().requestCam('front34'));
  await page.waitForTimeout(4000);
  await still();
  await shot('1-estudio-34');
  // tolvas
  await page.evaluate(() => window.__sp.store.getState().requestCam('hoppers'));
  await page.waitForTimeout(4000);
  await still();
  await shot('2-tolvas');
  // detalle del cuerpo de siembra
  await page.evaluate(() => window.__sp.store.getState().setDetail(true));
  await page.waitForTimeout(5000);
  await still();
  await shot('3-cuerpo-de-siembra');
  await page.evaluate(() => window.__sp.store.getState().setDetail(false));
  // campo sembrando
  await page.evaluate(() => window.__sp.store.getState().setScene('field'));
  await page.waitForFunction(() => window.__sp.runtime.distance > 15, null, { timeout: 300000, polling: 500 });
  await shot('4-campo-sembrando');
  // ruta plegada
  await page.evaluate(() => window.__sp.store.getState().setScene('road'));
  await page.waitForFunction(() => window.__sp.runtime.model?.state.poseT > 0.99, null, { timeout: 120000 });
  await page.waitForTimeout(6000);
  await shot('5-ruta-plegada');
  await page.close();
  console.log('ok', label);
}
await b.close();
