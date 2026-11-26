#!/usr/bin/env node
/**
 * Benchmark del visor 3D (Fase 0).
 *
 * Recorre el configurador como lo haría un comprador y mide, por cada acción:
 *   - fps promedio y "1 % más bajo" de los cuadros que dibuja el 3D,
 *   - el cuadro más largo del navegador (requestAnimationFrame: incluye trabas del hilo principal),
 *   - qué pasó en los cuadros de más de 50 ms (shaders compilados, reconstrucción del modelo,
 *     texturas subidas a la GPU, render lento u otro trabajo de JavaScript).
 *
 * Perfiles: escritorio (1920×1080) y celular (375×812, DPR 3, CPU 4× más lenta).
 *
 * Uso (con el build servido en http://localhost:4173 → `npm run build && npm run preview`):
 *   npm run bench                         # los dos perfiles, sin ventana, rasterizador por software
 *   npm run bench -- --gpu --headed       # con la GPU real de la máquina y ventana visible (lo correcto para medir fps)
 *   npm run bench -- --perfil=celular --rapido
 *   npm run bench -- --url=https://configurador-semirremolques.matiascolimodio.workers.dev
 *
 * Resultado: bench/results-<fecha>[-etiqueta].json (y un resumen en la consola).
 */
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const { chromium, devices } = require('playwright');

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v === undefined ? true : v];
  }),
);
const BASE = (args.url || process.env.BASE_URL || 'http://localhost:4173').replace(/\/$/, '');
const USE_GPU = !!args.gpu;
const HEADED = !!args.headed;
const QUICK = !!args.rapido || !!args.quick;
const PROFILE = args.perfil || args.profile || 'ambos';
const LABEL = typeof args.etiqueta === 'string' ? args.etiqueta : typeof args.label === 'string' ? args.label : '';
const LONG_MS = 50;
/**
 * Modo "proxy" (sin GPU): dibuja a 1/4 de resolución para que el rasterizador por software
 * no tape todo. Sirve para ver los picos que vienen de la CPU (shaders, reconstrucciones,
 * texturas, JavaScript), que no dependen de la placa de video. Los fps NO son representativos.
 */
const PROXY = !!args.proxy;
const PAUSE_MS = PROXY ? 1500 : 250;

const SW_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const GPU_ARGS = ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--disable-frame-rate-limit'];

const PROFILES = {
  escritorio: { name: 'escritorio', context: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 }, cpu: 1 },
  celular: {
    name: 'celular',
    context: { ...devices['iPhone X'], viewport: { width: 375, height: 812 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
    cpu: 4,
  },
};

const TIPOS = QUICK ? ['tolva', 'furgon'] : ['tolva', 'batea', 'plataforma', 'furgon'];
const PASOS = ['tipo', 'dimensiones', 'rodado', 'especificos', 'accesorios', 'personalizacion'];
const OPCIONES_POR_PASO = QUICK ? 1 : 3;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------------------------------------------------------- medición en la página */

function initScript() {
  window.__benchRec = true;
  window.__raf = [];
  let last = 0;
  const loop = (t) => {
    if (last) window.__raf.push([t, t - last]);
    last = t;
    if (window.__raf.length > 60000) window.__raf.splice(0, 20000);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  window.__lt = [];
  try {
    new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push([e.startTime, e.duration]))).observe({ type: 'longtask', buffered: true });
  } catch {
    /* sin soporte de longtask */
  }
}

/** Marca el comienzo de una acción: descarta lo medido antes. */
async function mark(page) {
  return page.evaluate(() => {
    window.__frameStats?.take();
    window.__raf.length = 0;
    window.__lt.length = 0;
    return performance.now();
  });
}

/** Espera a que el 3D deje de dibujar (o a que pase el tiempo máximo). */
async function settle(page, { min = 400, max = 12000, quiet = 700 } = {}) {
  const t0 = Date.now();
  await sleep(min);
  let last = -1;
  let since = Date.now();
  while (Date.now() - t0 < max) {
    const s = await page.evaluate(() => ({ f: window.__viewer?.stats().frames ?? 0, loading: !!window.__store?.getState().ui.cargandoEntorno }));
    if (s.f !== last || s.loading) {
      last = s.f;
      since = Date.now();
    } else if (Date.now() - since >= quiet) return Date.now() - t0;
    await sleep(120);
  }
  return Date.now() - t0;
}

/** Junta lo medido desde `mark` y lo resume. */
async function collect(page, label, extra = {}) {
  const raw = await page.evaluate(() => ({ frames: window.__frameStats?.take() ?? [], raf: window.__raf.splice(0), lt: window.__lt.splice(0) }));
  return summarize(label, raw, extra);
}

