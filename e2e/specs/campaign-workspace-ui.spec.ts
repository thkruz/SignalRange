import { expect, test } from '../fixtures/test-fixtures';
import { closeCloseup, goToPartFromSheet, openFrontlineScenario, openPart, plantInspect, servicesTakeSample, setPanelOpen } from '../utils/frontline-helpers';
import { connectPorts, openStationTab, openTechScenario, reviewMissionBrief } from '../utils/ham-tech-helpers';

test.use({ viewport: { width: 1600, height: 1000 } });

test('C6 moves between equipment, laptop applications, radio and documents', async ({ page }) => {
  await openFrontlineScenario(page, 3);
  const close = page.getByRole('button', { name: 'Close Checklist', exact: true });
  if (await close.isVisible()) await close.click();
  await openPart(page, 'laptop');
  await expect(page.locator('.immersive-equipment:modal')).toBeVisible();
  await page.screenshot({ path: 'art-review/ui-cleanup/c6-equipment-immersive.png' });
  await page.getByRole('button', { name: 'Use laptop', exact: true }).click();
  const laptop = page.getByRole('dialog', { name: 'Laptop', exact: true });
  await expect(laptop).toBeVisible();
  // The lid opens on the desktop; NetProbe is an app on it, not a table of checks
  await expect(laptop.locator('.lt-desktop')).toBeVisible();
  await expect(laptop.locator('.lt-window')).toBeHidden();
  await page.screenshot({ path: 'art-review/ui-cleanup/c6-laptop-desktop.png' });
  await laptop.locator('.lt-icons').getByRole('button', { name: 'NetProbe', exact: true }).click();
  await expect(laptop.locator('[data-laptop-surface="netprobe"]')).toBeVisible();
  await expect(page.locator('#site-service-panel select')).toHaveCount(0);
  await expect(page.locator('#site-service-panel [data-svc-layer]:visible')).toHaveCount(0);
  await page.screenshot({ path: 'art-review/ui-cleanup/c6-laptop-immersive.png' });
  await page.keyboard.press('Escape');
  await servicesTakeSample(page, 'skylink', 'registration', 'pilot-report');
  await page.locator('[data-field-source="pilot-report"]').click();
  await expect(page.getByRole('dialog', { name: 'Field radio', exact: true })).toBeVisible();
  await page.screenshot({ path: 'art-review/ui-cleanup/c6-radio-immersive.png' });
  await page.keyboard.press('Escape');
  await page.locator('[data-field-object="field-path"]').click();
  await expect(page.getByRole('dialog', { name: 'Field documents', exact: true })).toBeVisible();
  await page.screenshot({ path: 'art-review/ui-cleanup/c6-diagram-immersive.png' });
  await page.keyboard.press('Escape');
  await expect(page.locator('#site-stage')).toBeVisible();
});

