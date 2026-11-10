import { expect, type Page } from '@playwright/test';
import { closeCloseup, goInside, setPanelOpen } from './frontline-helpers';

/**
 * Power panel (Site tab, inside view): read the stored energy and forecast, pick device modes in the
 * selectors, then Apply. Returns the panel's result lines for the applied changes.
 */
export async function powerApplyModes(page: Page, modes: Record<string, string>): Promise<string> {
  await closeCloseup(page);
  await goInside(page);
  const d = await setPanelOpen(page, /^\s*Power\b/u, true);
  for (const [partId, modeId] of Object.entries(modes)) {
    const sel = d.locator(`select[data-power-part="${partId}"]`);
    await expect(sel, `power selector for ${partId}`).toBeVisible();
    await sel.selectOption(modeId);
  }
  await d.locator('button[data-power-action="apply"]').click();
  const result = d.locator('[data-fpp="result"]');
  await expect.poll(async () => (await result.innerText()).trim().length, { message: 'power Apply reported a result' }).toBeGreaterThan(0);
  const text = (await result.innerText()).replace(/\s+/gu, ' ').trim();
  await setPanelOpen(page, /^\s*Power\b/u, false);

  return text;
}

/** Open the Power panel so its readings and forecast are on screen, return the visible forecast line */
export async function powerReadForecast(page: Page): Promise<string> {
  await closeCloseup(page);
  await goInside(page);
  const d = await setPanelOpen(page, /^\s*Power\b/u, true);
  const line = (await d.locator('[data-fpp="forecast-line"]').innerText()).replace(/\s+/gu, ' ').trim();
  await setPanelOpen(page, /^\s*Power\b/u, false);

  return line;
}