function percentile(arr, p) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

function summarize(label, { frames, raf, lt }, extra) {
  const intervals = [];
  for (let i = 1; i < frames.length; i++) {
    const dt = frames[i].t - frames[i - 1].t;
    if (dt < PAUSE_MS) intervals.push(dt); // ráfaga continua (con render a demanda las pausas no cuentan)
  }
  const sum = intervals.reduce((a, b) => a + b, 0);
  const fpsAvg = intervals.length >= 3 ? (intervals.length * 1000) / sum : null;
  const p99 = percentile(intervals, 99);
  const fpsP1 = intervals.length >= 3 && p99 ? 1000 / p99 : null;
  const maxRaf = raf.reduce((m, [, dt]) => Math.max(m, dt), 0);
  const maxRender = frames.reduce((m, f) => Math.max(m, f.renderMs), 0);
  const first = frames[0];
  const lastF = frames[frames.length - 1];
  const delta = first && lastF ? { programas: lastF.programs - first.programs, texturas: lastF.textures - first.textures, geometrias: lastF.geometries - first.geometries, reconstrucciones: lastF.builds - first.builds, reconstruccionMs: +(lastF.buildMs - first.buildMs).toFixed(1) } : null;

  // Causas de los cuadros largos.
  const largos = [];
  for (const [t, dt] of raf) {
    if (dt <= LONG_MS) continue;
    const start = t - dt;
    const inGap = frames.filter((f) => f.t >= start - 1 && f.t <= t + 1);
    const before = [...frames].reverse().find((f) => f.t < start - 1) || inGap[0];
    const after = inGap[inGap.length - 1] || before;
    const causas = [];
    if (before && after) {
      if (after.programs > before.programs) causas.push(`compilación de ${after.programs - before.programs} shader(s)`);
      if (after.builds > before.builds) causas.push(`reconstrucción del modelo (${(after.buildMs - before.buildMs).toFixed(0)} ms)`);
      if (after.textures > before.textures) causas.push(`subida de ${after.textures - before.textures} textura(s)`);
      if (after.geometries > before.geometries + 2 && after.builds === before.builds) causas.push(`creación de ${after.geometries - before.geometries} geometría(s)`);
    }
    const renderMs = inGap.reduce((m, f) => Math.max(m, f.renderMs), 0);
    if (renderMs > LONG_MS * 0.6) causas.push(`render lento (${renderMs.toFixed(0)} ms de CPU en renderer.render)`);
    const longTask = lt.filter(([s, d]) => s < t && s + d > start).reduce((m, [, d]) => Math.max(m, d), 0);
    if (!causas.length) causas.push(longTask > 0 ? `JavaScript del hilo principal (tarea larga de ${longTask.toFixed(0)} ms)` : 'espera de la GPU / compositor');
    largos.push({ ms: +dt.toFixed(1), causas });
  }
  const round = (v, d = 1) => (v === null || v === undefined ? null : +v.toFixed(d));
  return {
    accion: label,
    cuadros3d: frames.length,
    fpsPromedio: round(fpsAvg),
    fps1PorCiento: round(fpsP1),
    cuadroMaxMs: round(maxRaf),
    renderCpuMaxMs: round(maxRender),
    cuadrosMayores50: largos.length,
    largos: largos.slice(0, 12),
    tareasLargas: lt.length,
    tareaLargaMaxMs: round(lt.reduce((m, [, d]) => Math.max(m, d), 0)),
    drawCalls: lastF ? lastF.calls : null,
    triangulos: lastF ? lastF.triangles : null,
    delta,
    ...extra,
  };
}

/* ---------------------------------------------------------------- acciones */

async function step(page, results, label, fn, settleOpts) {
  await mark(page);
  const t0 = Date.now();
  try {
    await fn();
  } catch (e) {
    // Una acción que falla queda registrada y el recorrido sigue.
    results.push({ accion: label, error: String(e).split('\n')[0].slice(0, 200) });
    console.log(`  ✗ ${label}: ${String(e).split('\n')[0].slice(0, 120)}`);
    await settle(page, { min: 200, max: 4000 });
    return null;
  }
  const waited = await settle(page, settleOpts);
  const r = await collect(page, label, { duracionMs: Date.now() - t0, esperaMs: waited });
  results.push(r);
  const flag = r.cuadroMaxMs > LONG_MS ? '⚠' : ' ';
  console.log(`  ${flag} ${label.padEnd(44)} fps ${String(r.fpsPromedio ?? '–').padStart(5)} · 1% ${String(r.fps1PorCiento ?? '–').padStart(5)} · máx ${String(r.cuadroMaxMs).padStart(6)} ms${r.largos.length ? ' · ' + r.largos[0].causas.join(', ') : ''}`);
  return r;
}

