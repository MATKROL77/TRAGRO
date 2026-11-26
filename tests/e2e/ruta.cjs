/**
 * Ruta: el camión circula, "Ver en acción" frena y recién detenido abre, "Volver a cerrar"
 * cierra y arranca; cambio de tipo con el equipo abierto; "Tu marca" lo deja detenido.
 * El reloj del vehículo se acelera (render por software lento): no cambia la lógica.
 */
const { launch, openApp, sleep, Report } = require('./lib.cjs');

async function run() {
  const report = new Report('ruta');
  const browser = await launch();
  const { page, errors } = await openApp(browser, { url: '/?calidad=baja', viewport: { width: 900, height: 560 } });
  await page.evaluate(() => {
    window.__store.getState().setUi({ autoFoco: false });
    window.__vehicleClock.scale = 4;
  });
  const v = () => page.evaluate(() => ({ ...window.__vehicle, accion: window.__store.getState().anim.accion }));
  const until = async (fn, ms = 240000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const s = await v();
      if (fn(s)) return s;
      await sleep(500);
    }
    return v();
  };
  await page.click('[data-testid="tb-ruta"]');
  await page.waitForFunction(() => window.__store.getState().ui.env === 'ruta' && !window.__store.getState().ui.cargandoEntorno, null, { timeout: 240000 });
  const s0 = await until((s) => s.speedKmh > 70, 60000);
  report.ok('ruta: el camión circula a 80 km/h', s0.state === 'CIRCULANDO' && Math.round(s0.speedKmh) >= 79, `${Math.round(s0.speedKmh)} km/h`);

  await page.click('[data-testid="tb-accion"]');
  await sleep(300);
  const btn = await page.locator('[data-testid="tb-accion"]').evaluate((b) => ({ dis: b.disabled, txt: b.textContent.trim() }));
  report.ok('ver en acción circulando: "Frenando…" y deshabilitado', btn.dis && /Frenando/.test(btn.txt), btn.txt);
  // Mientras se mueve, la animación no empieza.
  let movedWhileOpen = false;
  const t0 = Date.now();
  let s = await v();
  while (s.state === 'FRENANDO' && Date.now() - t0 < 240000) {
    if (s.speedKmh > 0.5 && s.accion > 0) movedWhileOpen = true;
    await sleep(400);
    s = await v();
  }
  report.ok('la animación nunca empieza con el camión en movimiento', !movedWhileOpen && s.speedKmh === 0, `${s.state} a ${s.speedKmh.toFixed(1)} km/h`);
  s = await until((x) => x.state === 'ABIERTO');
  report.ok('detenido → abre → ABIERTO', s.state === 'ABIERTO' && s.accion === 1);

  await page.click('[data-testid="tb-accion"]');
  s = await until((x) => x.state === 'ARRANCANDO' || x.state === 'CIRCULANDO');
  report.ok('"Volver a cerrar": cierra, espera y arranca', (s.state === 'ARRANCANDO' || s.state === 'CIRCULANDO') && s.accion === 0, s.state);

  // Cambio de tipo con el equipo abierto: cierra sin animación y queda detenido.
  await page.click('[data-testid="tb-accion"]');
  s = await until((x) => x.state === 'ABIERTO');
  await page.evaluate(() => {
    window.__store.getState().setTipo('batea');
    window.__store.setState({ notices: [] });
  });
  await sleep(1500);
  s = await v();
  const quieto = await page.evaluate(() => window.__store.getState().ui.vehiculoQuieto);
  report.ok('cambio de tipo abierto: cierra sin animación y queda DETENIDO', s.state === 'DETENIDO' && s.accion === 0 && quieto, s.state);
  await page.click('[data-testid="tb-arrancar"]');
  s = await until((x) => x.state === 'ARRANCANDO' || x.state === 'CIRCULANDO', 60000);
  report.ok('"Arrancar" lo pone en marcha', s.state === 'ARRANCANDO' || s.state === 'CIRCULANDO', s.state);

  // "Tu marca": se detiene y queda quieto con la cámara lateral.
  await page.evaluate(() => window.__store.getState().setUi({ paso: 'personalizacion' }));
  s = await until((x) => x.state === 'DETENIDO');
  const cam = await page.evaluate(() => window.__store.getState().ui.rutaCam);
  await sleep(3000);
  const still = await v();
  report.ok('"Tu marca": detenido, cerrado y con la cámara lateral', still.state === 'DETENIDO' && still.accion === 0 && cam === 'lateral', `${still.state} · ${cam}`);

  // Salir y volver: aparece detenido; si está cerrado, arranca solo.
  await page.evaluate(() => window.__store.getState().setUi({ paso: 'tipo', env: 'estudio', tractor: false }));
  await sleep(2500);
  const pos = await page.evaluate(() => window.__viewer.stats().modelKey !== '' && true);
  await page.evaluate(() => {
    window.__vehicle.history.length = 0;
    window.__store.getState().setUi({ env: 'ruta', tractor: true });
  });
  s = await until((x) => x.state === 'ARRANCANDO' || x.state === 'CIRCULANDO', 60000);
  const hist = await page.evaluate(() => window.__vehicle.history.slice());
  report.ok('al volver a la ruta aparece detenido y, cerrado, arranca solo', pos && hist[0] === 'DETENIDO' && hist.includes('ARRANCANDO'), hist.join(' → '));

  report.ok('sin errores de consola (ruta)', errors.filter((e) => !/GPU stall/.test(e)).length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  report.save();
  return report;
}

module.exports = { run };
if (require.main === module) run().then((r) => process.exit(r.failed ? 1 : 0));
