const L = require('./lib3d.cjs');
const RAW = __dirname + '/raw';
const only = process.argv[2] ? process.argv[2].split(',') : null;
const pad = (i) => String(i).padStart(4, '0');
const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

function sph(p, t) {
  const o = [p[0] - t[0], p[1] - t[1], p[2] - t[2]];
  const r = Math.hypot(...o);
  return { r, az: Math.atan2(o[2], o[0]), el: Math.asin(o[1] / r) };
}
function pos(t, r, az, el) {
  return [t[0] + r * Math.cos(el) * Math.cos(az), t[1] + r * Math.sin(el), t[2] + r * Math.cos(el) * Math.sin(az)];
}

/** Arma la configuración en una pestaña aparte y devuelve el link (?c=...) para abrirla limpia. */
async function cfgQuery(query, fn, arg) {
  const b = await L.chromium.launch({ args: L.ARGS });
  const { page } = await L.open(b, query, { ui: true });
  await page.evaluate(new Function('arg', `const s = window.__store.getState(); return (${fn})(s, arg);`), arg);
  await page.waitForTimeout(1800);
  const q = await page.evaluate(() => location.search);
  await b.close();
  return q;
}

/** Abre la app, prepara el estado con el render normal, encuadra y pasa a modo manual. */
async function scene(_b, query, prep) {
  // Un navegador nuevo por escena: SwiftShader se queda sin contextos WebGL si se reutiliza.
  const b = await L.chromium.launch({ args: L.ARGS });
  const opened = await L.open(b, query);
  const page = opened.page;
  const ctx = { close: () => b.close() };
  if (prep) await prep(page);
  // Con cambios de color/variante hay que esperar a que termine la transición antes del modo manual.
  await page.waitForTimeout(prep ? 12000 : 2500);
  const c = await L.getCam(page);
  c.zoom = 0.66;
  await L.manual(page);
  await L.warm(page, 14);
  return { ctx, page, c };
}

