// Captura cuadro por cuadro del configurador (copia local con window.__r3f).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const BASE = 'http://localhost:4174';
const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const HIDE = `.header,.side,.topbar,.price-float,.compare-fab,.notices,.ayuda-visor,.hotcard,.loading,.modal-backdrop,.skip{display:none!important}
.app{grid-template-rows:minmax(0,1fr)!important}.main{grid-template-columns:minmax(0,1fr)!important}`;

async function open(browser, query = '', { ui = false, w = 1920, h = 1080 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror', String(e).slice(0, 200)));
  await page.goto(`${BASE}/${query}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__store && window.__store.getState().ready && window.__r3f, null, { timeout: 180000 });
  if (!ui) {
    await page.addStyleTag({ content: HIDE });
    await page.evaluate(() => window.__store.getState().setUi({ hotspots: false, autoFoco: false, modal: 'atajos', calidad: 'alta' }));
  }
  await page.waitForTimeout(1500);
  return { ctx, page };
}

/** Pasa a render manual: cada step() dibuja exactamente un cuadro con el delta pedido. */
async function manual(page) {
  await page.evaluate(() => {
    window.__rigLock.locked = true;
    window.__r3f().setFrameloop('never');
    // El reloj de R3F se reinicia al cambiar de modo: se fija a mano para que el primer delta sea chico y positivo.
    const c = window.__r3f().clock;
    window.__T = Math.max(c.elapsedTime, 1000);
    c.elapsedTime = window.__T;
    window.__step = (dt) => { window.__T += dt; window.__r3f().advance(window.__T); };
  });
}
const step = (page, dt = 1 / 30) => page.evaluate((d) => window.__step(d), dt);
const cam = (page, p, t) => page.evaluate(([p, t]) => window.__cam(p[0], p[1], p[2], t[0], t[1], t[2]), [p, t]);
const getCam = (page) => page.evaluate(() => window.__viewer.camera());
const st = (page, fn, arg) => page.evaluate(new Function('arg', `const s = window.__store.getState(); (${fn})(s, arg);`), arg);

/** Deja que carguen texturas y se estabilice el modelo. */
async function warm(page, n = 12) {
  for (let i = 0; i < n; i++) {
    await step(page, 0.05);
    await page.waitForTimeout(120);
  }
}

async function shot(page, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file, type: 'jpeg', quality: 92 });
}

module.exports = { chromium, ARGS, open, manual, step, cam, getCam, st, warm, shot };
