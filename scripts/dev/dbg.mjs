import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:5173/');
await page.waitForTimeout(9000);
console.log(await page.evaluate(() => { const r = window.__sp.runtime; return JSON.stringify({ frames: r.frames, model: !!r.model, cam: window.__sp.store.getState().camRequest, pos: window.__sp.cam?.position, tgt: window.__sp.ctl?.target }); }));
await browser.close();
