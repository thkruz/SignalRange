import { expect, Page, test } from '@playwright/test';
import { MissionControlPage } from '../pages/mission-control.page';
import { waitForSimulationReady } from '../utils/simulation-helpers';

/**
 * Sandbox loadout (phase 17).
 *
 * Scenarios ship hard-coded equipment; sandboxes let the operator swap it. Two
 * entry points are exercised: the `?antenna=` query override that e2e and the
 * plugin dev harness use, and the LOADOUT control in the command bar, which
 * writes the choice to localStorage and restarts the sandbox from a clean
 * store. The ACU tab's identification line is the assertion point because it
 * is rendered from the live antenna's config, not from scenario data.
 */

const SANDBOX = '/campaigns/nats/scenarios/nats-sandbox';
const STATION = 'VT-01';

async function readAcuAntennaInfo(page: Page): Promise<string> {
  const mc = new MissionControlPage(page);

  await mc.selectGroundStation(STATION);
  await mc.selectTab('acu-control');

  const info = page.locator('.acu-antenna-info').first();

  await expect(info).toBeVisible();

  return (await info.textContent()) ?? '';
}

test.describe('Sandbox loadout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test('?antenna= swaps the station antenna for one launch', async ({ page }) => {
    await page.goto(`${SANDBOX}?antenna=KU_BAND_9M_LIMIT`);
    await waitForSimulationReady(page);

    expect(await readAcuAntennaInfo(page)).toContain('Ku-Band 9m');

    // The override is per launch: nothing was written to storage.
    const stored = await page.evaluate(() => localStorage.getItem('sandbox-loadout:nats-sandbox'));

    expect(stored).toBeNull();
  });

  test('LOADOUT applies a choice, restarts the sandbox, and remembers it', async ({ page }) => {
    await page.goto(SANDBOX);
    await waitForSimulationReady(page);

    expect(await readAcuAntennaInfo(page)).toContain('C-Band 9m');

    await page.locator('#loadout-control').click();

    const box = page.locator('#loadout-modal');

    await expect(box).toBeVisible();
    await box.locator('select[data-station-index="0"]').selectOption('KU_BAND_3M_ANTESTAR');
    await box.locator('#loadout-apply').click();

    await waitForSimulationReady(page);
    expect(await readAcuAntennaInfo(page)).toContain('Ku-Band 3m');

    const stored = await page.evaluate(() => localStorage.getItem('sandbox-loadout:nats-sandbox'));

    expect(stored).toContain('KU_BAND_3M_ANTESTAR');

    // A plain reload honours the stored loadout.
    await page.goto(SANDBOX);
    await waitForSimulationReady(page);
    expect(await readAcuAntennaInfo(page)).toContain('Ku-Band 3m');

    // Reset returns the scenario's own equipment.
    await page.locator('#loadout-control').click();
    await page.locator('#loadout-modal #loadout-reset').click();
    await waitForSimulationReady(page);
    expect(await readAcuAntennaInfo(page)).toContain('C-Band 9m');
  });

  test('scored scenarios have no loadout control', async ({ page }) => {
    await page.goto('/campaigns/nats/scenarios/nats-scenario1');
    await expect(page.locator('#app-shell-page')).toBeVisible({ timeout: 15000 });

    await expect(page.locator('#loadout-control')).toHaveCount(0);
  });
});
