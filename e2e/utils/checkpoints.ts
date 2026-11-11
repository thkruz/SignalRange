import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page } from '@playwright/test';

/**
 * Mid-scenario starts for e2e specs.
 *
 * A checkpoint is a genuine saved game (the same AppState the progress save writes), captured from a
 * development build through window.__srTest.captureCheckpoint (src/testing/sr-test-hook.ts) and stored at
 *   e2e/fixtures/checkpoints/<campaign>/<scenario>@<objectiveId>.json
 * where <objectiveId> is the objective that was active when it was captured (the first one still to play).
 *
 * startAtCheckpoint serves it to the page through window.__SR_START_CHECKPOINT__ before boot; the app
 * starts a ReplaySession with it (no sign-in, backend writes blocked) and the scenario page restores it.
 * Checkpoints go stale when a scenario's objectives, equipment or managers change: recapture them.
 */
export const CHECKPOINT_DIR = join(process.cwd(), 'e2e', 'fixtures', 'checkpoints');

interface StoredCheckpoint {
  scenarioId: string;
  campaignId: string;
  activeObjectiveIds: string[];
  completedObjectiveIds: string[];
  state: unknown;
}

interface CapturedCheckpoint {
  scenarioId: string;
  campaignId?: string;
  completedObjectiveIds?: string[];
  state: { objectiveStates?: Array<{ isActive: boolean; isCompleted: boolean; objective: { id: string } }> };
}

/** Name used by both helpers: `<scenario>@<objectiveId>` */
export const checkpointName = (scenarioId: string, objectiveId: string): string => `${scenarioId}@${objectiveId}`;

/** Capture the running game and store it as `<campaign>/<name>.json`. The name is `<scenario>@<objectiveId>` (see checkpointName). */
export async function captureCheckpoint(page: Page, name: string): Promise<string> {
  const captured = await page.evaluate(() => {
    const hook = (window as unknown as { __srTest?: { captureCheckpoint(): unknown } }).__srTest;
    if (!hook) throw new Error('window.__srTest is missing: capture needs a development build');

    return hook.captureCheckpoint();
  });
  const cp = captured as CapturedCheckpoint;
  if (!cp.campaignId) throw new Error(`No campaign owns scenario ${cp.scenarioId}`);
  if (!name.startsWith(`${cp.scenarioId}@`)) throw new Error(`Checkpoint name "${name}" must start with "${cp.scenarioId}@"`);
  const stored: StoredCheckpoint = {
    scenarioId: cp.scenarioId,
    campaignId: cp.campaignId,
    activeObjectiveIds: (cp.state.objectiveStates ?? []).filter((o) => o.isActive && !o.isCompleted).map((o) => o.objective.id),
    completedObjectiveIds: cp.completedObjectiveIds ?? [],
    state: cp.state,
  };
  const dir = join(CHECKPOINT_DIR, cp.campaignId);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${name}.json`);
  writeFileSync(file, `${JSON.stringify(stored)}\n`);

  return file;
}

/** Read a stored checkpoint by name from any campaign folder. */
export function loadCheckpoint(name: string): StoredCheckpoint {
  for (const campaign of existsSync(CHECKPOINT_DIR) ? readdirSync(CHECKPOINT_DIR) : []) {
    const file = join(CHECKPOINT_DIR, campaign, `${name}.json`);
    if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')) as StoredCheckpoint;
  }
  throw new Error(`No checkpoint named ${name} under ${CHECKPOINT_DIR} (capture it with the @capture spec)`);
}

/**
 * Open the checkpoint's scenario already restored: call before any other navigation. Resolves once the
 * app shell is live and the checkpoint's completed objectives are completed again in the running game.
 */
export async function startAtCheckpoint(page: Page, name: string): Promise<StoredCheckpoint> {
  const cp = loadCheckpoint(name);
  await page.addInitScript(
    (start) => {
      (window as unknown as { __SR_START_CHECKPOINT__: unknown }).__SR_START_CHECKPOINT__ = start;
    },
    { scenarioId: cp.scenarioId, state: cp.state, label: `e2e ${name}` }
  );
  await page.goto(`/campaigns/${cp.campaignId}/scenarios/${cp.scenarioId}`);
  await expect(page.locator('#app-shell-page')).toBeVisible({ timeout: 30000 });
  await page.waitForFunction(() => !!document.querySelector('.scene-modal[open]') || document.querySelector<HTMLElement>('#app-shell-page')?.inert === false, undefined, {
    timeout: 30000,
  });
  const expected = cp.completedObjectiveIds;
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const hook = (window as unknown as { __srTest?: { captureCheckpoint(): { completedObjectiveIds?: string[] } } }).__srTest;
          try {
            return hook?.captureCheckpoint().completedObjectiveIds ?? [];
          } catch {
            return [];
          }
        }),
      { message: `${name}: completed objectives restored`, timeout: 30000 }
    )
    .toEqual(expected);

  return cp;
}