test('C6 notebook lets the operator cite observations and write a hypothesis', async ({ page }) => {
  await openFrontlineScenario(page, 3);
  await plantInspect(page, 'laptop');
  await plantInspect(page, 'skylink-router');
  await closeCloseup(page);
  const close = page.getByRole('button', { name: 'Close Checklist', exact: true });
  if (await close.isVisible()) await close.click();

  const notebook = await setPanelOpen(page, /Notebook/u, true);
  const book = page.getByRole('dialog', { name: 'Field notebook', exact: true });
  await expect(book).toBeVisible();
  expect(await book.evaluate((el) => el.matches(':modal'))).toBe(true);
  const bounds = await book.boundingBox();
  expect(bounds).toEqual({ x: 0, y: 0, width: 1600, height: 1000 });
  await page.evaluate(() => {
    document.documentElement.style.zoom = '1.25';
    window.dispatchEvent(new Event('resize'));
  });
  expect(await book.boundingBox()).toEqual({ x: 0, y: 0, width: 1600, height: 1000 });
  await page.evaluate(() => {
    document.documentElement.style.zoom = '';
    window.dispatchEvent(new Event('resize'));
  });
  await page.keyboard.press('Tab');
  expect(await book.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  await expect(notebook.locator('select')).toHaveCount(0);
  await expect(notebook.getByRole('heading', { name: 'Observations & readings' })).toBeVisible();
  const earlier = notebook.getByRole('button', { name: 'Earlier entries', exact: true });
  if (await earlier.isEnabled()) await earlier.click();
  await notebook.locator('[data-nb-cite]').first().check();
  await notebook.locator('[data-nb-pick="cause"]').click();
  await notebook.locator('[data-nb-cause]').first().check();
  await expect(notebook.locator('[data-fnb="cites"]')).toContainText('Marked entries:');
  const draft = await notebook.locator('[data-nb-pick="cause"]').textContent();
  await notebook.locator('[data-nb-pick="cause"]').click();
  await page.keyboard.press('Escape');
  await expect(book).toBeVisible();
  await expect(notebook.locator('[data-nb-picker]:visible')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(book).toHaveCount(0);
  // Field HUD (phase 44): no tab bar; putting the notebook down returns to the site
  await expect(page.locator('#site-stage')).toBeVisible();
  await setPanelOpen(page, /Notebook/u, true);
  await expect(notebook.locator('[data-nb-pick="cause"]')).toHaveText(draft!);
  await expect(notebook.locator('[data-nb-cite]:checked')).toHaveCount(1);
  await expect(notebook.locator('.fnb-line p').first()).toHaveCSS('color', 'rgb(33, 29, 24)');
  await expect(notebook.locator('[data-nb-pick="cause"]')).toHaveCSS('color', 'rgb(16, 43, 89)');
  await expect(notebook.locator('[data-nb-act="clear"]')).toHaveCSS('color', 'rgb(96, 23, 21)');
  for (const key of ['scope', 'target', 'cause', 'confidence', 'requirements']) {
    await notebook.locator(`[data-nb-pick="${key}"]`).click();
    const sheet = notebook.locator(`[data-nb-picker="${key}"]`);
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('.fnb-sheet-heading')).toHaveCSS('color', 'rgb(33, 29, 24)');
    await page.screenshot({ path: `art-review/ui-cleanup/c6-notebook-${key}.png`, animations: 'disabled' });
    await page.keyboard.press('Escape');
  }
  await page.screenshot({ path: 'art-review/ui-cleanup/c6-notebook.png', fullPage: true, animations: 'disabled' });
  await notebook.locator('[data-nb-act="add"]').click();
  await expect(notebook.locator('[data-fnb="last"]')).toContainText('Hypothesis saved');
  await expect(notebook.locator('.fnb-k-hypothesis')).toContainText('cites #');
  await expect(notebook.locator('[data-nb-cite]:checked')).toHaveCount(0);
  await book.getByRole('button', { name: 'Put notebook down', exact: true }).click();
  await expect(book).toHaveCount(0);
});

test('C3 exposes a dedicated, working SDR workspace', async ({ page, missionControlPage: mc }) => {
  await openTechScenario(page, mc, 'ham-tech-s01');
  await reviewMissionBrief(page, mc);
  await openStationTab(page, mc);
  if (await mc.objectivesChecklist.isVisible()) await page.getByRole('button', { name: 'Close Checklist', exact: true }).click();
  await connectPorts(page, { device: 'sdr', port: 'usb' }, { device: 'laptop', port: 'usb1' });
  // Bench HUD (phase 44): no tab bar or sidebar; the SDR program runs on the bench laptop
  await expect(page.locator('html')).toHaveClass(/mc-minimal-hud/u);
  await expect(page.locator('#tab-bar')).toBeHidden();
  await expect(page.locator('[data-field-kit="logbook"]')).toBeVisible();
  const focused = page.locator('.immersive-view[open] .immersive-leave');
  if (await focused.isVisible()) await focused.click();
  // Escape on the bench with nothing held opens the pause menu (review fix 10)
  const pauseMenu = page.locator('dialog#game-menu[open]');
  await page.keyboard.press('Escape');
  await expect(pauseMenu).toBeVisible();
  await page.screenshot({ path: 'art-review/phase-44/slice-2b-shots/10-pause-menu.png' });
  await page.keyboard.press('Escape');
  await expect(pauseMenu).toHaveCount(0);
  // Escape while holding equipment puts it down first; the next Escape pauses
  await page.getByTestId('ham-bench-dev-sdr').dispatchEvent('click');
  await expect(page.locator('.immersive-view[open]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.immersive-view[open]')).toHaveCount(0);
  await expect(pauseMenu).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(pauseMenu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(pauseMenu).toHaveCount(0);
  await page.getByTestId('ham-bench-dev-laptop').dispatchEvent('click');
  await page.getByTestId('ham-open-sdr').click();
  await expect(page.getByRole('dialog', { name: 'Laptop', exact: true })).toBeVisible();
  const console = page.getByTestId('ham-sdr-console');
  await expect(console).toBeVisible();
  await expect(console).toContainText('SkyWatcher SDR');
  await page.getByTestId('ham-sdr-sdr-freq-input').fill('146.55');
  await page.getByTestId('ham-sdr-sdr-freq-enter').click();
  const spectrum = page.getByTestId('ham-spectrum-sdr-canvas');
  await expect(spectrum).toHaveAttribute('aria-valuenow', '146.55');
  await spectrum.focus();
  await page.keyboard.press('ArrowRight');
  await expect(spectrum).toHaveAttribute('aria-valuetext', '146.5510 MHz');
  expect((await spectrum.boundingBox())!.width).toBeGreaterThan(400);
  await page.screenshot({ path: 'art-review/ui-cleanup/c3-sdr.png', fullPage: true });
  await page.getByTestId('ham-console-bench').click();
  await expect(page.getByTestId('ham-station-tab')).toBeVisible();
});

test('C6 exposes workspaces and previews power switches', async ({ page }) => {
  await openFrontlineScenario(page, 14);
  const checklistClose = page.getByRole('button', { name: 'Close Checklist', exact: true });
  if (await checklistClose.isVisible()) await checklistClose.click();
  // Field HUD (phase 44): the station computer's tab bar, sidebar and command bar give way to the kit tray and watch
  await expect(page.locator('html')).toHaveClass(/mc-minimal-hud/u);
  await expect(page.locator('#tab-bar')).toBeHidden();
  await expect(page.locator('#asset-tree-sidebar-container')).toBeHidden();
  await expect(page.locator('#hud-watch')).toBeVisible();
  await expect(page.locator('.site-tab [role="tablist"]')).toHaveCount(0);
  await expect(page.locator('[data-field-kit="documents"]')).toBeVisible();
  await expect(page.locator('#site-stage')).toBeVisible();
  await setPanelOpen(page, /^\s*Power\b/u, true);
  await expect(page.locator('#site-stage')).toBeHidden();
  await expect(page.locator('#site-power-panel select')).toHaveCount(0);
  const radio = page.locator('#site-power-panel input[type="radio"]:not(:checked)').first();
  await radio.check();
  await expect(page.locator('[data-fpp="forecast-note"]')).toContainText('preview');
  await expect(page.locator('[data-fpp="energy"]')).toBeVisible();
  await page.screenshot({ path: 'art-review/ui-cleanup/c6-power.png', fullPage: true });
  await setPanelOpen(page, /Service paths/u, true);
  await setPanelOpen(page, /^\s*Power/u, true);
  await expect(page.locator('[data-fpp="forecast-note"]')).toContainText('preview');
  await page.locator('[data-power-action="reset"]').click();
  await expect(page.locator('[data-power-action="apply"]')).toBeDisabled();
  await setPanelOpen(page, /Service paths/u, true);
  await expect(page.locator('#site-path-panel svg')).toBeVisible();
  await page.screenshot({ path: 'art-review/ui-cleanup/c6-paths.png', fullPage: true });
  await page.locator('.immersive-leave').click();
  await expect(page.locator('#site-stage')).toBeVisible();
  await setPanelOpen(page, /^\s*Power/u, true);
  const pick = page.locator('#site-power-panel input[type="radio"]:not(:checked)').first();
  const part = await pick.getAttribute('data-power-part');
  const mode = await pick.inputValue();
  await pick.check();
  await page.locator('[data-power-action="apply"]').click();
  await goToPartFromSheet(page, page.locator('#site-power-panel'), part!);
  const switchPosition = page.locator(`#part-closeup-modal [data-equipment-mode="${mode}"]`);
  await expect(switchPosition).toHaveAttribute('aria-pressed', 'false');
  await switchPosition.click();
  await expect(switchPosition).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: 'art-review/ui-cleanup/c6-equipment-mode.png' });
});
