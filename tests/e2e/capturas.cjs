/**
 * Capturas de los 4 tipos, en estudio y exterior, en escritorio (1440×900) y
 * celular (iPhone 13 emulado). Quedan en /screenshots para revisarlas a ojo.
 */
const path = require('node:path');
const { launch, openApp, settle, setUi, sleep, SHOTS, Report } = require('./lib.cjs');

const TIPOS = ['tolva', 'batea', 'plataforma', 'furgon'];

async function run() {
  const report = new Report('capturas');
  const browser = await launch();
  for (const mobile of [false, true]) {
    const { page, errors } = await openApp(browser, { mobile });
    await setUi(page, { autoFoco: false });
    for (const tipo of TIPOS) {
      await page.evaluate((t) => { window.__store.getState().setTipo(t); window.__store.setState({ notices: [] }); }, tipo);
      for (const env of ['estudio', 'exterior']) {
        // En exterior el equipo se muestra enganchado al tractor, como en la interfaz.
        await setUi(page, { env, tractor: env === 'exterior' });
        await page.waitForFunction((e) => !window.__store.getState().ui.cargandoEntorno && window.__store.getState().ui.env === e, env, { timeout: 120000 });
        await sleep(1800);
        await settle(page, 9000);
        const file = `${mobile ? 'celular' : 'escritorio'}-${tipo}-${env}.png`;
        await page.screenshot({ path: path.join(SHOTS, file) });
        report.ok(`captura ${file}`, true);
      }
    }
    report.ok(`sin errores de consola (${mobile ? 'celular' : 'escritorio'})`, errors.length === 0, errors.slice(0, 3).join(' | '));
    await page.context().close();
  }
  await browser.close();
  report.save();
  return report;
}

module.exports = { run };
if (require.main === module) run().then((r) => process.exit(r.failed ? 1 : 0));
