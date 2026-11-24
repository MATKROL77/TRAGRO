// Captura determinista de tomas del configurador (reloj simulado de Playwright: 1 cuadro = 1/30 s).
// Uso: node scripts/promo/capture.mjs <toma> [<toma> ...]   (salida: /tmp/claude-0/promo/<toma>/0000.jpg)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = process.env.OUT || '/tmp/claude-0/promo';
const W = +(process.env.W || 1600);
const H = +(process.env.H || 900);
const FPS = 30;
const STEP = 1000 / 60; // un cuadro de render por paso
const TS = 60 / FPS / 1; // timeScale: cada render avanza 1/30 s de simulación

const CLEAN = `.header,.side,.topbar,.price-float,.compare-fab,.sim,.toast-zone,.hs-card,.detail-legend,.loader{display:none!important}
.app{grid-template-rows:minmax(0,1fr)!important}.main{grid-template-columns:minmax(0,1fr)!important}`;

// Helpers en la página: cámara manual (orbita / trayectorias)
const HELPERS = `
window.__cam = (p, t) => {
  const s = window.__sp; s.cam.position.set(p[0], p[1], p[2]); s.ctl.target.set(t[0], t[1], t[2]); s.ctl.update();
  s.runtime.lastInteraction = performance.now(); s.runtime.invalidate();
};
window.__lerp = (a, b, k) => a + (b - a) * k;
window.__ease = (k) => k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
window.__L = () => window.__sp.runtime.model.layout;
`;

/** Tomas: setup (string JS), frames, cam (función (i,n) en la página), clean (sin UI), actions {frame: js} */
const SHOTS = {
  orbit: {
    frames: 120,
    setup: "",
    cam: `(i,n)=>{const k=__ease(i/(n-1)); const a=__lerp(0.35,1.45,k); const r=__lerp(10.5,8.6,k); __cam([Math.sin(a)*r, __lerp(3.4,2.2,k), Math.cos(a)*r+0.6],[0,0.75,0.2]);}`,
  },
  hero: {
    frames: 90,
    setup: "",
    cam: `(i,n)=>{const k=i/(n-1); const a=__lerp(-0.55,-0.25,k); const r=__lerp(5.2,4.6,k); __cam([Math.sin(a)*r-1.2, __lerp(0.9,1.1,k), Math.cos(a)*r+1.0],[-0.6,0.75,0.2]);}`,
  },
  sow_ground: {
    frames: 120,
    setup: "window.__sp.store.getState().setScene('field');",
    warm: 450,
    warmScale: 25,
    cam: `(i,n)=>{const L=__L(); const x=L.rowX[Math.floor(L.rowX.length/2)]+L.spacing*0.5; const k=i/(n-1); __cam([x+__lerp(0.9,0.35,k), __lerp(0.42,0.55,k), -1.46-__lerp(3.6,5.0,k)],[x-0.25,0.3,-0.2]);}`,
  },
  sow_wide: {
    frames: 90,
    setup: "window.__sp.store.getState().setScene('field');",
    warm: 450,
    warmScale: 25,
    cam: `(i,n)=>{const k=__ease(i/(n-1)); const a=__lerp(2.35,2.9,k); const r=__lerp(16,13,k); __cam([Math.sin(a)*r, __lerp(5.5,3.2,k), Math.cos(a)*r],[0,0.6,1.0]);}`,
  },
  fold: {
    frames: 150,
    setup: "window.__sp.store.getState().select('transport','longitudinal');",
    shotScale: 0.75,
    actions: { 10: "window.__sp.store.getState().setPose('transport')" },
    cam: `(i,n)=>{const k=__ease(i/(n-1)); const a=__lerp(0.7,1.2,k); const r=__lerp(9.5,13.5,k); __cam([Math.sin(a)*r-0.4, __lerp(4.4,5.2,k), Math.cos(a)*r+0.5],[-0.4,0.85,__lerp(0.6,0.9,k)]);}`,
  },
  road: {
    frames: 105,
    setup: "window.__sp.store.getState().setScene('road');",
    warm: 500,
    warmScale: 40,
    cam: `(i,n)=>{const k=i/(n-1); __cam([__lerp(9,6.5,k), __lerp(3.2,2.3,k), __lerp(-11,-4,k)],[ -0.4,1.0,__lerp(3,6,k)]);}`,
  },
  explode: {
    frames: 105,
    setup: "window.__sp.store.getState().setDetail(true);",
    warm: 1500,
    actions: { 20: "window.__sp.store.getState().setExploded(true)" },
    cam: `(i,n)=>{const k=__ease(i/(n-1)); const a=__lerp(0.9,1.5,k); const r=__lerp(3.6,4.6,k); __cam([Math.sin(a)*r, __lerp(1.6,1.9,k), Math.cos(a)*r-0.4],[0,0.55,-0.4]);}`,
  },
  ui_rows: {
    frames: 120,
    clean: false,
    setup: "window.__sp.store.getState().setStep(1);",
    actions: { 15: "document.querySelector('[aria-label=\"Agregar un surco\"]').click()", 35: "document.querySelector('[aria-label=\"Agregar un surco\"]').click()", 55: "document.querySelector('[aria-label=\"Agregar un surco\"]').click()", 78: "[...document.querySelectorAll('.chip')].find(b=>b.textContent.includes('70'))?.click()" },
    cam: `(i,n)=>{const k=i/(n-1); const a=__lerp(0.55,0.75,k); __cam([Math.sin(a)*14, 4.2, Math.cos(a)*14+0.6],[0,0.8,0.4]);}`,
  },
  ui_perf: {
    frames: 75,
    clean: false,
    setup: "window.__sp.store.getState().setPanelTab('perf');",
    actions: { 20: "(()=>{const r=document.getElementById('speed'); const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; set.call(r,'9'); r.dispatchEvent(new Event('input',{bubbles:true}));})()", 45: "[...document.querySelectorAll('.chip')].find(b=>b.textContent.includes('Soja'))?.click()" },
    cam: `(i,n)=>{const k=i/(n-1); const a=__lerp(0.75,0.6,k); __cam([Math.sin(a)*13, 4, Math.cos(a)*13+0.6],[0,0.8,0.4]);}`,
  },
};

