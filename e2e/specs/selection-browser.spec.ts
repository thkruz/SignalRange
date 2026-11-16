import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // This menu review is entirely local; no account or external service is required.
  await page.route('**/*', (route) => {
    const host = new URL(route.request().url()).hostname;
    return host === '127.0.0.1' || host === 'localhost' ? route.continue() : route.abort();
  });
});

test('campaign preview requires an explicit entry action and shares mission framing', async ({ page }) => {
  await page.goto('/');
  await page.locator('.campaign-card[data-campaign-id="nats"]').click();
  await expect(page).toHaveURL('/');
  await expect(page.locator('#campaign-detail h2')).toContainText('North Atlantic');
  const before = await page.locator('#campaign-selection-page .selection-workspace').boundingBox();
  await page.locator('#campaign-detail .selection-primary').click();
  await expect(page).toHaveURL('/campaigns/nats');
  await expect(page.locator('#scenario-detail .btn-start')).toBeEnabled();
  const after = await page.locator('#scenario-selection-page .selection-workspace').boundingBox();
  expect(after?.x).toBe(before?.x);
  expect(after?.y).toBe(before?.y);
  expect(after?.width).toBe(before?.width);
  const heading = await page.locator('#scenario-selection-page .selection-heading').boundingBox();
  const header = await page.locator('.header').boundingBox();
  const footer = await page.locator('.footer').boundingBox();
  expect(heading!.y - header!.y - header!.height).toBe(footer!.y - after!.y - after!.height);
  await expect(page.locator('.selection-crew')).toContainText('Charlie Brooks');
  expect(await page.locator('#scenario-detail .selection-meta .duration').evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
});

test('all NATS missions appear once in their phases and locked missions remain readable', async ({ page }) => {
  await page.goto('/campaigns/nats');
  await expect(page.locator('.scenario-list-item')).toHaveCount(25);
  const phases = page.locator('.selection-phase');
  await expect(phases).toHaveCount(4);
  await expect(phases.nth(1).locator('.selection-item')).toHaveCount(8);
  await expect(phases.nth(2).locator('.selection-item')).toHaveCount(8);
  await expect(phases.nth(3).locator('.selection-item')).toHaveCount(8);
  const locked = phases.nth(1).locator('.selection-item').nth(1);
  await locked.click();
  await expect(locked).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#scenario-detail h2')).toHaveText('Scheduled Maintenance');
  await expect(page.locator('#scenario-detail .selection-primary')).toBeDisabled();
  await expect(page.locator('#scenario-detail .selection-actions .locked-requirement')).toContainText('Complete First Day to unlock.');
  await expect(page.locator('#scenario-detail .selection-actions .selection-status-locked svg')).toBeVisible();
  await expect(page.locator('#scenario-detail .selection-briefing .locked-requirement')).toHaveCount(0);
  await expect(page).toHaveURL('/campaigns/nats');
});

test('keyboard browsing works and returning selects the next available mission', async ({ page }) => {
  await page.goto('/campaigns/nats');
  const first = page.locator('.selection-phase').nth(1).locator('.selection-item').first();
  await first.click();
  await first.press('ArrowDown');
  await expect(page.locator('#scenario-detail h2')).toHaveText('Scheduled Maintenance');
  await page.locator('.back-button').click();
  await expect(page).toHaveURL('/');
  await page.locator('#campaign-detail .selection-primary').click();
  await expect(page.locator('#scenario-detail h2')).toHaveText('First Day');
});

test('phase accordion resets to the next mission and keyboard navigation skips collapsed missions', async ({ page }) => {
  await page.goto('/campaigns/nats');
  await expect(page.locator('#scenario-detail .btn-start')).toBeEnabled();
  const phases = page.locator('.selection-phase-toggle');
  await expect(phases.nth(1)).toHaveAttribute('aria-expanded', 'true');
  await phases.nth(2).click();
  await expect(phases.nth(1)).toHaveAttribute('aria-expanded', 'false');
  await expect(phases.nth(2)).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#selection-phase-panel-1')).toBeHidden();
  await phases.nth(1).focus();
  await phases.nth(1).press('ArrowDown');
  await expect(phases.nth(2)).toBeFocused();
  await phases.nth(2).press('ArrowLeft');
  await expect(phases.nth(2)).toHaveAttribute('aria-expanded', 'false');
  await phases.nth(2).press('ArrowRight');
  await expect(phases.nth(2)).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('button', { name: 'Back to Campaigns' }).click();
  await page.locator('#campaign-detail .selection-primary').click();
  await expect(phases.nth(2)).toHaveAttribute('aria-expanded', 'false');
  await expect(phases.nth(1)).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#selection-phase-panel-2 .selection-status-locked').first()).toHaveAttribute('aria-label', 'Locked');
});

test('mission launch reveals the prepared console and removes the loading screen', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/campaigns/nats');
  await page.locator('#scenario-detail .btn-start').click();
  await expect(page).toHaveURL(/\/campaigns\/nats\/scenarios\//u);
  await expect(page.locator('#app-shell-page')).toBeVisible();
  // A fresh mission holds the console behind its opening scene until the player starts it
  const opening = page.locator('.scene-modal[open]');
  await page.waitForFunction(() => !!document.querySelector('.scene-modal[open]') || document.querySelector<HTMLElement>('#app-shell-page')?.inert === false);
  if (await opening.isVisible()) {
    await opening.getByRole('button', { name: 'Start', exact: true }).click();
    await expect(opening).toHaveCount(0);
  }
  await expect(page.locator('.mission-loading-screen')).toHaveCount(0);
  await expect(page.locator('#app-shell-page')).toHaveJSProperty('inert', false);
  expect(errors).toEqual([]);
});

for (const width of [390, 768, 1440]) {
  test(`selection screens fit at ${width}px with reduced motion`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const campaign = page.locator('#campaign-selection-page');
    await expect(campaign).toBeVisible();
    expect(await campaign.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.locator('#campaign-detail .selection-primary').click();
    const scenario = page.locator('#scenario-selection-page');
    await expect(page.locator('#scenario-detail .btn-start')).toBeEnabled();
    expect(await scenario.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await scenario.evaluate((element) => getComputedStyle(element).animationName)).toBe('none');
    const roster = await page.locator('.scenario-grid').boundingBox();
    for (const header of await page.locator('.selection-phase-toggle').all()) {
      const bounds = await header.boundingBox();
      expect(bounds!.y).toBeGreaterThanOrEqual(roster!.y);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(roster!.y + roster!.height);
    }
    const phase = page.locator('.selection-phase-missions:not([hidden])');
    const headerBefore = await page.locator('.selection-phase-toggle').last().boundingBox();
    await phase.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    expect(await page.locator('.selection-phase-toggle').last().boundingBox()).toEqual(headerBefore);
  });
}