/** Elige hasta `n` cambios distintos en el paso visible (opciones, interruptores, cantidades, sliders, colores). */
async function pickChanges(page, n) {
  return page.evaluate((n) => {
    const out = [];
    const used = new Set();
    const body = document.querySelector('.steps-body') || document;
    for (const el of body.querySelectorAll('input[type="range"]')) {
      if (out.length >= n) break;
      const id = el.getAttribute('aria-label') || 'slider';
      if (used.has(id)) continue;
      used.add(id);
      const up = Number(el.value) + Number(el.step) <= Number(el.max);
      out.push({ kind: 'range', label: `medida ${id} ${up ? '+' : '−'}`, index: [...body.querySelectorAll('input[type="range"]')].indexOf(el), key: up ? 'ArrowRight' : 'ArrowLeft' });
    }
    for (const el of body.querySelectorAll('button[data-opt*=":"]')) {
      if (out.length >= n) break;
      const [g, v] = el.getAttribute('data-opt').split(':');
      if (used.has(g) || el.getAttribute('aria-disabled') === 'true' || el.getAttribute('aria-checked') === 'true' || el.classList.contains('is-on')) continue;
      used.add(g);
      out.push({ kind: 'click', label: `${g}=${v}`, selector: `[data-opt="${g}:${v}"]` });
    }
    for (const row of body.querySelectorAll('.row-option[data-opt]')) {
      if (out.length >= n) break;
      const g = row.getAttribute('data-opt');
      if (used.has(g) || row.classList.contains('is-disabled')) continue;
      const btn = [...row.querySelectorAll('button[role="switch"], input[type="checkbox"], button')].find((b) => !b.disabled && b.getAttribute('aria-disabled') !== 'true');
      if (!btn) continue;
      used.add(g);
      const all = [...body.querySelectorAll('.row-option[data-opt]')];
      out.push({ kind: 'row', label: `${g} (interruptor/cantidad)`, index: all.indexOf(row) });
    }
    const rals = [...body.querySelectorAll('button[data-ral]:not(.is-on)')];
    for (let i = 0; out.length < n && i < rals.length; i += 7) out.push({ kind: 'click', label: `color ${rals[i].getAttribute('data-ral')}`, selector: `button[data-ral="${rals[i].getAttribute('data-ral')}"]:not(.is-on)` });
    return out.slice(0, n);
  }, n);
}

async function doChange(page, c) {
  if (c.kind === 'range') {
    const el = page.locator('.steps-body input[type="range"]').nth(c.index);
    await el.focus();
    await page.keyboard.press(c.key);
  } else if (c.kind === 'row') {
    const row = page.locator('.steps-body .row-option[data-opt]').nth(c.index);
    const sw = row.locator('button[role="switch"], input[type="checkbox"]');
    if (await sw.count()) await sw.first().click({ force: true });
    else {
      // Cantidad: el primer botón habilitado (sumar o restar).
      const btns = row.locator('button:not([disabled])');
      if (await btns.count()) await btns.last().click({ timeout: 5000 });
    }
  } else {
    await page.locator(c.selector).first().click({ timeout: 5000 });
  }
}

async function orbit(page, ms = 3000) {
  const box = await page.locator('.viewer canvas[data-engine]').boundingBox();
  const cx = box.x + box.width * 0.5;
  const cy = box.y + box.height * 0.55;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  const t0 = Date.now();
  let i = 0;
  while (Date.now() - t0 < ms) {
    i++;
    await page.mouse.move(cx + Math.sin(i / 9) * box.width * 0.22, cy + Math.cos(i / 13) * 18, { steps: 2 });
    await sleep(16);
  }
  await page.mouse.up();
}

async function setScene(page, id) {
  const sel = `[data-testid="tb-${id}"]`;
  if (!(await page.locator(sel).count())) return false;
  await page.locator(sel).click();
  await page.waitForFunction((id) => window.__store.getState().ui.env === id && !window.__store.getState().ui.cargandoEntorno, id, { timeout: 120000 }).catch(() => undefined);
  return true;
}

async function verEnAccion(page, results, label) {
  await step(page, results, `${label}: Ver en acción`, async () => {
    await page.locator('[data-testid="tb-accion"]').click();
    await page.waitForFunction(() => (window.__store.getState().anim.accion ?? 0) > 0.5, null, { timeout: 30000 }).catch(() => undefined);
  }, { min: 1500, max: 20000 });
  await step(page, results, `${label}: volver a cerrar`, async () => {
    await page.locator('[data-testid="tb-accion"]').click();
  }, { min: 1500, max: 20000 });
}

