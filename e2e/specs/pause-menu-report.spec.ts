import { expect, test } from '../fixtures/test-fixtures';
import { openFrontlineScenario } from '../utils/frontline-helpers';

test.use({ viewport: { width: 1600, height: 1000 } });

/**
 * A player who hits a problem reports it from inside the mission. Signed out (or while the in-game form is not
 * live) the pause menu links to the contact page with the campaign, scenario and build already filled in.
 */
test('the mission pause menu carries a report entry that knows the mission', async ({ page }) => {
  await openFrontlineScenario(page, 3);
  const close = page.getByRole('button', { name: 'Close Checklist', exact: true });
  if (await close.isVisible()) await close.click();
  const pauseMenu = page.locator('dialog#game-menu[open]');
  await page.keyboard.press('Escape');
  await expect(pauseMenu).toBeVisible();

  const link = pauseMenu.locator('[data-report-link]');
  await expect(link).toBeVisible();
  await expect(link).toContainText('Report a problem');
  const url = new URL((await link.getAttribute('href'))!);
  expect(url.origin + url.pathname).toBe('https://signalrange.space/contact-us');
  expect(url.searchParams.get('campaign')).toBe('frontline');
  expect(url.searchParams.get('scenario')).toMatch(/^Scenario 3 - \S/u);
  expect(url.searchParams.get('build')).toMatch(/^v\d+\.\d+\.\d+ \| \S+$/u);
  await expect(link).toHaveAttribute('target', '_blank');
  await pauseMenu.screenshot({ path: test.info().outputPath('pause-menu-report.png') });

  // The link leaves the mission paused behind it; Resume still works.
  await pauseMenu.locator('[data-action="resume"]').click();
  await expect(pauseMenu).toHaveCount(0);
});
