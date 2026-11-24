import { expect, test } from '@playwright/test';
import { act, waitViewer } from './helpers';

test.skip(({ viewport }) => (viewport?.width ?? 0) < 900, 'una sola medición');

async function fps(page: import('@playwright/test').Page, ms = 6000): Promise<number> {
  return page.evaluate(async (ms) => {
    let frames = 0;
    let run = true;
    const loop = () => {
      frames++;
      (window as any).__sp.runtime.invalidate();
      if (run) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    await new Promise((r) => setTimeout(r, ms));
    run = false;
    return (frames * 1000) / ms;
  }, ms);
}

test('fps aproximados (estudio y campo) y renderer info', async ({ page }) => {
  await page.goto('/?q=medium');
  await waitViewer(page);
  const studio = await fps(page);
  await act(page, "window.__sp.store.getState().setScene('field')", 20000);
  const field = await fps(page);
  const info = await page.evaluate(() => {
    const r = (window as any).__sp.gl.info;
    return { calls: r.render.calls, triangles: r.render.triangles, geometries: r.memory.geometries, textures: r.memory.textures };
  });
  console.log(`FPS estudio≈${studio.toFixed(1)} · campo≈${field.toFixed(1)} · ${JSON.stringify(info)}`);
  test.info().annotations.push({ type: 'fps', description: `estudio ${studio.toFixed(1)} · campo ${field.toFixed(1)} · ${JSON.stringify(info)}` });
  expect(studio).toBeGreaterThan(0);
});

test('estrés: 200 cambios de opción sin crecimiento descontrolado de memoria', async ({ page }) => {
  test.setTimeout(1_200_000);
  await page.goto('/?q=low');
  await waitViewer(page);
  const snap = () =>
    page.evaluate(() => {
      const r = (window as any).__sp.gl.info.memory;
      const heap = (performance as any).memory?.usedJSHeapSize ?? 0;
      return { geometries: r.geometries, textures: r.textures, heap };
    });
  // calentar (primer ciclo crea materiales/programas compartidos)
  await page.evaluate(async () => {
    const s = (window as any).__sp.store.getState;
    for (const m of ['sp10c', 'sp24g', 'sp16m']) {
      s().setModel(m);
      await new Promise((r) => setTimeout(r, 300));
    }
  });
  await page.waitForTimeout(3000);
  const before = await snap();
  await page.evaluate(async () => {
    const s = (window as any).__sp.store.getState;
    const groups: [string, string[]][] = [
      ['coulter', ['turbo', 'wavy']], ['closing', ['rubber', 'castiron', 'spiked']], ['fertilizer', ['none', 'inline', 'side']],
      ['seedHopper', ['individual', 'central']], ['metering', ['chain', 'shaft', 'pneumatic', 'electric']], ['firmer', ['on', 'off']],
      ['transportWheels', ['standard', 'flotation']],
    ];
    for (let i = 0; i < 200; i++) {
      if (i % 9 === 0) s().setRows(12 + (i % 8));
      else if (i % 13 === 0) s().setColors({ main: i % 2 ? '#13447C' : '#1E4D5C', mainRal: i % 2 ? 'RAL 5010' : 'brand' });
      else {
        const [g, opts] = groups[i % groups.length];
        s().select(g, opts[i % opts.length]);
      }
      await new Promise((r) => setTimeout(r, 25));
      if (i % 20 === 0) await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
    s().reset();
  });
  await page.waitForTimeout(5000);
  const after = await snap();
  console.log(`memoria antes ${JSON.stringify(before)} · después ${JSON.stringify(after)}`);
  test.info().annotations.push({ type: 'memoria', description: `antes ${JSON.stringify(before)} · después ${JSON.stringify(after)}` });
  expect(after.geometries).toBeLessThan(before.geometries * 1.5 + 50);
  expect(after.textures).toBeLessThan(before.textures + 12);
});