/* ---------------------------------------------------------------- recorrido */

async function runProfile(browser, prof) {
  console.log(`\n▶ Perfil ${prof.name}${prof.cpu > 1 ? ` (CPU ${prof.cpu}× más lenta)` : ''}`);
  const context = await browser.newContext({ ...prof.context, ...(PROXY ? { deviceScaleFactor: prof.name === 'celular' ? 0.5 : 0.25 } : {}) });
  await context.addInitScript(initScript);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 300)));
  if (prof.cpu > 1) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: prof.cpu });
  }
  const results = [];
  const t0 = Date.now();
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__store && window.__store.getState().ready, null, { timeout: 300000 });
  const carga = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const res = performance.getEntriesByType('resource');
    const bytes = res.reduce((s, r) => s + (r.transferSize || 0), 0) + (nav?.transferSize || 0);
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    return {
      primerCuadroConModeloMs: Math.round(window.__readyAt ?? 0),
      domContentLoadedMs: Math.round(nav?.domContentLoadedEventEnd ?? 0),
      transferidoKB: Math.round(bytes / 1024),
      pedidos: res.length + 1,
      gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl ? gl.getParameter(gl.RENDERER) : 'sin WebGL2',
    };
  });
  console.log(`  carga: primer cuadro con el modelo a los ${carga.primerCuadroConModeloMs} ms · ${carga.transferidoKB} KB · GPU: ${carga.gpu}`);
  // La precarga en segundo plano (shaders, Exterior, Ruta) no es parte de ninguna acción: se espera a que termine.
  await page.waitForFunction(() => window.__precargaLista != null, null, { timeout: 240000 }).catch(() => undefined);
  carga.precargaMs = await page.evaluate(() => (window.__precargaLista != null ? Math.round(window.__precargaLista) : null));
  carga.transferidoConPrecargaKB = await page.evaluate(() => Math.round((performance.getEntriesByType('resource').reduce((s, r) => s + (r.transferSize || 0), 0) + (performance.getEntriesByType('navigation')[0]?.transferSize || 0)) / 1024));
  console.log(`  precarga en segundo plano terminada a los ${carga.precargaMs ?? '–'} ms · ${carga.transferidoConPrecargaKB} KB en total`);
  await settle(page, { min: 1500, max: 15000 });

  await step(page, results, 'estudio: órbita de cámara 3 s', () => orbit(page));

  for (const tipo of TIPOS) {
    await page.locator('[data-paso="tipo"]').click();
    await settle(page);
    await step(page, results, `tipo → ${tipo}`, () => page.locator(`[data-tipo="${tipo}"]`).click());
    if (tipo === 'furgon') {
      await page.locator('[data-paso="especificos"]').click();
      await settle(page);
      await step(page, results, 'furgon: variante sider', () => page.locator('[data-opt="variante:sider"]').click());
    }
    for (const paso of PASOS.slice(1)) {
      await step(page, results, `${tipo}: paso ${paso}`, () => page.locator(`[data-paso="${paso}"]`).click());
      const cambios = await pickChanges(page, OPCIONES_POR_PASO);
      for (const c of cambios) await step(page, results, `${tipo}/${paso}: ${c.label}`, () => doChange(page, c));
    }
    await verEnAccion(page, results, `${tipo} estudio`);
    if (await setScene(page, 'exterior')) {
      await settle(page, { min: 800 });
      await verEnAccion(page, results, `${tipo} exterior`);
      await setScene(page, 'estudio');
      await settle(page);
    }
  }

  // Cambios de escena: Estudio → Exterior → Ruta → Estudio.
  for (const id of ['exterior', 'ruta', 'estudio']) {
    let ok = true;
    await step(page, results, `escena → ${id}`, async () => {
      ok = await setScene(page, id);
    }, { min: 800, max: 30000 });
    if (!ok) results[results.length - 1].omitida = `la escena "${id}" todavía no existe`;
    else if (id !== 'estudio') await step(page, results, `${id}: órbita de cámara 3 s`, () => orbit(page));
  }

  // Ruta: circular, frenar y abrir, cerrar y arrancar, seguir circulando.
  if (await setScene(page, 'ruta')) {
    await settle(page, { min: 800, max: 4000 });
    await step(page, results, 'ruta: 20 s circulando', () => sleep(20000), { min: 0, max: 1, quiet: 0 });
    await step(page, results, 'ruta: Ver en acción (frena + abre)', async () => {
      await page.locator('[data-testid="tb-accion"]').click();
      await page.waitForFunction(() => (window.__vehicle?.state ?? '') === 'ABIERTO', null, { timeout: 60000 }).catch(() => undefined);
    }, { min: 0, max: 1, quiet: 0 });
    await step(page, results, 'ruta: volver a cerrar (cierra + arranca)', async () => {
      await page.locator('[data-testid="tb-accion"]').click();
      await page.waitForFunction(() => (window.__vehicle?.state ?? '') === 'CIRCULANDO', null, { timeout: 60000 }).catch(() => undefined);
    }, { min: 0, max: 1, quiet: 0 });
    await step(page, results, 'ruta: 10 s circulando', () => sleep(10000), { min: 0, max: 1, quiet: 0 });
    await setScene(page, 'estudio');
  } else {
    results.push({ accion: 'ruta: circular / frenar / abrir / cerrar / arrancar', omitida: 'la escena Ruta todavía no existe (Fase 3-4)' });
  }

  const medidas = results.filter((r) => !r.omitida && !r.error);
  const resumen = {
    acciones: medidas.length,
    cuadroMaxMs: Math.max(...medidas.map((r) => r.cuadroMaxMs || 0)),
    accionesConCuadrosMayores50: medidas.filter((r) => r.cuadrosMayores50 > 0).length,
    cuadrosMayores50: medidas.reduce((s, r) => s + r.cuadrosMayores50, 0),
    fpsOrbitaEstudio: medidas.find((r) => r.accion.startsWith('estudio: órbita'))?.fpsPromedio ?? null,
    fpsOrbitaExterior: medidas.find((r) => r.accion.startsWith('exterior: órbita'))?.fpsPromedio ?? null,
    causas: tally(medidas),
    drawCallsMax: Math.max(...medidas.map((r) => r.drawCalls || 0)),
    triangulosMax: Math.max(...medidas.map((r) => r.triangulos || 0)),
    erroresConsola: errors.slice(0, 10),
    duracionS: Math.round((Date.now() - t0) / 1000),
  };
  await context.close();
  return { perfil: prof.name, cpu: prof.cpu, viewport: prof.context.viewport, dpr: prof.context.deviceScaleFactor, carga, resumen, acciones: results };
}

