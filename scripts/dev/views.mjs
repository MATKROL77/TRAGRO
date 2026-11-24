// Captura varias vistas con acciones del store: node scripts/dev/views.mjs out-prefix "js1" "js2" ...
import { chromium } from 'playwright';
const [prefix, ...steps] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: +(process.env.W || 1100), height: +(process.env.H || 700) } });
page.on('pageerror', (e) => console.log('ERR', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 300)); });
await page.goto('http://localhost:5173/' + (process.env.QS || '?q=medium'));
await page.waitForTimeout(6000);
let i = 0;
for (const js of steps) {
  const [code, wait = '8'] = js.split('@@');
  await page.evaluate(code);
  await page.waitForTimeout(+wait * 1000);
  await page.screenshot({ path: `${prefix}-${i++}.png` });
}
await browser.close();
