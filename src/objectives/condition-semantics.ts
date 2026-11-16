/**
 * @file condition-semantics - What kind of check each condition type is
 * @description Phase 27 (2.B). A checklist row either asks the player to DO
 * something (set a value, flip a switch) or to CONFIRM something (a lock, a
 * C/N, a status). The engine treats the two differently:
 *
 *  - B1 `requiresChange`: a set-type row that is already true on the frame its
 *    objective activates counts only after the watched value changes (or the
 *    row goes false once). Without it a start state that happens to match the
 *    target ticks the row before the player has touched anything.
 *  - Q1: an objective's countdown times the doing, not the reading; quiz-type
 *    rows do not keep it running.
 *
 * The sets are closed lists, not inferred from names, so a new condition type
 * defaults to verify-type (no change required) until someone decides.
 */

import type { Condition, ConditionType, Objective } from './objective-types';

/**
 * Conditions that represent a player ACTION: a value set or a switch moved.
 * `requiresChange` defaults ON for these (see resolveRequiresChange).
 *
 * Left out on purpose (verify-type, default OFF):
 *  - safe-state checks (`hpa-disabled`, `buc-muted`, `tx-modem-not-transmitting`,
 *    `buc-loopback-disabled`, `tx-modem-loopback-disabled`): requiring a change
 *    would mean making the chain unsafe first to tick "make it safe". The
 *    intent lint flags them when they are true at scenario start.
 *  - `antenna-position`: a tracking antenna moves every frame, so a "change"
 *    would be meaningless; it reads as "the antenna is at".
 */
export const SET_TYPE_CONDITIONS: ReadonlySet<ConditionType> = new Set<ConditionType>([
  // Powered/enabled toggles
  'equipment-powered',
  'equipment-not-powered',
  'feed-heater-enabled',
  'buc-unmuted',
  'hpa-enabled',
  'buc-loopback-enabled',
  'tx-modem-loopback-enabled',
  'tx-modem-transmitting',
  'tx-active-modem',
  'receiver-afc-enabled',
  'uplink-doppler-comp-enabled',
  // *-set / *-mode-set
  'lnb-lo-set',
  'lnb-gain-set',
  'buc-gain-set',
  'hpa-back-off-set',
  'frequency-set',
  'speca-span-set',
  'speca-rbw-set',
  'speca-reference-level-set',
  'speca-center-frequency',
  'speca-min-amplitude',
  'speca-max-amplitude',
  'filter-bandwidth-set',
  'notch-filter-configured',
  'antenna-beacon-frequency-set',
  'antenna-tracking-mode-set',
  'antenna-polarization-set',
  'rx-modem-frequency-set',
  'rx-modem-bandwidth-set',
  'rx-modem-modulation-set',
  'rx-modem-fec-set',
  'tx-modem-frequency-set',
  'tx-modem-power-set',
  'tx-modem-bandwidth-set',
  'tx-modem-modulation-set',
  'tx-modem-fec-set',
  'transec-mode-set',
  'gpsdo-reference-mode-set',
  'access-control-set',
]);

/** Rows answered rather than done: they never keep an objective's countdown running (Q1) */
export const QUIZ_CONDITION_TYPES: ReadonlySet<ConditionType> = new Set<ConditionType>(['status-check', 'decision']);

/**
 * Rows that wait on the scenario clock rather than on the player: a scheduled
 * event ending, a fault tripping, a reference settling. An objective time skip
 * with `availableAfterConditions` is offered once everything else is met.
 */
export const TIME_GATED_CONDITION_TYPES: ReadonlySet<ConditionType> = new Set<ConditionType>([
  'weather-event-ended',
  'weather-event-peaked',
  'scenario-time-reached',
  'interference-event-ended',
  'hardware-fault-tripped',
  'gpsdo-time-offset-stable',
  'gpsdo-time-offset-exceeds',
]);

/**
 * Phase 29 D7 (nats-r4-s20-F1): analyzer settings the player applies. Their
 * row ticks on the first frame the applied value is in tolerance (on its
 * observation tab, if it has one); an authored observationDwellSeconds is
 * ignored, because a hidden 5 s read of a value the player just typed looked
 * like the checklist had missed it. A row that really must be held says so:
 * mustMaintain + maintainDuration, with "held N s" in its description.
 */
export const ANALYZER_SETTING_CONDITIONS: ReadonlySet<ConditionType> = new Set<ConditionType>([
  'speca-span-set',
  'speca-rbw-set',
  'speca-reference-level-set',
  'speca-center-frequency',
  'speca-min-amplitude',
  'speca-max-amplitude',
]);

