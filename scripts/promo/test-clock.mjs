import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.clock.install();
await page.goto('http://localhost:4173/?q=medium');
for (let i = 0; i < 40; i++) {
  await page.clock.runFor(250);
  const ok = await page.evaluate(() => !!window.__sp?.store.getState().viewerReady);
  if (ok) { console.log('ready after', i); break; }
}
await page.clock.runFor(2000);
await page.evaluate(() => window.__sp.store.getState().setScene('field'));
await page.clock.runFor(3000);
console.log(await page.evaluate(() => [window.__sp.runtime.frames, window.__sp.runtime.distance]));
const t0 = Date.now();
for (let i = 0; i < 5; i++) {
  await page.clock.runFor(33);
  await page.screenshot({ path: `/tmp/claude-0/clk-${i}.png` });
}
console.log('ms/frame', (Date.now() - t0) / 5, await page.evaluate(() => [window.__sp.runtime.frames, window.__sp.runtime.distance]));
await browser.close();
