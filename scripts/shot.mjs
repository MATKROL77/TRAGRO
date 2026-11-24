// Uso: node scripts/shot.mjs <url> <out.png> [w] [h] [waitMs] [jsBefore]
import { chromium } from 'playwright';
const [url, out, w = '1440', h = '900', wait = '4000', js = ''] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(+wait);
if (js) {
  await page.evaluate(js);
  await page.waitForTimeout(+wait);
}
await page.screenshot({ path: out });
console.log(logs.filter((l) => !l.includes('[vite]') && !l.includes('Download the React DevTools')).slice(0, 30).join('\n'));
await browser.close();
