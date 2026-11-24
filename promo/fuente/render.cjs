// Renderiza la composición cuadro por cuadro: node render.cjs [desde] [hasta] [paso] [carpeta]
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const [a = 0, b = 1200, stepN = 1, dir = 'frames'] = process.argv.slice(2);
  const out = `${__dirname}/${dir}`;
  fs.mkdirSync(out, { recursive: true });
  const br = await chromium.launch();
  const page = await (await br.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })).newPage();
  page.on('pageerror', (e) => console.log('pageerror', String(e)));
  await page.goto('http://127.0.0.1:4180/promo.html');
  await page.evaluate(() => window.fontsReady);
  const canvas = page.locator('canvas');
  const t0 = Date.now();
  for (let f = Number(a); f < Number(b); f += Number(stepN)) {
    await page.evaluate((t) => window.renderAt(t), f / 30);
    await canvas.screenshot({ path: `${out}/${String(f).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 94 });
  }
  console.log('listo', (Date.now() - t0) / 1000, 's');
  await br.close();
})().catch((e) => { console.error(e); process.exit(1); });
