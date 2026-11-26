/**
 * Imágenes de espera calzadas con la cámara inicial del visor.
 * Para cada tipo (configuración sugerida) y cada formato (escritorio 1440×900 y
 * celular iPhone 13) captura el lienzo 3D con la cámara de arranque y guarda:
 *   public/loading/<tipo>-<d|m>.jpg   (la imagen)
 *   src/ui/loadingPoses.json           (cámara y relación de aspecto de cada imagen)
 * Uso: npm run build && npm run preview, y en otra terminal: npm run e2e espera
 */
const path = require('node:path');
const fs = require('node:fs');
const { launch, openApp, setUi, sleep, settle, Report } = require('./lib.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT_IMG = path.join(ROOT, 'public', 'loading');
const OUT_JSON = path.join(ROOT, 'src', 'ui', 'loadingPoses.json');
const TIPOS = ['tolva', 'batea', 'plataforma', 'furgon'];

async function run() {
  const report = new Report('espera');
  fs.mkdirSync(OUT_IMG, { recursive: true });
  const poses = {};
  const browser = await launch();
  for (const [variant, mobile, scale] of [['d', false, 1.25], ['m', true, 2]]) {
    const { page, errors } = await openApp(browser, { mobile });
    await setUi(page, { autoFoco: false, hotspots: false });
    for (const tipo of TIPOS) {
      await page.evaluate((t) => {
        const s = window.__store.getState();
        s.setTipo(t);
        window.__store.setState({ notices: [] });
      }, tipo);
      await sleep(600);
      await page.evaluate(() => window.__store.getState().setPreset('tresCuartos'));
      // Texturas KTX2 cargadas y cámara quieta.
      await sleep(2500);
      await settle(page, 9000);
      const size = await page.evaluate(() => {
        const c = document.querySelector('.viewer canvas');
        const r = c.getBoundingClientRect();
        return { w: r.width, h: r.height };
      });
      const W = Math.round(size.w * scale);
      const H = Math.round(size.h * scale);
      const url = await page.evaluate(({ W, H }) => window.__captura({ width: W, height: H, type: 'image/jpeg', quality: 0.8 }), { W, H });
      const cam = await page.evaluate(() => window.__viewer.camera());
      const file = path.join(OUT_IMG, `${tipo}-${variant}.jpg`);
      fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
      poses[tipo] = poses[tipo] || {};
      poses[tipo][variant] = { aspect: +(size.w / size.h).toFixed(4), position: cam.position.map((v) => +v.toFixed(4)), target: cam.target.map((v) => +v.toFixed(4)) };
      report.ok(`imagen ${tipo}-${variant}.jpg`, true, `${W}×${H} · ${Math.round(fs.statSync(file).size / 1024)} KB`);
    }
    report.ok(`sin errores de consola (${variant})`, errors.length === 0, errors.slice(0, 2).join(' | '));
    await page.context().close();
  }
  fs.writeFileSync(OUT_JSON, JSON.stringify(poses, null, 2) + '\n');
  await browser.close();
  report.save();
  return report;
}

module.exports = { run };
if (require.main === module) run().then((r) => process.exit(r.failed ? 1 : 0));
