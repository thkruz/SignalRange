import type { AppState } from '@app/sync/storage';

export interface ReplayCheckpoint {
  scenarioId: string;
  state: AppState;
  /** Shown in the replay banner, e.g. "player 20aa6262, saved 2026-09-30". */
  label: string;
}

/**
 * A checkpoint supplied from memory instead of the backend, so a developer can
 * play from exactly where a player stopped. Only the private edition's dev
 * tooling starts one; in every other build it stays inactive.
 *
 * While a replay is active:
 *  - ProgressSaveManager.loadCheckpoint serves it for its scenario,
 *  - the scenario page restores it without requiring a sign-in,
 *  - UserDataService refuses every backend write, so a replay never touches
 *    the signed-in developer's own saves, scores or progress.
 *
 * It lives in memory only: a page reload ends it.
 */
export class ReplaySession {
  private static checkpoint_: ReplayCheckpoint | null = null;

  static start(checkpoint: ReplayCheckpoint): void {
    ReplaySession.checkpoint_ = checkpoint;
  }

  static end(): void {
    ReplaySession.checkpoint_ = null;
  }

  static isActive(): boolean {
    return ReplaySession.checkpoint_ !== null;
  }

  static current(): ReplayCheckpoint | null {
    return ReplaySession.checkpoint_;
  }

  /** The replayed checkpoint when it belongs to `scenarioId`. */
  static checkpointFor(scenarioId: string): ReplayCheckpoint | null {
    return ReplaySession.checkpoint_?.scenarioId === scenarioId ? ReplaySession.checkpoint_ : null;
  }
}
