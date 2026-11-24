import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 560 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto('http://localhost:5173/?q=medium');
await page.waitForTimeout(5000);
await page.evaluate(() => { window.__sp.runtime.timeScale = 25; window.__sp.store.getState().setScene('field'); });
await page.waitForTimeout(30000);
await page.screenshot({ path: '/tmp/claude-0/g0.png' });
const kids = await page.evaluate(() => window.__sp.sim.group.children.map((c) => c.type));
console.log(kids);
for (const [i, name] of [[1, 'furrows'], [9, 'stubble']]) {
  await page.evaluate((i) => { if (i === 9) { window.__sp.scene.traverse((o) => { if (o.isInstancedMesh && o.count > 1000) o.visible = false; }); } else window.__sp.sim.group.children.forEach((c, j) => (c.visible = j !== i)); window.__sp.runtime.invalidate(); }, i);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `/tmp/claude-0/g-no-${name}.png` });
}
await browser.close();