function tally(results) {
  const out = {};
  for (const r of results) for (const l of r.largos || []) for (const c of l.causas) {
    const k = c.replace(/\d+(\.\d+)?/g, 'N');
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

(async () => {
  const browser = await chromium.launch({ headless: !HEADED, args: USE_GPU ? GPU_ARGS : SW_ARGS });
  const meta = {
    fecha: new Date().toISOString(),
    url: BASE,
    modo: USE_GPU ? 'GPU real' : `rasterizador por software (SwiftShader)${PROXY ? ' a resolución reducida (proxy)' : ''}: sirve para detectar trabas de CPU, no para medir fps reales`,
    ventana: HEADED ? 'visible' : 'sin ventana',
    rapido: QUICK,
    commit: (() => {
      try {
        return execSync('git rev-parse --short HEAD', { cwd: __dirname }).toString().trim();
      } catch {
        return null;
      }
    })(),
    navegador: browser.version(),
  };
  console.log(`Benchmark · ${BASE} · ${meta.modo}`);
  const perfiles = PROFILE === 'ambos' ? ['escritorio', 'celular'] : [PROFILE];
  const out = { meta, perfiles: {} };
  for (const p of perfiles) out.perfiles[p] = await runProfile(browser, PROFILES[p]);
  await browser.close();
  const day = meta.fecha.slice(0, 10);
  const file = path.join(__dirname, `results-${day}${LABEL ? '-' + LABEL : ''}.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 2) + '\n');
  console.log('\nResumen');
  for (const [k, v] of Object.entries(out.perfiles)) {
    console.log(`  ${k}: primer cuadro ${v.carga.primerCuadroConModeloMs} ms · cuadro máx ${v.resumen.cuadroMaxMs} ms · ${v.resumen.cuadrosMayores50} cuadros >50 ms en ${v.resumen.accionesConCuadrosMayores50}/${v.resumen.acciones} acciones · órbita estudio ${v.resumen.fpsOrbitaEstudio ?? '–'} fps`);
    for (const [c, n] of Object.entries(v.resumen.causas).sort((a, b) => b[1] - a[1]).slice(0, 6)) console.log(`      ${String(n).padStart(4)} × ${c}`);
  }
  console.log(`\nGuardado en ${path.relative(process.cwd(), file)}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
