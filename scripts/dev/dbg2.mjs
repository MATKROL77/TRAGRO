import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.text().includes('[field]')) console.log('CONSOLE', m.text().slice(0,300)); });
await page.goto('http://localhost:5173/');
await page.waitForTimeout(5000);
await page.evaluate(() => window.__sp.store.getState().setScene('field'));
for (let i = 0; i < 8; i++) {
  await page.waitForTimeout(2500);
  console.log(await page.evaluate(() => JSON.stringify({ fog: window.__sp.scene?.fog?.color?.getHexString(), kids: window.__sp.scene?.children.map(c=>c.type+':'+c.name).join(','), frames: window.__sp.runtime.frames, dist: window.__sp.runtime.distance, speed: window.__sp.runtime.speed, scene: window.__sp.store.getState().scene, sowing: window.__sp.store.getState().sowing })));
}
await page.screenshot({ path: '/tmp/claude-0/f1.png' });
await browser.close();
