#!/usr/bin/env node
/**
 * Benchmark del configurador (Fase 0).
 *
 *   npm run bench                         # producción, headed (usa la GPU), desktop + celular
 *   npm run bench -- --url http://localhost:4173 --profile desktop
 *   npm run bench -- --headless --label swiftshader   # sin GPU (sólo para comparar tirones/compilaciones)
 *   npm run bench -- --channel chrome     # usar el Chrome instalado en vez del Chromium de Playwright
 *
 * Por acción registra: fps promedio y percentil 1 (de los cuadros de pantalla, rAF), cuadro más largo,
 * cuadros >50 ms, long tasks, cuadros renderizados por three, programas de shader nuevos, geometrías y
 * texturas nuevas, y el tiempo de WebGL por categoría (compilación/link, subida de texturas, buffers).
 * Resultado: bench/results-<fecha>-<etiqueta>.json
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i < 0 ? d : args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
};
const URL_ = opt('url', 'https://surco-configurador.matiascolimodio.workers.dev');
const PROFILE = opt('profile', 'both');
const HEADLESS = !!opt('headless', false);
const LABEL = opt('label', HEADLESS ? 'headless' : 'gpu');
const CHANNEL = opt('channel', undefined);
const SETTLE = Number(opt('settle', 2500));
const ONLY = opt('only', 'all'); // all | steps | scenes

/** Se inyecta antes de que cargue la página: medición de cuadros + instrumentación de WebGL. */
const PROBE = () => {
  const B = (window.__bench = { frames: [], long: [], gl: {}, t0: performance.now(), firstModelAt: null });
  let last = performance.now();
  const loop = (now) => {
    B.frames.push([now, now - last]);
    last = now;
    if (B.firstModelAt === null && window.__sp?.runtime?.model && window.__sp.store.getState().viewerReady) B.firstModelAt = now;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  try {
    new PerformanceObserver((l) => l.getEntries().forEach((e) => B.long.push([e.startTime, e.duration]))).observe({ type: 'longtask', buffered: true });
  } catch {}
  const cats = {
    compile: ['compileShader', 'linkProgram', 'getProgramParameter', 'getShaderParameter', 'getProgramInfoLog', 'getShaderInfoLog', 'getActiveUniform', 'getActiveAttrib', 'getUniformLocation'],
    texture: ['texImage2D', 'texSubImage2D', 'texImage3D', 'texSubImage3D', 'texStorage2D', 'compressedTexImage2D', 'compressedTexSubImage2D', 'generateMipmap'],
    buffer: ['bufferData', 'bufferSubData'],
    draw: ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced'],
    readback: ['readPixels', 'getError'],
  };
  for (const Ctx of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) {
    if (!Ctx) continue;
    for (const [cat, names] of Object.entries(cats)) {
      for (const n of names) {
        const orig = Ctx.prototype[n];
        if (!orig || orig.__benched) continue;
        const wrapped = function (...a) {
          const t = performance.now();
          try {
            return orig.apply(this, a);
          } finally {
            const g = (B.gl[cat] ||= { ms: 0, calls: 0 });
            g.ms += performance.now() - t;
            g.calls++;
          }
        };
        wrapped.__benched = true;
        Ctx.prototype[n] = wrapped;
      }
    }
  }
};

async function snapshot(page) {
  return page.evaluate(() => {
    const B = window.__bench;
    const sp = window.__sp;
    const gl = sp?.gl;
    return {
      now: performance.now(),
      nFrames: B.frames.length,
      nLong: B.long.length,
      gl: JSON.parse(JSON.stringify(B.gl)),
      rendered: sp?.runtime?.frames ?? 0,
      rebuildMs: sp?.runtime?.lastRebuildMs ?? 0,
      programs: gl?.info?.programs?.length ?? 0,
      geometries: gl?.info?.memory?.geometries ?? 0,
      textures: gl?.info?.memory?.textures ?? 0,
    };
  });
}

function pct(arr, p) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

async function measure(page, name, fn, settle = SETTLE) {
  const a = await snapshot(page);
  await fn();
  await page.waitForTimeout(settle);
  const b = await snapshot(page);
  const data = await page.evaluate(([f0, f1, l0, l1]) => ({ frames: window.__bench.frames.slice(f0, f1).map((x) => x[1]), long: window.__bench.long.slice(l0, l1).map((x) => x[1]) }), [a.nFrames, b.nFrames, a.nLong, b.nLong]);
  const d = data.frames;
  const dur = (b.now - a.now) / 1000;
  const glDelta = {};
  for (const k of Object.keys(b.gl)) glDelta[k] = { ms: +(b.gl[k].ms - (a.gl[k]?.ms ?? 0)).toFixed(1), calls: b.gl[k].calls - (a.gl[k]?.calls ?? 0) };
  const r = {
    action: name,
    seconds: +dur.toFixed(2),
    fpsAvg: +(d.length / dur).toFixed(1),
    fpsP1: d.length ? +(1000 / pct(d, 99)).toFixed(1) : 0,
    maxFrameMs: +Math.max(0, ...d).toFixed(1),
    framesOver50ms: d.filter((x) => x > 50).length,
    longTasks: data.long.length,
    longestTaskMs: +Math.max(0, ...data.long).toFixed(1),
    renderedFrames: b.rendered - a.rendered,
    renderedFps: +((b.rendered - a.rendered) / dur).toFixed(1),
    modelRebuildMs: b.rebuildMs !== a.rebuildMs ? +b.rebuildMs.toFixed(1) : 0,
    newPrograms: b.programs - a.programs,
    newGeometries: b.geometries - a.geometries,
    newTextures: b.textures - a.textures,
    gl: glDelta,
  };
  console.log(`  ${name.padEnd(34)} fps ${String(r.fpsAvg).padStart(5)} · p1 ${String(r.fpsP1).padStart(5)} · máx ${String(r.maxFrameMs).padStart(6)} ms · >50ms ${r.framesOver50ms} · prog +${r.newPrograms} · compile ${glDelta.compile?.ms ?? 0} ms · tex ${glDelta.texture?.ms ?? 0} ms · rebuild ${r.modelRebuildMs} ms`);
  return r;
}

async function clickNth(page, selector, n = 0) {
  const els = await page.$$(selector);
  if (!els[n]) return false;
  await els[n].scrollIntoViewIfNeeded().catch(() => {});
  await els[n].click({ timeout: 10000 }).catch(() => {});
  return true;
}

async function run(profileName) {
  const mobile = profileName === 'mobile';
  const browser = await chromium.launch({
    headless: HEADLESS,
    channel: CHANNEL,
    args: HEADLESS ? [] : ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'],
  });
  const ctx = await browser.newContext(
    mobile
      ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36' }
      : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  );
  await ctx.addInitScript(PROBE);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  if (mobile) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  console.log(`\n[${profileName}] ${URL_}`);
  const t0 = Date.now();
  await page.goto(URL_, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__bench?.firstModelAt !== null, null, { timeout: 300000 });
  const load = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const res = performance.getEntriesByType('resource').filter((r) => r.startTime <= window.__bench.firstModelAt);
    const bytes = res.reduce((s, r) => s + (r.transferSize || 0), 0) + (nav?.transferSize || 0);
    const r = window.__sp.gl;
    const ext = r.getContext().getExtension('WEBGL_debug_renderer_info');
    return {
      firstModelFrameMs: Math.round(window.__bench.firstModelAt),
      transferredBytesUntilModel: bytes,
      requestsUntilModel: res.length + 1,
      gpu: ext ? r.getContext().getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'n/d',
      programsAtLoad: r.info.programs?.length ?? 0,
    };
  });
  console.log(`  primer cuadro con la máquina: ${load.firstModelFrameMs} ms · transferido ${(load.transferredBytesUntilModel / 1048576).toFixed(2)} MB · GPU ${load.gpu}`);
  // esperar la precarga de escenas en segundo plano (si existe), como haría un usuario que mira la máquina
  const warm = await page
    .waitForFunction(() => window.__sp?.runtime?.warmup != null, null, { timeout: 120000 })
    .then(() => page.evaluate(() => window.__sp.runtime.warmup))
    .catch(() => null);
  if (warm) console.log(`  precarga en segundo plano: ${warm.map((w) => `${w.id} ${w.ms} ms (programas ${w.programsBefore}→${w.programsAfter})`).join(' · ')}`);
  load.warmup = warm;
  await page.waitForTimeout(3000);
  const actions = [];
  // 7 pasos × 3 opciones
  const steps = ONLY === 'scenes' ? 0 : (await page.$$('.step-tab')).length;
  const optSel = '.step-body .opt:not(.is-selected):not(.is-disabled), .step-body .model:not(.is-selected), .step-body .chip:not(.is-selected), .step-body .ral:not(.is-selected)';
  for (let i = 0; i < steps; i++) {
    const name = await page.$$eval('.step-tab .step-name', (e, i) => e[i]?.textContent ?? `paso ${i + 1}`, i);
    actions.push(await measure(page, `paso ${i + 1} (${name})`, () => clickNth(page, '.step-tab', i)));
    for (let k = 0; k < 3; k++) {
      actions.push(await measure(page, `  opción ${k + 1} del paso ${i + 1}`, () => clickNth(page, optSel, k)));
    }
  }
  // escenas
  const scene = (n) => () => clickNth(page, '.tb-scenes .tb-btn', n);
  if (ONLY !== 'steps') {
  actions.push(await measure(page, 'Estudio → Campo (siembra)', scene(1), 6000));
  actions.push(await measure(page, 'Campo → Ruta (plegado + andar)', scene(2), 8000));
  actions.push(await measure(page, 'Ruta → Estudio', scene(0), 5000));
  // al volver de Ruta la máquina queda plegada y "Ver sembrando" está deshabilitado: primero desplegar
  if (await page.$eval('.tb-primary', (b) => b.disabled).catch(() => false)) {
    actions.push(await measure(page, 'Desplegar (posición de trabajo)', () => page.$eval('.tb-primary', (b) => b.nextElementSibling?.click()), 6000));
  }
  actions.push(await measure(page, 'Ver sembrando', () => clickNth(page, '.tb-primary'), 8000));
  actions.push(await measure(page, 'Detener', () => clickNth(page, '.tb-primary'), 3000));
  }
  const worst = actions.reduce((m, a) => (a.maxFrameMs > m.maxFrameMs ? a : m), actions[0]);
  const summary = {
    maxFrameMs: worst.maxFrameMs,
    worstAction: worst.action,
    actionsWithFramesOver50ms: actions.filter((a) => a.framesOver50ms > 0).map((a) => a.action.trim()),
    totalNewPrograms: actions.reduce((s, a) => s + a.newPrograms, 0),
  };
  const drawStats = await page.evaluate(() => {
    const gl = window.__sp.gl;
    gl.info.autoReset = false;
    gl.info.reset();
    return new Promise((res) => {
      window.__sp.runtime.invalidate();
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const r = { calls: gl.info.render.calls, triangles: gl.info.render.triangles };
        gl.info.autoReset = true;
        res(r);
      }));
    });
  });
  console.log(`  peor acción: ${summary.worstAction} (${summary.maxFrameMs} ms)`);
  await browser.close();
  return { profile: profileName, cpuThrottle: mobile ? 4 : 1, load, summary, drawStatsLastFrame: drawStats, actions };
}

const profiles = PROFILE === 'both' ? ['desktop', 'mobile'] : [PROFILE];
const out = { date: new Date().toISOString(), url: URL_, label: LABEL, headless: HEADLESS, runs: [] };
for (const p of profiles) out.runs.push(await run(p));
const here = dirname(fileURLToPath(import.meta.url));
mkdirSync(here, { recursive: true });
const stamp = out.date.slice(0, 16).replace(/[:T]/g, '-');
const file = join(here, `results-${stamp}-${LABEL}.json`);
writeFileSync(file, JSON.stringify(out, null, 2));
console.log(`\nResultados: ${file}`);
