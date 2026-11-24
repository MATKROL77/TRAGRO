import { expect, test } from '@playwright/test';
import { act, waitViewer } from './helpers';

const LANGS = ['es-AR', 'en'] as const;

for (const lang of LANGS) {
  test(`capturas ${lang}`, async ({ page }, info) => {
    const dev = info.project.name;
    const dir = `screenshots/${dev}-${lang}`;
    await page.goto(`/?lang=${lang}&q=medium`);
    await waitViewer(page);
    await page.screenshot({ path: `${dir}-1-estudio.png` });
    // campo sembrando (con corte surco a surco para mostrar la cabecera)
    await act(page, "window.__sp.store.getState().select('sectionControl','on'); window.__sp.runtime.timeScale = 30; window.__sp.store.getState().setScene('field')");
    await page.waitForFunction(() => (window as any).__sp.runtime.distance > 46, null, { timeout: 240_000 });
    await act(page, "window.__sp.store.getState().requestCam('front34', true)", 6000);
    await page.screenshot({ path: `${dir}-2-campo-sembrando.png` });
    await act(page, "window.__sp.store.getState().requestCam('ground', true)", 6000);
    await page.screenshot({ path: `${dir}-3-campo-ras-del-suelo.png` });
    // transporte en ruta
    await act(page, "window.__sp.store.getState().setScene('road')");
    await page.waitForFunction(() => (window as any).__sp.runtime.model.state.poseT > 0.99, null, { timeout: 240_000 });
    await act(page, "window.__sp.store.getState().requestCam('front34', true)", 8000);
    await expect(page.locator('.dim-label').first()).toBeVisible();
    await page.screenshot({ path: `${dir}-4-transporte-ruta.png` });
    // plegado de alas en estudio
    await act(page, "window.__sp.store.getState().setScene('studio'); window.__sp.store.getState().setPose('transport'); window.__sp.store.getState().select('transport','fold')");
    await page.waitForFunction(() => (window as any).__sp.runtime.model.layout.transport === 'fold' && (window as any).__sp.runtime.model.state.poseT > 0.99, null, { timeout: 240_000 });
    await act(page, "window.__sp.store.getState().requestCam('front34', true)", 8000);
    await page.screenshot({ path: `${dir}-5-plegada.png` });
    // cuerpo de siembra en detalle (despiece)
    await act(page, "window.__sp.store.getState().setPose('work'); window.__sp.store.getState().setDetail(true); window.__sp.store.getState().setExploded(true)", 14000);
    await page.screenshot({ path: `${dir}-6-cuerpo-de-siembra.png` });
    // ruso: el texto más largo no debe romper el layout
    if (lang === 'en') {
      await page.goto('/?lang=ru&q=low');
      await waitViewer(page);
      await page.screenshot({ path: `screenshots/${dev}-ru-1-estudio.png` });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      expect(overflow).toBe(false);
    }
  });
}
