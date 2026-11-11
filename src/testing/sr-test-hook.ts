import { CampaignManager } from '@app/campaigns/campaign-manager';
import { ScenarioManager } from '@app/scenario-manager';
import type { AppState } from '@app/sync/storage';
import { syncManager } from '@app/sync/storage';
import { ReplaySession } from '@app/user-account/replay-session';

/** A saved game for one scenario, as written to e2e/fixtures/checkpoints/*.json */
export interface TestCheckpoint {
  scenarioId: string;
  campaignId?: string;
  /** Objective ids that were complete when captured (informational) */
  completedObjectiveIds?: string[];
  state: AppState;
}

export interface SrTestApi {
  /** The current game as an AppState, built by the same collector the progress save uses */
  captureCheckpoint(): TestCheckpoint;
}

declare global {
  interface Window {
    /** Set by an e2e init script before boot: the app serves it as an in-memory replay checkpoint */
    __SR_START_CHECKPOINT__?: { scenarioId: string; state: AppState; label?: string };
    __srTest?: SrTestApi;
  }
}

/** Development builds only (the e2e builds); production bundles drop the hook, and it is inert even if reached. */
export function isTestHookEnabled(): boolean {
  return process.env.NODE_ENV === 'development';
}

export function captureCheckpoint(): TestCheckpoint {
  const scenarioId = ScenarioManager.getInstance().data.id;
  const state = JSON.parse(JSON.stringify(syncManager.getCurrentState())) as AppState;
  const completedObjectiveIds = (state.objectiveStates ?? []).filter((o) => o.isCompleted).map((o) => o.objective.id);

  return {
    scenarioId,
    campaignId: CampaignManager.getInstance().getCampaignForScenario(scenarioId)?.id,
    completedObjectiveIds,
    state,
  };
}

/**
 * Installs window.__srTest and, when an init script left a checkpoint on
 * window.__SR_START_CHECKPOINT__, starts a ReplaySession with it so the scenario
 * page restores that genuine saved state (no sign-in, backend writes blocked).
 * Call once, before the router resolves the first route.
 */
export function installTestHook(): void {
  if (!isTestHookEnabled() || typeof window === 'undefined') return;

  window.__srTest = { captureCheckpoint };

  const start = window.__SR_START_CHECKPOINT__;
  if (start?.scenarioId && start.state) {
    ReplaySession.start({ scenarioId: start.scenarioId, state: start.state, label: start.label ?? 'e2e checkpoint' });
  }
}