const SHOTS = {
  // 1. Héroe: giro alrededor de la tolva.
  async hero(b) {
    const { ctx, page, c } = await scene(b, '?tipo=tolva');
    const s = sph(c.position, c.target); s.r *= c.zoom;
    const N = 120;
    for (let i = 0; i < N; i++) {
      const k = ease(i / (N - 1));
      await L.cam(page, pos(c.target, s.r * (1.18 - 0.26 * k), s.az + 0.65 - 0.95 * k, s.el - 0.08 + 0.1 * k), c.target);
      await L.step(page);
      await L.shot(page, `${RAW}/hero/${pad(i)}.jpg`);
    }
    await ctx.close();
  },
  // 2. Los cuatro tipos (cuadro fijo, cada uno con su color).
  async tipos(b) {
    const list = [['tolva', 'RAL 3020'], ['batea', 'RAL 5010'], ['plataforma', 'RAL 1023'], ['furgon', 'RAL 9010']];
    for (const [tipo, color] of list) {
      const solo = only && only.find((x) => x.startsWith('solo-'));
      if (solo && solo !== `solo-${tipo}`) continue;
      const q = await cfgQuery(`?tipo=${tipo}`, (s, a) => s.setColor('caja', a), color);
      const { ctx, page, c } = await scene(b, q);
      const s = sph(c.position, c.target); s.r *= c.zoom;
      for (let i = 0; i < 24; i++) {
        const k = i / 23;
        const zf = tipo === 'furgon' ? 1.3 : tipo === 'plataforma' ? 1.1 : 1;
        await L.cam(page, pos(c.target, s.r * zf * (1.04 - 0.08 * k), s.az - 0.12 + 0.12 * k, s.el), c.target);
        await L.step(page);
        await L.shot(page, `${RAW}/tipo-${tipo}/${pad(i)}.jpg`);
      }
      await ctx.close();
    }
  },
  // 3. Batea volcando (vista trasera 3/4, plano abierto).
  async batea(b) {
    const q = await cfgQuery('?tipo=batea', (s) => s.setColor('caja', 'RAL 5010'));
    const { ctx, page, c } = await scene(b, q);
    const s = sph(c.position, c.target);
    await L.st(page, (s) => s.setAnim('accion', 1));
    const tgt = [c.target[0] - 0.6, c.target[1] + 1.2, c.target[2]];
    const N = 84;
    for (let i = 0; i < N; i++) {
      const k = ease(i / (N - 1));
      await L.cam(page, pos(tgt, s.r * (0.86 - 0.08 * k), s.az + Math.PI * 0.52 + 0.22 * k, s.el + 0.02), tgt);
      await L.step(page, 0.05);
      await L.shot(page, `${RAW}/batea/${pad(i)}.jpg`);
    }
    await ctx.close();
  },
  // 4. Sider abriendo puertas y lona.
  async sider(b) {
    const q = await cfgQuery('?tipo=furgon', (s) => { s.setOption('variante', 'sider'); s.setColor('caja', 'RAL 7016'); });
    const { ctx, page, c } = await scene(b, q);
    const s = sph(c.position, c.target); s.r *= c.zoom;
    await L.st(page, (s) => s.setAnim('accion', 1));
    const N = 78;
    for (let i = 0; i < N; i++) {
      const k = ease(i / (N - 1));
      await L.cam(page, pos(c.target, s.r * (1.12 - 0.08 * k), s.az + 0.15 - 0.3 * k, s.el + 0.02), c.target);
      await L.step(page, 0.05);
      await L.shot(page, `${RAW}/sider/${pad(i)}.jpg`);
    }
    await ctx.close();
  },
  // 5. Tolva enrollando la lona (vista alta).
  async lona(b) {
    const { ctx, page, c } = await scene(b, '?tipo=tolva');
    const s = sph(c.position, c.target); s.r *= c.zoom;
    await L.st(page, (s) => s.setAnim('lona', 1));
    const N = 54;
    for (let i = 0; i < N; i++) {
      const k = ease(i / (N - 1));
      await L.cam(page, pos(c.target, s.r * (0.98 - 0.06 * k), s.az - 0.25 + 0.2 * k, s.el + 0.32), c.target);
      await L.step(page, 0.05);
      await L.shot(page, `${RAW}/lona/${pad(i)}.jpg`);
    }
    await ctx.close();
  },
  // 6. Colores RAL (cuadros fijos).
  async colores(b) {
    const { ctx, page, c } = await scene(b, '?tipo=tolva');
    const s = sph(c.position, c.target); s.r *= c.zoom;
    await L.cam(page, pos(c.target, s.r * 0.95, s.az - 0.2, s.el), c.target);
    for (const color of ['RAL 3020', 'RAL 5015', 'RAL 1023', 'RAL 6018', 'RAL 2004', 'RAL 9010', 'RAL 7016', 'RAL 5010']) {
      await L.st(page, (s, a) => s.setColor('caja', a), color);
      for (let i = 0; i < 16; i++) await L.step(page, 0.05);
      await L.shot(page, `${RAW}/colores/${color.replace(' ', '')}.jpg`);
    }
    await ctx.close();
  },
  // 7. Tu marca: color y texto por link; el logo se carga después (no entra en el link).
  async marca(b) {
    const q = await cfgQuery('?tipo=tolva', () => {
      const s = window.__store.getState();
      s.setColor('caja', 'RAL 2004');
      s.setTexto({ valor: 'TU EMPRESA', escala: 0.7, x: 0.5, y: -0.1 });
    });
    const { ctx, page, c } = await scene(b, q, async (p) => {
      await p.evaluate(() => {
        const cv = document.createElement('canvas');
        cv.width = 400; cv.height = 400;
        const g = cv.getContext('2d');
        g.fillStyle = '#ffffff'; g.beginPath(); g.arc(200, 200, 196, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#1b2747'; g.beginPath(); g.arc(200, 200, 178, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = '800 100px Arial, sans-serif'; g.fillText('TU', 200, 150); g.fillText('LOGO', 200, 255);
        window.__store.getState().setLogo({ data: cv.toDataURL('image/png'), escala: 0.7, x: -0.72, y: 0.05 });
      });
    });
    const s = sph(c.position, c.target);
    const N = 60;
    for (let i = 0; i < N; i++) {
      const k = ease(i / (N - 1));
      await L.cam(page, pos(c.target, s.r * (0.98 - 0.1 * k), s.az + 0.55 + 0.12 * k, s.el - 0.12), c.target);
      await L.step(page, 0.05);
      await L.shot(page, `${RAW}/marca/${pad(i)}.jpg`);
    }
    await ctx.close();
  },
  // 8. Exterior con tractor.
  async exterior(b) {
    const { ctx, page, c } = await scene(b, '?tipo=tolva', async (p) => {
      await L.st(p, (s) => s.setUi({ env: 'exterior', tractor: true }));
      await p.waitForFunction(() => !window.__store.getState().ui.cargandoEntorno, null, { timeout: 120000 });
      await p.waitForTimeout(4000);
    });
    const s = sph(c.position, c.target); s.r *= c.zoom;
    const N = 72;
    for (let i = 0; i < N; i++) {
      const k = ease(i / (N - 1));
      await L.cam(page, pos(c.target, s.r * (1.5 - 0.12 * k) , s.az - 0.3 + 0.3 * k, s.el - 0.02), c.target);
      await L.step(page, 0.05);
      await L.shot(page, `${RAW}/exterior/${pad(i)}.jpg`);
    }
    await ctx.close();
  },
};

const { execSync } = require('child_process');
const fsx = require('fs');
/** Lista los cuadros casi negros de una toma (brillo medio < 8). */
function negrosEn(name) {
  const dirs = fsx.readdirSync(RAW).filter((d) => d === name || (name === 'tipos' && d.startsWith('tipo-')));
  const out = [];
  for (const d of dirs) {
    const files = fsx.readdirSync(`${RAW}/${d}`).filter((f) => f.endsWith('.jpg'));
    for (const f of [files[0], files[Math.floor(files.length / 2)], files[files.length - 1]]) {
      const y = parseFloat(execSync(`ffprobe -v error -f lavfi -i "movie=${RAW}/${d}/${f},signalstats" -show_entries frame_tags=lavfi.signalstats.YAVG -of csv=p=0`).toString());
      if (y < 8) out.push(`${d}/${f}`);
    }
  }
  return out;
}

(async () => {
  const b = await L.chromium.launch({ args: L.ARGS });
  for (const [name, fn] of Object.entries(SHOTS)) {
    if (only && !only.includes(name)) continue;
    for (let intento = 1; intento <= 3; intento++) {
      const t0 = Date.now();
      await fn(b);
      const negros = negrosEn(name);
      console.log(`toma ${name}: ${Math.round((Date.now() - t0) / 1000)} s, cuadros negros: ${negros.length}`);
      if (!negros.length) break;
    }
  }
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
