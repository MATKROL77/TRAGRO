import { expect, test } from '@playwright/test';
import { act, waitViewer } from './helpers';

test.describe('flujo completo', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 900, 'flujo completo en escritorio');

  test('configurar, idioma, unidades, plegar, sembrar, resumen, PDF y link', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await waitViewer(page);
    await expect(page.locator('.bb-amount')).toContainText('USD');
    const price0 = await page.locator('.bb-amount').innerText();

    // Paso 1: modelo grande → transporte longitudinal obligatorio
    await page.getByRole('radio', { name: /UX 24G/ }).click();
    await page.waitForTimeout(1500);
    expect(await page.locator('.bb-amount').innerText()).not.toBe(price0);

    // Paso 2: surcos
    await page.getByRole('button', { name: /Siguiente/ }).click();
    await page.getByRole('button', { name: 'Agregar un surco' }).click();
    await expect(page.locator('.stepper-value')).toHaveText('23');
    await page.getByRole('radio', { name: /70 cm/ }).click();

    // Paso 4: tolva central con dosificación mecánica → ajuste automático + aviso
    await page.locator('.step-tab').nth(5).click();
    await page.getByRole('radio', { name: /Mecánica por cadena/ }).click();
    await page.locator('.step-tab').nth(3).click();
    await page.getByRole('radio', { name: /Tolva central neumática/ }).click();
    await expect(page.locator('.toast')).toBeVisible();
    await expect(page.locator('.toast')).toContainText('neumática o eléctrica');

    // Opción incompatible deshabilitada con explicación
    await page.locator('.step-tab').nth(4).click();
    const pneu = page.getByRole('radio', { name: /Neumática \(bolsas de aire\)/ });
    await expect(pneu).toHaveAttribute('aria-disabled', 'false');

    // Idioma y unidades
    await page.getByLabel('Idioma').selectOption('en');
    await expect(page.getByRole('button', { name: 'Request a quote' })).toBeVisible();
    await page.getByRole('radio', { name: 'Imperial' }).click();
    await page.getByRole('tab', { name: 'Performance' }).click();
    await expect(page.locator('.kpi-grid')).toContainText('ft');
    await page.getByRole('tab', { name: 'Configure' }).click();

    // Plegar para transporte
    await act(page, 'window.__sp.runtime.timeScale = 30');
    await page.getByRole('button', { name: /Fold for transport/ }).click();
    await page.waitForFunction(() => (window as any).__sp.runtime.model.state.poseT > 0.98, null, { timeout: 180_000 });
    await expect(page.locator('.dim-label').first()).toBeVisible();
    await page.getByRole('button', { name: /Working position/ }).click();
    await page.waitForFunction(() => (window as any).__sp.runtime.model.state.poseT < 0.02, null, { timeout: 180_000 });

    // Ver sembrando
    await page.getByRole('button', { name: /Watch it plant/ }).click();
    await page.waitForFunction(() => (window as any).__sp.runtime.distance > 5, null, { timeout: 180_000 });
    await expect(page.locator('.sim')).toBeVisible();
    await page.getByRole('radio', { name: 'Studio' }).click();

    // Resumen con renders y PDF
    await page.getByRole('button', { name: 'Summary' }).click();
    await expect(page.locator('.sum-render img').first()).toBeVisible({ timeout: 180_000 });
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 120_000 }), page.getByTestId('pdf-btn').click()]);
    expect(download.suggestedFilename()).toMatch(/^UX-\d\d-[A-Z0-9]+\.pdf$/);
    const number = await page.locator('.sum-meta strong').innerText();

    // Link compartido reconstruye la configuración exacta (incluye idioma y unidades)
    await page.getByRole('button', { name: /Copy link/ }).click();
    const url = await page.evaluate(() => navigator.clipboard.readText());
    expect(url).toContain('cfg=');
    expect(url).toContain('lang=en');
    expect(url).toContain('u=imp');
    const page2 = await context.newPage();
    await page2.goto(url);
    await page2.waitForFunction(() => !!(window as any).__sp);
    await page2.getByRole('button', { name: 'Summary' }).click();
    await expect(page2.locator('.sum-meta strong')).toHaveText(number);
    await page2.keyboard.press('Escape');
    await page2.getByRole('tab', { name: 'Performance' }).click();
    await expect(page2.locator('.kpi-grid')).toContainText('ft');
    expect(errors).toEqual([]);
  });

  test('cotización por WhatsApp valida y arma el mensaje', async ({ page }) => {
    await page.goto('/');
    await waitViewer(page);
    await page.getByRole('button', { name: 'Pedir cotización' }).click();
    await page.getByRole('button', { name: /Enviar por WhatsApp/ }).click();
    await expect(page.locator('.error').first()).toBeVisible();
    await page.getByLabel(/Nombre y apellido/).fill('Juan Pérez');
    await page.getByLabel(/^País/).fill('Paraguay');
    await page.getByLabel(/Teléfono/).fill('+595 981 000 000');
    await page.getByLabel(/^Email/).fill('juan@example.com');
    await page.getByLabel(/Hectáreas/).fill('3500');
    const popup = page.waitForEvent('popup');
    await page.getByRole('button', { name: /Enviar por WhatsApp/ }).click();
    const p = await popup;
    const u = decodeURIComponent(p.url()).replace(/\+/g, ' ');
    expect(u).toMatch(/wa\.me|whatsapp\.com/);
    expect(u).toContain('Juan Pérez');
    expect(u).toContain('3500');
    expect(u).toContain('cfg=');
  });
});
