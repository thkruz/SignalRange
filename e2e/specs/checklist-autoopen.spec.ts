import { expect, test } from '../fixtures/test-fixtures';
import { openFrontlineScenario } from '../utils/frontline-helpers';
import { waitForSimulationReady } from '../utils/simulation-helpers';

// The checklist opens docked beside Site on load only where the field console is in use (C6 with the field HUD off, 1600 px or wider; under the field HUD the checklist lives on the clipboard).
// Every other campaign keeps click-to-open, whatever the viewport.
test.describe('checklist auto-open on wide viewports', () => {
  test.use({ viewport: { width: 1600, height: 1000 } });

  test('a non-field campaign starts with the checklist closed', async ({ page, missionControlPage }) => {
    await page.goto('/campaigns/nats/scenarios/nats-scenario1');
    await waitForSimulationReady(page);
    await missionControlPage.dismissDialogIfPresent();
    await expect(missionControlPage.checklistButton).toBeVisible();
    await expect(missionControlPage.objectivesChecklist).toBeHidden();
    await missionControlPage.openChecklist();
  });

  test('the field HUD (C6) never opens the checklist by itself', async ({ page, missionControlPage }) => {
    test.setTimeout(120000);
    await openFrontlineScenario(page, 13);
    // Same as before the gate: the field HUD never auto-opens it. The auto-open path for a C6 station with the HUD off
    // (engineering unlocked) is TentControl.inUse(), which stays true there; the C6 sandbox cannot load signed out in this lane.
    await expect(missionControlPage.objectivesChecklist).toBeHidden();
  });
});
