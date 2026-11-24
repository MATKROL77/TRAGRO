import { chromium } from 'playwright';
const [out = '/tmp/claude-0/f2.png', cam = 'ground', secs = '30', w = '1100', h = '700', extra = ''] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
page.on('pageerror', (e) => console.log('ERR', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 400)); });
await page.goto('http://localhost:5173/?q=' + (process.env.Q || 'medium') + extra);
await page.waitForTimeout(5000);
await page.evaluate(() => { window.__sp.runtime.timeScale = 25; window.__sp.store.getState().setScene('field'); });
await page.waitForTimeout(+secs * 1000);
if (cam !== 'ground') { await page.evaluate((c) => window.__sp.store.getState().requestCam(c, true), cam); await page.waitForTimeout(4000); }
console.log(await page.evaluate(() => JSON.stringify({ dist: window.__sp.runtime.distance.toFixed(2), sim: window.__sp.runtime.sim })));
await page.screenshot({ path: out });
await browser.close();