/** Seconds a requiresObservation row must read true on its tab before it latches */
export function observationDwellSeconds(condition: Condition, defaultSeconds: number): number {
  if (ANALYZER_SETTING_CONDITIONS.has(condition.type)) {
    return 0;
  }

  return condition.params?.observationDwellSeconds ?? defaultSeconds;
}

export function isSetTypeCondition(type: ConditionType): boolean {
  return SET_TYPE_CONDITIONS.has(type);
}

export function isQuizCondition(type: ConditionType): boolean {
  return QUIZ_CONDITION_TYPES.has(type);
}

/**
 * B8: a `mustMaintain` row with no `maintainDuration` (or one flagged
 * `maintainUntilObjectiveComplete`) must hold at the moment the objective
 * completes. It used to latch after one tick, so a transient true (a C/N
 * spike) completed a "keep it above" row.
 */
export function holdsAtCompletion(condition: Condition, objective?: Pick<Objective, 'conditions'>): boolean {
  if (objective && isTabGate(condition, objective) && condition.maintainUntilObjectiveComplete !== true && !condition.maintainDuration) {
    return false; // D5: a quiz-step tab gate latches once opened
  }

  return condition.maintainUntilObjectiveComplete === true || (condition.mustMaintain && !condition.maintainDuration);
}

/**
 * Phase 29 D5 (nats-r4-s08-F5, s17-F2): a tab-active row on an objective that
 * asks a quiz or decision is a GATE: "look at this tab, then answer". It is
 * shown from the step's start (even when authored `hidden`) and LATCHES once
 * the tab has been opened, so answering the quiz on another tab does not leave
 * the step In Progress until the tab is reopened.
 *
 * `mustMaintain: true` alone does not keep it held: 230 of 283 authored tab
 * rows carry it as boilerplate. A step whose text says to STAY on the tab opts
 * in with `maintainUntilObjectiveComplete: true` (or a `maintainDuration`,
 * which accrues only while the tab is open).
 */
export function isTabGate(condition: Condition, objective: Pick<Objective, 'conditions'>): boolean {
  return condition.type === 'tab-active' && objective.conditions.some((other) => isQuizCondition(other.type));
}

/** Stable comparison key for "the same check": type plus its params, keys sorted */
function conditionKey_(condition: Condition): string {
  const params = condition.params ?? {};
  const sorted = Object.keys(params)
    .filter((key) => typeof params[key] !== 'function')
    .sort()
    .map((key) => [key, params[key]]);

  return `${condition.type}|${JSON.stringify(sorted)}`;
}

/**
 * Resolve the effective `requiresChange` of every condition in a scenario.
 *
 * Explicit `requiresChange` wins. Otherwise it is ON for a set-type condition
 * that is not observation-gated (`requiresObservation` rows are reads) and
 * unless an earlier objective in the same chain (a transitive prerequisite)
 * already asked for the same setting: then this row confirms the player's own
 * earlier work ("Heater Still Running") and requiring a fresh change would make
 * them undo it to tick it. Verify-type conditions default OFF.
 */
export function resolveRequiresChange(objectives: readonly Objective[]): Map<Condition, boolean> {
  const byId = new Map(objectives.map((objective) => [objective.id, objective]));
  const resolved = new Map<Condition, boolean>();

  const ancestorKeys = (objective: Objective): Set<string> => {
    const keys = new Set<string>();
    const seen = new Set<string>();
    const stack = [...(objective.prerequisiteObjectiveIds ?? [])];
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      const ancestor = byId.get(id);
      if (!ancestor) continue;
      for (const condition of ancestor.conditions) {
        keys.add(conditionKey_(condition));
      }
      stack.push(...(ancestor.prerequisiteObjectiveIds ?? []));
    }

    return keys;
  };

  for (const objective of objectives) {
    let earlier: Set<string> | null = null;
    for (const condition of objective.conditions) {
      if (condition.requiresChange !== undefined) {
        resolved.set(condition, condition.requiresChange);
        continue;
      }
      if (!isSetTypeCondition(condition.type)) {
        resolved.set(condition, false);
        continue;
      }
      // An observation-gated row is a reading ("read the LNB LO on RX
      // Analysis"): it already waits for the player to look at the panel, and
      // the value it reads is usually the station's standing configuration,
      // so demanding a change would make the player break the setting to
      // read it (the intent lint treats these rows as reads too)
      if (condition.params?.requiresObservation === true) {
        resolved.set(condition, false);
        continue;
      }
      earlier ??= ancestorKeys(objective);
      resolved.set(condition, !earlier.has(conditionKey_(condition)));
    }
  }

  return resolved;
}

/**
 * Snapshot of the value a condition compared, for "has it changed since
 * activation". Numbers are rounded so float noise in a settled reading does
 * not count as the player changing it.
 */
export function valueSnapshot(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return JSON.stringify(value, (_key, v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Number(v.toPrecision(9)) : v));
}
