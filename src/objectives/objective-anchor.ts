/**
 * @file objective-anchor - Start scheduled events from an objective (Phase 19.0a)
 * @description A scenario event timed from mission start is missed by any
 * player slower than the author: an objective that needs the event opens
 * after it has come and gone. An event that names `startAfterObjectiveId`
 * waits instead. It stays dormant until that objective is live (active, or
 * restored complete), then runs its authored offset later.
 *
 * Anchors are polled rather than driven by OBJECTIVE_ACTIVATED: checkpoint
 * restore sets objective state without emitting it, and the first objectives
 * activate before any event manager exists. A restored-complete anchor also
 * counts, so a refresh past the anchor still gets its event.
 *
 * The same anchor can end an event instead (`endAfterObjectiveId` +
 * `endOffsetS`): the event runs until that objective is live, then for
 * endOffsetS more. Use it when the objective that needs the event may come
 * late, but the event must not outlast the objective that clears it.
 *
 * Each schedule-owning manager keeps one ObjectiveAnchors, polls it once per
 * update with its own mission-elapsed seconds, and reads event times through
 * atS(). Managers with no anchored events never touch the objectives.
 */

import { SimulationManager } from '@app/simulation/simulation-manager';

export class ObjectiveAnchors {
  /** Anchor objectives not yet seen live */
  private readonly pending_: Set<string>;
  /** Mission-elapsed second each anchor objective was first seen live */
  private readonly liveAtS_ = new Map<string, number>();

  constructor(anchorIds: Iterable<string | undefined>) {
    this.pending_ = new Set([...anchorIds].filter((id): id is string => id !== undefined));
  }

  /** Snapshot of the anchors already seen live, as [objectiveId, mission-elapsed second] (checkpoint) */
  getState(): Array<[string, number]> {
    return [...this.liveAtS_];
  }

  /**
   * Restore anchors captured by getState so anchored events keep their original
   * time instead of re-anchoring at the restore moment. Ids this manager does not
   * anchor on, and non-finite times, are ignored.
   */
  restoreState(entries: Array<[string, number]> | undefined): void {
    if (!Array.isArray(entries)) {
      return;
    }
    for (const entry of entries) {
      if (!Array.isArray(entry)) {
        continue;
      }
      const [id, atS] = entry;
      if (typeof id === 'string' && Number.isFinite(atS) && (this.pending_.has(id) || this.liveAtS_.has(id))) {
        this.liveAtS_.set(id, atS);
        this.pending_.delete(id);
      }
    }
  }

  /** Whether any event names an anchor (managers skip polling when not) */
  get hasAnchors(): boolean {
    return this.pending_.size > 0 || this.liveAtS_.size > 0;
  }

  /** Stamp every waiting anchor whose objective is now live. Call once per update. */
  poll(elapsedS: number): void {
    if (this.pending_.size === 0) {
      return;
    }
    const objectivesManager = SimulationManager.getInstance().objectivesManager;

    for (const id of this.pending_) {
      const state = objectivesManager?.getObjectiveState(id);
      if (state?.isActive || state?.isCompleted) {
        this.liveAtS_.set(id, elapsedS);
        this.pending_.delete(id);
      }
    }
  }

  /**
   * Mission-elapsed second `offsetS` after mission start, or after the anchor
   * objective came up. Infinity while the anchor waits, so an anchored start
   * has not happened yet (`elapsed >= start` is false) and an anchored end
   * has not come yet.
   */
  atS(offsetS: number, anchorId?: string): number {
    if (anchorId === undefined) {
      return offsetS;
    }
    const liveAt = this.liveAtS_.get(anchorId);

    return liveAt === undefined ? Number.POSITIVE_INFINITY : liveAt + offsetS;
  }
}
