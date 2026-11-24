/**
 * Rendimiento y memoria:
 *  - tiempo hasta el primer cuadro interactivo,
 *  - fps aproximados rotando la cámara y durante la animación "Ver en acción",
 *  - prueba de estrés: 200 cambios de opción seguidos sin fuga de geometrías/texturas.
 *
 * OJO: en un servidor sin GPU Chromium dibuja por software (SwiftShader); esos fps
 * NO representan una notebook ni un celular. Para medir en hardware real:
 *   E2E_GPU=1 BASE_URL=http://localhost:4173 node tests/e2e/rendimiento.cjs
 */
const { launch, openApp, sleep, settle, setUi, Report } = require('./lib.cjs');

const CAMBIOS = [
  ['ejes', 'tridem'],
  ['suspension', 'neumatica'],
  ['ruedas', 'single'],
  ['llantas', 'aluminio'],
  ['largo', 11],
  ['alto', 2.3],
  ['cajon', 0],
  ['ejes', '1+1+1'],
  ['portaauxilio', 2],
  ['ruedas', 'duales'],
  ['suspension', 'mecanica'],
  ['llantas', 'acero'],
  ['largo', 10],
  ['alto', 2.1],
  ['cajon', 1],
  ['portaauxilio', 1],
  ['lucesLed', true],
  ['faldones', true],
  ['lucesLed', false],
  ['faldones', false],
];
const TIPOS = ['tolva', 'batea', 'plataforma', 'furgon'];

async function fpsDuring(page, action, ms) {
  const a = await page.evaluate(() => ({ frames: window.__viewer.stats().frames, t: performance.now() }));
  await action(ms);
  const b = await page.evaluate(() => ({ frames: window.__viewer.stats().frames, t: performance.now() }));
  return Math.round(((b.frames - a.frames) * 1000) / (b.t - a.t) * 10) / 10;
}

