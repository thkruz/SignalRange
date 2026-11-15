import { expect, type Page, test } from '@playwright/test';
import { test as fixtureTest } from '../fixtures/test-fixtures';
import { openFrontlineScenario } from '../utils/frontline-helpers';
import { HAM_CAMPAIGN } from '../utils/ham-tech-helpers';
import { waitForSimulationReady } from '../utils/simulation-helpers';

/**
 * N1: the Mission Brief body must fit inside its window in every console (C1 centred, C3 left dock, C6 site dock).
 * The brief is an iframe in a draggable box; its right edge (and the box's own right edge) must be on screen and
 * the iframe must not be wider than the box content.
 */
const VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 1600, height: 1000 },
];

async function expectBriefFits(page: Page, shot: string): Promise<void> {
  const box = page.locator('#draggable-html-box-mission-brief');
  await expect(box).toBeVisible();
  const frame = box.locator('iframe');
  await expect(frame).toBeVisible();
  const vp = page.viewportSize()!;
  // The brief page is on the docs site; give it a moment so the shot shows the text (the geometry checks do not depend on it)
  await page
    .frameLocator('#draggable-html-box-mission-brief iframe')
    .locator('h1')
    .first()
    .waitFor({ timeout: 20000 })
    .catch(() => undefined);
  const m = await page.evaluate(() => {
    const boxEl = document.querySelector<HTMLElement>('#draggable-html-box-mission-brief')!;
    const content = boxEl.querySelector<HTMLElement>('.draggable-box__content') ?? boxEl;
    const f = boxEl.querySelector<HTMLIFrameElement>('iframe')!;
    const doc = f.contentDocument?.documentElement;
    return {
      box: content.getBoundingClientRect().toJSON() as { left: number; right: number; width: number },
      frame: f.getBoundingClientRect().toJSON() as { left: number; right: number; width: number },
      docScrollW: doc?.scrollWidth ?? 0,
      docClientW: doc?.clientWidth ?? 0,
    };
  });
  expect(m.box.right, 'window right edge on screen').toBeLessThanOrEqual(vp.width);
  expect(m.frame.right, 'brief body right edge inside its window').toBeLessThanOrEqual(m.box.right + 1);
  expect(m.docScrollW, 'brief page has no horizontal overflow').toBeLessThanOrEqual(m.docClientW + 1);
  await page.screenshot({ path: `shots/${shot}.png` });
}

for (const vp of VIEWPORTS) {
  const tag = `${vp.width}x${vp.height}`;
  fixtureTest(`C1 NATS S1 brief fits at ${tag}`, async ({ page, missionControlPage: mc }) => {
    await page.setViewportSize(vp);
    await mc.gotoScenario('nats', 'nats-scenario1');
    await waitForSimulationReady(page);
    await mc.dismissDialogIfPresent();
    await mc.openMissionBrief();
    await expectBriefFits(page, `brief-c1-${tag}`);
  });

  fixtureTest(`C3 ham-tech S1 brief fits at ${tag}`, async ({ page, missionControlPage: mc }) => {
    await page.setViewportSize(vp);
    await mc.gotoScenario(HAM_CAMPAIGN, 'ham-tech-s01');
    await waitForSimulationReady(page);
    await mc.dismissDialogIfPresent();
    await page.locator('[data-field-kit="logbook"]').click();
    await page.locator('.field-kit-sheets [data-field-mission="brief"]').click();
    await expectBriefFits(page, `brief-c3-${tag}`);
  });

  test(`C6 frontline S1 brief fits at ${tag}`, async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize(vp);
    await openFrontlineScenario(page, 1);
    // C6 has no brief window: the brief is the description on the clipboard's cover sheet
    await page.locator('[data-field-kit="clipboard"]').first().click();
    await expect(page.locator('.cbk-brief').first()).toBeVisible();
    const m = await page.evaluate(() => {
      const paper = document.querySelector<HTMLElement>('.cbk-paper')!.getBoundingClientRect();
      const rights = [...document.querySelectorAll<HTMLElement>('.cbk-brief, .cbk-subtitle')].map((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        return Math.max(...[...range.getClientRects()].map((r) => r.right));
      });
      return { paperRight: paper.right, textRight: Math.max(...rights) };
    });
    expect(m.paperRight, 'clipboard sheet on screen').toBeLessThanOrEqual(vp.width);
    expect(m.textRight, 'brief text right edge inside the sheet').toBeLessThanOrEqual(m.paperRight + 1);
    await page.screenshot({ path: `shots/brief-c6-${tag}.png` });
  });
}

fixtureTest('C3 ham-tech S1: the brief window does not cover the bench after an object is put down', async ({ page, missionControlPage: mc }) => {
  await page.setViewportSize(VIEWPORTS[0]);
  await mc.gotoScenario(HAM_CAMPAIGN, 'ham-tech-s01');
  await waitForSimulationReady(page);
  await mc.dismissDialogIfPresent();
  await page.locator('[data-field-kit="logbook"]').click();
  await page.locator('.field-kit-sheets [data-field-mission="brief"]').click();
  await expect(page.locator('#draggable-html-box-mission-brief')).toBeVisible();
  // Pick the reference cards up: the brief window (a web panel) goes away, and putting the cards down leaves the bench clear
  await page.locator('[data-field-kit="cards"]').click();
  const leave = page.locator('.immersive-view[open] .immersive-leave').last();
  await expect(leave).toBeVisible();
  await leave.click();
  await expect(page.locator('.immersive-view[open]')).toHaveCount(0);
  await expect(page.locator('#draggable-html-box-mission-brief')).toBeHidden();
  await expect(page.locator('[data-field-kit="logbook"]')).toBeVisible();
  await page.screenshot({ path: 'shots/bench-after-put-down-c3-1280x720.png' });
});
