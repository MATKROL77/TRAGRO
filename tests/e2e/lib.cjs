/**
 * Utilidades de las pruebas de punta a punta (Playwright).
 * Requiere tener `playwright` disponible (npm i -D playwright && npx playwright install chromium).
 * BASE_URL apunta al build servido con `npm run preview` (por defecto http://localhost:4173).
 */
const path = require('node:path');
const fs = require('node:fs');
const { chromium, devices } = require('playwright');

const BASE_URL = process.env.BASE_URL || 'http://localhost:4173';
const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(__dirname, 'out');
const SHOTS = path.join(ROOT, 'screenshots');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(SHOTS, { recursive: true });

// En servidores sin GPU se usa el rasterizador por software de Chromium.
const GL_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--js-flags=--expose-gc'];

async function launch() {
  return chromium.launch({ args: process.env.E2E_GPU === '1' ? ['--js-flags=--expose-gc'] : GL_ARGS });
}

/** Abre la app y espera a que el primer cuadro esté en pantalla. Devuelve la página y los errores de consola. */
async function openApp(browser, { url = '/', mobile = false, viewport = { width: 1440, height: 900 }, fast = true } = {}) {
  const context = await browser.newContext(mobile ? { ...devices['iPhone 13'] } : { viewport, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text().slice(0, 400));
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 400)));
  const t0 = Date.now();
  await page.goto(BASE_URL + url, { waitUntil: 'load' });
  if (!/webgl=0/.test(url)) await page.waitForFunction(() => window.__store && window.__store.getState().ready, null, { timeout: 180000 });
  const readyMs = Date.now() - t0;
  // Acelera animaciones y transiciones de cámara: las capturas no esperan de más.
  if (fast) await page.evaluate(() => { window.__fast = true; });
  return { page, context, errors, readyMs };
}

const state = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__store.getState().config)));
const setUi = (page, patch) => page.evaluate((p) => window.__store.getState().setUi(p), patch);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Espera a que el visor quede quieto (sin cuadros nuevos) o a que pase el tiempo máximo. */
async function settle(page, maxMs = 6000) {
  const start = Date.now();
  let last = -1;
  while (Date.now() - start < maxMs) {
    const frames = await page.evaluate(() => window.__viewer.stats().frames);
    if (frames === last) return;
    last = frames;
    await sleep(700);
  }
}

class Report {
  constructor(name) {
    this.name = name;
    this.checks = [];
    this.data = {};
  }
  ok(label, cond, detail = '') {
    this.checks.push({ label, ok: !!cond, detail: String(detail) });
    console.log(`${cond ? '  ✓' : '  ✗'} ${label}${detail ? ' — ' + detail : ''}`);
    return !!cond;
  }
  get failed() {
    return this.checks.filter((c) => !c.ok).length;
  }
  save() {
    fs.writeFileSync(path.join(OUT, `${this.name}.json`), JSON.stringify({ name: this.name, checks: this.checks, data: this.data }, null, 2));
  }
}

module.exports = { BASE_URL, ROOT, OUT, SHOTS, launch, openApp, state, setUi, sleep, settle, Report, devices };