async function run() {
  const report = new Report('rendimiento');
  const browser = await launch();

  // --- Tiempo de carga -------------------------------------------------------------
  const first = await openApp(browser, { fast: false });
  const nav = await first.page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0];
    const res = performance.getEntriesByType('resource');
    const js = res.filter((r) => /\.js(\?|$)/.test(r.name));
    return {
      domContentLoaded: Math.round(n.domContentLoadedEventEnd),
      transferKB: Math.round(res.reduce((s, r) => s + (r.transferSize || 0), 0) / 1024),
      jsKB: Math.round(js.reduce((s, r) => s + (r.transferSize || 0), 0) / 1024),
      requests: res.length,
    };
  });
  report.data.carga = { hastaPrimerCuadroMs: first.readyMs, ...nav };
  report.ok('primer cuadro interactivo', first.readyMs > 0, `${first.readyMs} ms (local, render por software), ${nav.transferKB} KB transferidos en ${nav.requests} pedidos`);
  const gpu = await first.page.evaluate(() => {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'desconocido';
  });
  report.data.gpu = gpu;
  console.log(`  · GPU: ${gpu}`);

  // --- FPS ---------------------------------------------------------------------------
  const page = first.page;
  await setUi(page, { autoFoco: false, hotspots: false });
  await settle(page);
  const box = await page.locator('.viewer').boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const rotate = async (ms) => {
    await page.mouse.move(cx - 200, cy);
    await page.mouse.down();
    const t0 = Date.now();
    let i = 0;
    while (Date.now() - t0 < ms) {
      await page.mouse.move(cx - 200 + ((i * 7) % 400), cy + Math.sin(i / 9) * 30);
      i++;
      await sleep(16);
    }
    await page.mouse.up();
  };
  const fpsRot = await fpsDuring(page, rotate, 5000);
  await settle(page);
  const fpsAnim = await fpsDuring(
    page,
    async (ms) => {
      await page.evaluate(() => window.__store.getState().setAnim('accion', 1));
      await sleep(ms);
    },
    3500,
  );
  await page.evaluate(() => { window.__fast = true; window.__store.getState().setAnim('accion', 0); });
  const calidad = await page.evaluate(() => window.__store.getState().ui.calidad);
  const draw = await page.evaluate(() => window.__viewer.stats());
  report.data.fps = { rotando: fpsRot, animacion: fpsAnim, calidadFinal: calidad, drawCalls: draw.calls, triangulos: draw.triangles };
  report.ok('fps rotando la cámara', fpsRot > 0, `${fpsRot} fps (calidad adaptativa: ${calidad})`);
  report.ok('fps durante "Ver en acción"', fpsAnim > 0, `${fpsAnim} fps`);
  console.log(`  · cuadro completo: ${draw.calls} draw calls, ${draw.triangles} triángulos (incluye sombras y postprocesado); modelo: ${draw.modelMeshes} mallas, ${draw.modelTriangles} triángulos`);

  // --- Estrés: 200 cambios de opción -------------------------------------------------------
  await settle(page);
  const mem = () =>
    page.evaluate(() => {
      if (typeof gc === 'function') gc();
      const s = window.__viewer.stats();
      return { geometries: s.geometries, textures: s.textures, programs: s.programs, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null };
    });
  await page.evaluate(() => window.__store.getState().reset());
  await sleep(1200);
  const before = await mem();
  const samples = [before];
  let n = 0;
  for (let round = 0; n < 200; round++) {
    const tipo = TIPOS[round % TIPOS.length];
    await page.evaluate((t) => window.__store.getState().setTipo(t), tipo);
    n++;
    for (const [k, v] of CAMBIOS) {
      if (n >= 200) break;
      await page.evaluate(([key, value]) => window.__store.getState().setOption(key, value), [k, v]);
      // Un cuadro por cambio: se reconstruye el modelo y se libera el anterior.
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      n++;
    }
    if (round % 3 === 2) samples.push(await mem());
  }
  await page.evaluate(() => window.__store.getState().reset());
  await sleep(1500);
  await settle(page);
  const after = await mem();
  report.data.estres = { cambios: n, antes: before, despues: after, muestras: samples };
  console.log(`  · antes:   ${JSON.stringify(before)}`);
  console.log(`  · después: ${JSON.stringify(after)}`);
  const builds = await page.evaluate(() => window.__viewer.stats().buildMs);
  const sorted = [...builds].sort((a, b) => a - b);
  const avg = sorted.reduce((s, v) => s + v, 0) / Math.max(1, sorted.length);
  report.data.reconstruccion = { muestras: sorted.length, promedioMs: Math.round(avg), p95Ms: Math.round(sorted[Math.floor(sorted.length * 0.95)] ?? 0), maxMs: Math.round(sorted[sorted.length - 1] ?? 0) };
  console.log(`  · reconstrucción del modelo: promedio ${Math.round(avg)} ms, p95 ${report.data.reconstruccion.p95Ms} ms, máx ${report.data.reconstruccion.maxMs} ms (${sorted.length} muestras)`);
  report.ok(`estrés: ${n} cambios sin fuga de geometrías`, after.geometries <= before.geometries + 4, `${before.geometries} → ${after.geometries}`);
  report.ok('estrés: sin fuga de texturas', after.textures <= before.textures + 6, `${before.textures} → ${after.textures}`);
  if (before.heapMB !== null) report.ok('estrés: la memoria JS no crece sin control', after.heapMB <= before.heapMB + 60, `${before.heapMB} MB → ${after.heapMB} MB`);
  const stillFine = await page.evaluate(() => window.__store.getState().config.tipo === 'tolva' && !!document.querySelector('.viewer canvas'));
  report.ok('la app sigue respondiendo después del estrés', stillFine);
  report.ok('sin errores de consola', first.errors.length === 0, first.errors.slice(0, 3).join(' | '));

  await browser.close();
  report.save();
  return report;
}

module.exports = { run };
if (require.main === module) run().then((r) => process.exit(r.failed ? 1 : 0));