const names = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const name of names) {
  const shot = SHOTS[name];
  if (!shot) throw new Error('toma desconocida: ' + name);
  const t0 = Date.now();
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.log(name, 'ERR', e.message));
  await page.clock.install();
  await page.goto('http://localhost:4173/?q=low');
  for (let i = 0; i < 80; i++) {
    await page.clock.runFor(250);
    if (await page.evaluate(() => !!window.__sp?.store.getState().viewerReady)) break;
  }
  if (shot.clean !== false) await page.addStyleTag({ content: CLEAN });
  await page.evaluate(HELPERS);
  await page.evaluate("window.__sp.store.setState({ showHotspots: false, autoFocus: false }); window.__sp.runtime.timeScale = " + TS + ";");
  await page.clock.runFor(1500);
  await page.evaluate(shot.setup || '');
  // precalentamiento acelerado (pocos cuadros de render, mucho tiempo de simulación)
  const ts = await page.evaluate(() => window.__sp.runtime.timeScale);
  if (shot.warmScale) await page.evaluate((k) => (window.__sp.runtime.timeScale = k), shot.warmScale);
  await page.clock.runFor(shot.warm ?? 800);
  await page.evaluate((k) => (window.__sp.runtime.timeScale = k), ts);
  if (shot.shotScale) await page.evaluate((k) => (window.__sp.runtime.timeScale = k), TS * shot.shotScale);
  await page.evaluate(`window.__shotCam = ${shot.cam};`);
  const dir = `${OUT}/${name}`;
  mkdirSync(dir, { recursive: true });
  for (let i = 0; i < shot.frames; i++) {
    if (shot.actions?.[i]) await page.evaluate(shot.actions[i]);
    await page.evaluate(([i, n]) => window.__shotCam(i, n), [i, shot.frames]);
    await page.clock.runFor(STEP);
    await page.screenshot({ path: `${dir}/${String(i).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 92 });
  }
  console.log(name, shot.frames, 'cuadros en', ((Date.now() - t0) / 1000).toFixed(0), 's');
  await page.close();
}
await browser.close();
