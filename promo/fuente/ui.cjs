const { chromium } = require('playwright');
const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const BASE = 'http://localhost:4173';
const OUT = __dirname + '/raw/ui';
require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  for (const lang of ['es', 'en', 'pt', 'ru']) {
    const b = await chromium.launch({ args: ARGS });
    const p = await (await b.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })).newPage();
    await p.goto(`${BASE}/?tipo=tolva&lang=${lang}`, { waitUntil: 'load' });
    await p.waitForFunction(() => window.__store && window.__store.getState().ready, null, { timeout: 180000 });
    await p.evaluate(() => { window.__fast = true; window.__store.getState().setUi({ autoFoco: false, paso: 'rodado' }); });
    await p.waitForTimeout(4000);
    await p.screenshot({ path: `${OUT}/app-${lang}.jpg`, type: 'jpeg', quality: 93 });
    if (lang === 'es') {
      await p.click('[data-testid="tec-toggle"]');
      await p.waitForTimeout(1200);
      await p.screenshot({ path: `${OUT}/tecnico.jpg`, type: 'jpeg', quality: 93 });
      await p.click('[data-testid="tab-config"]');
      await p.evaluate(() => window.__store.getState().setUi({ paso: 'tipo' }));
      await p.waitForTimeout(1200);
      await p.screenshot({ path: `${OUT}/tipo.jpg`, type: 'jpeg', quality: 93 });
      // mensaje real de la consulta por WhatsApp
      const msg = await p.evaluate(async () => {
        const st = window.__store.getState();
        return { url: location.href };
      });
      console.log('url', msg.url.length);
    }
    await b.close();
  }
  console.log('ok');
})().catch((e) => { console.error(e); process.exit(1); });
