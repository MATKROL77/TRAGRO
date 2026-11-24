/**
 * Flujo completo de un comprador: elegir tipo, recorrer cada paso, subir logo,
 * ver el resumen, generar el PDF y verificar que el link compartido reconstruye
 * exactamente la misma configuración. También modo vendedor, embed y sin WebGL.
 */
const path = require('node:path');
const fs = require('node:fs');
const { launch, openApp, state, setUi, sleep, settle, OUT, Report } = require('./lib.cjs');

const LOGO = path.join(__dirname, 'fixtures', 'logo.png');
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

async function run() {
  const report = new Report('flujo');
  const browser = await launch();
  const { page, errors } = await openApp(browser);
  await setUi(page, { autoFoco: false });
  // Registra cada aviso que aparece: con render por software un clic puede tardar más que lo que dura el aviso.
  await page.evaluate(() => {
    window.__avisos = [];
    new MutationObserver(() => document.querySelectorAll('.notice[data-notice]').forEach((n) => window.__avisos.push({ id: n.getAttribute('data-notice'), texto: n.textContent }))).observe(document.querySelector('.notices'), { childList: true, subtree: true });
  });
  const price = () => page.evaluate(() => Number((document.querySelector('[data-testid="precio-total"]').textContent.match(/USD\s*([\d.]+)/) || [])[1].replace(/\./g, '')));

  // --- Paso 1: tipo -------------------------------------------------------------
  const tolva = await state(page);
  report.ok('arranca en tolva cerealera 1+1+1', tolva.tipo === 'tolva' && tolva.sel.ejes === '1+1+1');
  await page.click('[data-tipo="batea"]');
  await sleep(600);
  report.ok('elegir tipo: batea', (await state(page)).tipo === 'batea');

  // --- Paso 2: medidas (con teclado) ------------------------------------------------
  await page.click('[data-paso="dimensiones"]');
  const before = (await state(page)).sel.largo;
  const slider = page.locator('.steps-body input[type="range"]').first();
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await sleep(500);
  const cfg2 = await state(page);
  report.ok('medidas: el largo cambia con el teclado', cfg2.sel.largo === before + 1, `${before} → ${cfg2.sel.largo} m`);
  report.ok('medidas: volumen calculado en vivo', /m³/.test(await page.locator('[data-testid="volumen"]').textContent()));

  // --- Paso 3: ejes y rodado + regla de compatibilidad --------------------------------
  await page.click('[data-paso="rodado"]');
  const p0 = await page.evaluate(() => window.__store.getState().config.sel.suspension);
  await page.click('[data-opt="ruedas:single"]');
  await sleep(700);
  const cfg3 = await state(page);
  report.ok('regla: súper single cambia sola a suspensión neumática', p0 === 'mecanica' && cfg3.sel.suspension === 'neumatica');
  const aviso = await page.evaluate(() => (window.__avisos.find((a) => a.id === 'single-requiere-neumatica') || {}).texto || null);
  report.ok('regla: aparece el aviso explicando el ajuste', !!aviso && /neumática/.test(aviso), aviso || '');
  const mec = page.locator('[data-opt="suspension:mecanica"]');
  report.ok('regla: la opción incompatible queda deshabilitada con motivo', (await mec.getAttribute('aria-disabled')) === 'true' && ((await mec.getAttribute('title')) || '').length > 10);
  await mec.click({ force: true });
  report.ok('regla: el estado no se rompe al tocar una opción deshabilitada', (await state(page)).sel.suspension === 'neumatica');
  await page.click('[data-opt="llantas:aluminio"]');
  await page.click('[data-opt="ejes:tridem"]');
  await sleep(500);
  report.ok('rodado: llantas y disposición de ejes', (await state(page)).sel.llantas === 'aluminio' && (await state(page)).sel.ejes === 'tridem');

  // --- Paso 4: equipamiento ---------------------------------------------------------
  await page.click('[data-paso="especificos"]');
  await page.click('[data-opt="porton:libro"]');
  await page.click('[data-opt="cobertor"] .switch');
  await sleep(500);
  const cfg4 = await state(page);
  report.ok('equipamiento: portón tipo libro y cobertor', cfg4.sel.porton === 'libro' && cfg4.sel.cobertor === true);

  // --- Paso 5: accesorios -----------------------------------------------------------
  await page.click('[data-paso="accesorios"]');
  await page.click('[data-opt="cajon"] .stepper button:last-child');
  await page.click('[data-opt="lucesLed"] .switch');
  await sleep(500);
  const cfg5 = await state(page);
  report.ok('accesorios: segundo cajón y luces LED', cfg5.sel.cajon === 2 && cfg5.sel.lucesLed === true);

  // --- Paso 6: personalización -------------------------------------------------------
  await page.click('[data-paso="personalizacion"]');
  await page.fill('.steps-body input[type="search"]', '1023');
  await sleep(300);
  report.ok('RAL: el buscador filtra por código', (await page.locator('.ral').count()) === 1);
  await page.click('[data-ral="RAL 1023"]');
  await page.setInputFiles('[data-testid="logo-input"]', LOGO);
  await page.fill('[data-testid="texto-input"]', 'Agro Ñandú S.A. · 0341 555-0101');
  await sleep(1500);
  const cfg6 = await state(page);
  report.ok('personalización: color RAL, logo y texto', cfg6.colores.caja === 'RAL 1023' && /^data:image\/png/.test(cfg6.logo.data || '') && cfg6.texto.valor.startsWith('Agro'));
  report.ok('muestra el código RAL elegido', (await page.locator('[data-testid="ral-caja"]').textContent()) === 'RAL 1023');
  const total = await price();
  report.ok('precio en vivo', total > 60000, `USD ${total}`);
  report.ok('leyenda de precio orientativo visible', /orientativo/i.test((await page.locator('.price-float .ph-label').textContent()) || '') && (await page.locator('.price-float .ph-label').isVisible()));

  // --- Visor: cámaras, acción, hotspots ---------------------------------------------------
  await page.click('[data-testid="tb-camaras"]');
  await page.click('[data-cam="lateral"]');
  await sleep(1200);
  report.ok('cámara: preset lateral', (await page.evaluate(() => window.__store.getState().camera.preset)) === 'lateral');
  const cam = await page.evaluate(() => window.__viewer.camera());
  report.ok('cámara: el preset lateral mira de costado', Math.abs(cam.position[2]) > Math.abs(cam.position[0] - cam.target[0]) * 3, JSON.stringify(cam.position.map((v) => +v.toFixed(1))));
  await page.click('[data-testid="tb-accion"]');
  await sleep(800);
  report.ok('"Ver en acción" inicia la animación', (await page.evaluate(() => window.__store.getState().anim.accion)) === 1);
  await page.click('[data-testid="tb-accion"]');
  report.ok('"Ver en acción" es reversible', (await page.evaluate(() => window.__store.getState().anim.accion)) === 0);
  await sleep(1200);
  await page.evaluate(() => window.__store.getState().setPreset('tresCuartos'));
  await sleep(1500);
  const spots = page.locator('[data-hotspot]');
  report.ok('hotspots sobre el modelo', (await spots.count()) >= 3, `${await spots.count()} puntos`);
  await page.evaluate(() => document.querySelector('[data-hotspot="suspension"]').click());
  await sleep(700);
  report.ok('hotspot abre su tarjeta', await page.locator('.hotcard').isVisible(), ((await page.locator('.hotcard h4').textContent().catch(() => '')) || '').trim());
  await page.evaluate(() => window.__store.getState().setHotspot(null));

  // --- Acercamiento automático al cambiar una opción y regreso -------------------------------
  await sleep(1500);
  await settle(page);
  const home = await page.evaluate(() => window.__viewer.camera());
  await page.evaluate(() => { window.__fast = false; const s = window.__store.getState(); s.setUi({ autoFoco: true, paso: 'rodado' }); });
  await page.click('[data-opt="llantas:acero"]');
  let near = null;
  for (let i = 0; i < 20 && !near; i++) {
    await sleep(700);
    const c = await page.evaluate(() => window.__viewer.camera());
    if (dist(c.position, c.target) < dist(home.position, home.target) * 0.6) near = c;
  }
  report.ok('la cámara se acerca a la zona afectada', !!near, near ? `distancia ${dist(near.position, near.target).toFixed(1)} m (antes ${dist(home.position, home.target).toFixed(1)} m)` : '');
  let back = false;
  for (let i = 0; i < 40 && !back; i++) {
    await sleep(800);
    const c = await page.evaluate(() => window.__viewer.camera());
    back = dist(c.position, home.position) < 0.6;
  }
  report.ok('y vuelve sola después de unos segundos', back);
  await page.evaluate(() => { window.__fast = true; window.__store.getState().setUi({ autoFoco: false }); });

  // --- Resumen con renders ------------------------------------------------------------------
  const config = await state(page);
  await page.click('[data-testid="btn-resumen"]');
  await page.waitForSelector('[data-testid="resumen"]', { timeout: 30000 });
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="sum-renders"] img').length === 3 && [...document.querySelectorAll('[data-testid="sum-renders"] img')].every((i) => i.complete && i.naturalWidth > 300), null, { timeout: 120000 }).catch(() => undefined);
  const renders = await page.evaluate(() => [...document.querySelectorAll('[data-testid="sum-renders"] img')].map((i) => i.naturalWidth));
  report.ok('resumen: 3 renders automáticos desde el canvas', renders.length === 3 && renders.every((w) => w > 300), renders.join(', '));
  const numero = ((await page.locator('[data-testid="sum-numero"]').textContent()) || '').trim();
  report.ok('resumen: número de configuración', /[A-Z]{2}-[0-9A-Z]{7}/.test(numero), numero);
  const sumTotal = Number((((await page.locator('[data-testid="sum-total"]').textContent()) || '').match(/USD\s*([\d.]+)/) || [])[1]?.replace(/\./g, '') ?? 0);
  report.ok('resumen: el total coincide con la barra', sumTotal === (await price()), `USD ${sumTotal}`);
  await page.screenshot({ path: path.join(OUT, 'resumen.png') });

  // --- PDF ------------------------------------------------------------------------------------
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), page.click('[data-testid="sum-pdf"]')]);
  const pdfPath = path.join(OUT, 'cotizacion.pdf');
  await download.saveAs(pdfPath);
  const pdf = fs.readFileSync(pdfPath);
  report.ok('PDF de cotización generado', pdf.slice(0, 5).toString() === '%PDF-' && pdf.length > 40000, `${download.suggestedFilename()} · ${Math.round(pdf.length / 1024)} KB`);
  report.ok('PDF: el nombre lleva el número de configuración', download.suggestedFilename().includes(numero.match(/[A-Z]{2}-[0-9A-Z]{7}/)?.[0] ?? '###'));

  // --- Link compartido ---------------------------------------------------------------------------
  await page.click('[data-testid="sum-compartir"]');
  await page.waitForSelector('[data-testid="share-url"]', { timeout: 20000 });
  const shared = await page.locator('[data-testid="share-url"]').inputValue();
  report.ok('link compartible con la configuración', /[?&]c=/.test(shared), `${shared.length} caracteres`);
  report.ok('el logo chico viaja en el link (sin aviso)', (await page.locator('[data-testid="share-logo-aviso"]').count()) === 0);
  const u = new URL(shared);
  const second = await openApp(browser, { url: u.pathname + u.search });
  const rebuilt = await state(second.page);
  report.ok('el link reconstruye EXACTAMENTE la misma configuración', JSON.stringify(rebuilt) === JSON.stringify(config));
  report.ok('incluido el logo', rebuilt.logo.data === config.logo.data && !!rebuilt.logo.data);
  await second.page.context().close();
  await page.keyboard.press('Escape');
  await sleep(400);

  // --- Comparador A/B ----------------------------------------------------------------------------
  await page.evaluate(() => window.__store.getState().setUi({ modal: 'comparar' }));
  await page.waitForSelector('[data-testid="comparar"]', { timeout: 20000 });
  const hasSave = await page.locator('[data-testid="comparar"] button').count();
  report.ok('comparador disponible', hasSave > 0);
  await page.evaluate(() => {
    const st = window.__store.getState();
    st.saveSnapshot('a', { config: st.config, thumb: null, at: Date.now() });
    st.setOption('frenos', 'ebs');
    st.setOption('llantas', 'aluminio');
    const s2 = window.__store.getState();
    s2.saveSnapshot('b', { config: s2.config, thumb: null, at: Date.now() });
  });
  await sleep(800);
  const dPrecio = ((await page.locator('[data-testid="cmp-delta-precio"]').first().textContent().catch(() => '')) || '').trim();
  const dTara = ((await page.locator('[data-testid="cmp-delta-tara"]').first().textContent().catch(() => '')) || '').trim();
  report.ok('comparador: diferencia de precio, tara y carga útil', /\d/.test(dPrecio) && /\d/.test(dTara), `precio ${dPrecio} · tara ${dTara}`);
  await page.screenshot({ path: path.join(OUT, 'comparar.png') });
  await page.keyboard.press('Escape');
  await sleep(400);

  // --- Consulta por WhatsApp / mail ------------------------------------------------------------------
  await page.evaluate(() => { window.__opened = []; window.open = (url) => { window.__opened.push(String(url)); return null; }; });
  await page.click('[data-testid="btn-cotizar"]');
  await page.waitForSelector('[data-testid="lead-form"]', { timeout: 20000 });
  await page.click('[data-testid="lead-whatsapp"]');
  await sleep(400);
  const invalid = await page.locator('[data-testid="lead-form"] [aria-invalid="true"], [data-testid="lead-form"] .field-error').count();
  report.ok('formulario: valida los campos obligatorios', invalid > 0 && (await page.evaluate(() => window.__opened.length)) === 0, `${invalid} errores marcados`);
  const fill = async (name, value) => {
    const el = page.locator(`[data-testid="lead-form"] [name="${name}"]`);
    if ((await el.count()) === 0) return false;
    const tag = await el.evaluate((n) => n.tagName);
    if (tag === 'SELECT') await el.selectOption({ index: 13 });
    else await el.fill(value);
    return true;
  };
  await fill('nombre', 'Juan Pérez');
  await fill('empresa', 'Transportes del Sur SRL');
  await fill('cuit', '30-71234567-1');
  await fill('provincia', '');
  await fill('telefono', '341 555 0101');
  await fill('email', 'juan@example.com');
  await page.screenshot({ path: path.join(OUT, 'consulta.png') });
  await page.click('[data-testid="lead-whatsapp"]');
  await sleep(1200);
  const opened = await page.evaluate(() => window.__opened);
  const hrefs = await page.evaluate(() => [...document.querySelectorAll('a[href^="https://wa.me/"]')].map((a) => a.href));
  const wa = [...opened, ...hrefs].find((x) => x.startsWith('https://wa.me/')) || '';
  report.ok('consulta: abre WhatsApp con el número del fabricante', /^https:\/\/wa\.me\/\d{8,15}\?text=/.test(wa), wa.slice(0, 60));
  const text = decodeURIComponent(wa.split('text=')[1] || '');
  report.ok('consulta: el mensaje trae los datos, el número y el link a la configuración', text.includes('Juan Pérez') && /[?&]c=/.test(text) && /Configuración N° [A-Z]{2}-[0-9A-Z]{7}/.test(text) && /Carga útil estimada/.test(text), `${text.length} caracteres`);
  report.data.mensajeWhatsApp = text;
  await page.keyboard.press('Escape');
  await sleep(400);

  // --- Pantalla completa: solo el visor (equipo), no toda la página -------------------------------------
  await page.click('[data-testid="tb-pantalla"]');
  await sleep(1200);
  const fsEl = await page.evaluate(() => (document.fullscreenElement ? document.fullscreenElement.className : null));
  report.ok('pantalla completa amplía solo el visor 3D', fsEl === 'stage', String(fsEl));
  const fsSide = await page.evaluate(() => !!document.fullscreenElement && document.fullscreenElement.contains(document.querySelector('.side')));
  report.ok('pantalla completa: el panel de configuración queda afuera', !fsSide);
  await page.evaluate(() => document.exitFullscreen && document.fullscreenElement && document.exitFullscreen());
  await sleep(800);

  // --- Idiomas y unidades ------------------------------------------------------------------------------------
  const tabText = () => page.locator('[data-testid="tab-config"]').textContent();
  await page.selectOption('[data-testid="sel-idioma"]', 'en');
  await page.waitForFunction(() => document.documentElement.lang === 'en', null, { timeout: 15000 }).catch(() => undefined);
  const enTab = (await tabText()) || '';
  await page.click('[data-paso="tipo"]');
  const enTipo = ((await page.locator('[data-tipo="tolva"] .nombre').textContent()) || '').trim();
  report.ok('idioma: inglés (interfaz y catálogo)', enTab !== 'Configurar' && enTab.length > 2 && enTipo !== 'Tolva cerealera', `${enTab} · ${enTipo}`);
  await page.selectOption('[data-testid="sel-idioma"]', 'ru');
  await page.waitForFunction(() => document.documentElement.lang === 'ru', null, { timeout: 15000 }).catch(() => undefined);
  const ruTab = (await tabText()) || '';
  report.ok('idioma: ruso (cirílico)', /[\u0400-\u04FF]/.test(ruTab), ruTab);
  await page.selectOption('[data-testid="sel-idioma"]', 'pt');
  await sleep(300);
  report.ok('idioma: portugués', ((await tabText()) || '').trim() === 'Configurar' && (await page.evaluate(() => document.documentElement.lang)) === 'pt-BR');
  await page.selectOption('[data-testid="sel-idioma"]', 'es');
  await page.click('[data-testid="unidades-imperial"]');
  await sleep(300);
  await page.click('[data-paso="dimensiones"]');
  const valorLargo = ((await page.locator('.steps-body .group-head .valor').first().textContent()) || '').trim();
  const kpis = ((await page.locator('.price-float [data-testid="kpis"]').textContent()) || '').trim();
  report.ok('unidades: sistema imperial (ft · lb)', / ft$/.test(valorLargo) && / lb/.test(kpis), `${valorLargo} · ${kpis}`);
  await page.click('[data-testid="unidades-metric"]');
  await sleep(300);
  report.ok('unidades: vuelve al métrico', / m$/.test(((await page.locator('.steps-body .group-head .valor').first().textContent()) || '').trim()));
  report.ok('sin errores de consola en todo el flujo', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.context().close();

  // --- Modo vendedor ---------------------------------------------------------------------------
  const v = await openApp(browser, { url: '/?modo=vendedor' });
  report.ok('vendedor: interfaz ampliada', await v.page.evaluate(() => document.querySelector('.app').classList.contains('vendedor') && parseFloat(getComputedStyle(document.documentElement.querySelector('.app')).fontSize) > 16));
  await v.page.keyboard.press('2');
  await sleep(500);
  report.ok('vendedor: atajo de cámara (2 = lateral)', (await v.page.evaluate(() => window.__store.getState().camera.preset)) === 'lateral');
  await v.page.keyboard.press('a');
  report.ok('vendedor: atajo de animación (A)', (await v.page.evaluate(() => window.__store.getState().anim.accion)) === 1);
  await v.page.keyboard.press('p');
  await sleep(400);
  report.ok('vendedor: ocultar precios (P)', (await v.page.locator('[data-testid="precio-total"]').count()) === 0 && !(await v.page.locator('.option .precio').first().isVisible().catch(() => false)));
  v.page.on('dialog', (d) => d.accept());
  await v.page.evaluate(() => window.__store.getState().setTipo('furgon'));
  await v.page.click('[data-testid="btn-menu"]');
  await v.page.click('[data-testid="btn-reiniciar"]');
  await sleep(600);
  report.ok('vendedor: "Reiniciar demo" vuelve al inicio', (await state(v.page)).tipo === 'tolva');
  await v.page.context().close();

  // --- Embed --------------------------------------------------------------------------------------
  const e = await openApp(browser, { url: '/embed' });
  report.ok('/embed: sin encabezado', (await e.page.locator('.header').count()) === 0);
  report.ok('/embed: idioma y unidades dentro del panel', await e.page.locator('.embed-lu [data-testid="sel-idioma"]').isVisible());
  report.ok('/embed: el configurador funciona', (await e.page.locator('.viewer canvas').count()) >= 1 && (await e.page.locator('[data-testid="btn-cotizar"]').isVisible()));
  await e.page.context().close();

  // --- Sin WebGL ------------------------------------------------------------------------------------
  const f = await openApp(browser, { url: '/?webgl=0' });
  await f.page.waitForSelector('.fallback', { timeout: 20000 });
  const imgs = await f.page.evaluate(() => Promise.all([...document.querySelectorAll('.fallback img')].map((i) => (i.complete ? i.naturalWidth : new Promise((r) => { i.onload = () => r(i.naturalWidth); i.onerror = () => r(0); })))));
  report.ok('sin WebGL: fallback con imágenes de los equipos', imgs.filter((w) => w > 100).length >= 5, imgs.join(', '));
  await f.page.click('[data-testid="btn-cotizar"]');
  report.ok('sin WebGL: el formulario de consulta funciona igual', await f.page.waitForSelector('[data-testid="lead-form"]', { timeout: 20000 }).then(() => true).catch(() => false));
  await f.page.context().close();

  // --- Celular -----------------------------------------------------------------------------------------
  const m = await openApp(browser, { mobile: true });
  const small = await m.page.evaluate(() => [...document.querySelectorAll('.side button, .topbar button, .header button, .compare-fab')].filter((b) => b.offsetParent && (b.getBoundingClientRect().width < 43.5 || b.getBoundingClientRect().height < 43.5) && !b.classList.contains('hoja-asa') && !b.closest('.seg') && !b.classList.contains('switch')).map((b) => `${b.className} ${Math.round(b.getBoundingClientRect().width)}x${Math.round(b.getBoundingClientRect().height)}`));
  report.ok('celular: controles táctiles de 44 px o más', small.length === 0, small.slice(0, 4).join(' | '));
  const layout = await m.page.evaluate(() => ({ stage: document.querySelector('.stage').getBoundingClientRect().height, total: innerHeight, over: document.documentElement.scrollWidth > innerWidth + 1 }));
  report.ok('celular: visor arriba (≈ 50 % del alto) y sin desborde horizontal', layout.stage / layout.total > 0.44 && !layout.over, `${Math.round((layout.stage / layout.total) * 100)} % de alto`);
  await m.page.tap('[data-paso="rodado"]');
  await m.page.tap('[data-opt="frenos:ebs"]');
  report.ok('celular: se configura con el dedo', (await state(m.page)).sel.frenos === 'ebs');
  await m.page.tap('[data-testid="tec-toggle"]');
  report.ok('celular: pestaña de datos técnicos', await m.page.waitForSelector('[data-testid="checks"]', { timeout: 10000 }).then(() => true).catch(() => false));
  report.ok('celular: sin errores de consola', m.errors.length === 0, m.errors.slice(0, 2).join(' | '));
  await m.page.context().close();

  await browser.close();
  report.save();
  return report;
}

module.exports = { run };
if (require.main === module) run().then((r) => process.exit(r.failed ? 1 : 0));
