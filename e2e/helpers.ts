import type { Page } from '@playwright/test';

export async function waitViewer(page: Page) {
  await page.waitForFunction(() => (window as unknown as { __sp?: { store: { getState: () => { viewerReady: boolean } } } }).__sp?.store.getState().viewerReady === true, null, { timeout: 120_000 });
  await page.waitForTimeout(2500);
}

export async function sp<T>(page: Page, fn: string): Promise<T> {
  return page.evaluate(fn) as Promise<T>;
}

export async function act(page: Page, code: string, waitMs = 0) {
  await page.evaluate(code);
  if (waitMs) await page.waitForTimeout(waitMs);
}
