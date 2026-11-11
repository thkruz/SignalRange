import { expect, type Page } from '@playwright/test';
import { closeCloseup, goToPartFromSheet, setPanelOpen } from './frontline-helpers';

/**
 * Power plan (the planning sheet held from the documents on the kit tray): read the stored energy and forecast,
 * pencil device modes, keep the plan, then walk to each part with "Go to <part>" and set the mode on the equipment. Returns the panel's result lines for the applied changes.
 */
export async function powerApplyModes(page: Page, modes: Record<string, string>): Promise<string> {
  await closeCloseup(page);
  const d = await setPanelOpen(page, /^\s*Power\b/u, true);
  for (const [partId, modeId] of Object.entries(modes)) {
    const sel = d.locator(`input[data-power-part="${partId}"][value="${modeId}"]`);
    await expect(sel, `power selector for ${partId}`).toBeVisible();
    await sel.check();
  }
  await d.locator('button[data-power-action="apply"]').click();
  const results: string[] = [];
  for (const [partId, modeId] of Object.entries(modes)) {
    const plan = await setPanelOpen(page, /^\s*Power\b/u, true);
    await goToPartFromSheet(page, plan, partId);
    const control = page.locator(`#part-closeup-modal [data-equipment-mode="${modeId}"]`);
    await expect(control).toBeVisible();
    await control.click();
    results.push(await page.locator('#pcu-latest').innerText());
    await closeCloseup(page);
  }
  const text = results.join(' ');

  return text;
}

/** Open the Power panel so its readings and forecast are on screen, return the visible forecast line */
export async function powerReadForecast(page: Page): Promise<string> {
  await closeCloseup(page);
  const d = await setPanelOpen(page, /^\s*Power\b/u, true);
  const line = (await d.locator('[data-fpp="forecast-line"]').innerText()).replace(/\s+/gu, ' ').trim();
  await setPanelOpen(page, /^\s*Power\b/u, false);

  return line;
}
