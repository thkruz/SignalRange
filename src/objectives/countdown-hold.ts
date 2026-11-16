/**
 * @file countdown-hold - Stops objective and scenario countdowns while the
 * operator is reading something the game put in front of them.
 * @description A dialog, the mission brief and a quiz or decision each hold
 * the countdowns while open (Phase 26 D2: "timers pause while a dialog, the
 * brief or a quiz is open"). Without this every completion clip landed exactly
 * when the next objective's timer started, and players lost most of a 1-2 min
 * timer reading it.
 *
 * Only the countdowns stop. The scenario clock keeps running, so orbits,
 * scheduled events and equipment dynamics are unaffected; that is why this
 * is not SimClock's 'scenario' pause reason, which freezes all of those.
 *
 * Each reason is a flag, not a counter: whoever sets a reason owns clearing it,
 * and a missed release can't stack.
 */

export type CountdownHoldReason = 'dialog' | 'dialog-pending' | 'brief' | 'quiz' | 'decision';

const held_ = new Set<CountdownHoldReason>();

export const CountdownHold = {
  set(reason: CountdownHoldReason, isHeld: boolean): void {
    if (isHeld) {
      held_.add(reason);
    } else {
      held_.delete(reason);
    }
  },

  isHeld(): boolean {
    return held_.size > 0;
  },

  /** Reasons currently holding, for debugObjective and tests */
  reasons(): CountdownHoldReason[] {
    return [...held_];
  },

  /** Scenario teardown */
  reset(): void {
    held_.clear();
  },
};
