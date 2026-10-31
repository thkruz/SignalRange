/**
 * @file event-time-ledger - When things happened, on the scenario clock (Phase 35 D8)
 * @description Quiz text, Working Document lines, Ops Log decision lines and
 * objective text used to name clock times as literals ("02:59", "09:25"). Those
 * times are anchored or player-driven, so the authored number was right only by
 * chance. The ledger records the real time of each event and the text tokens
 * (`dialog-tokens.ts`) read it back.
 *
 * Keys (all times are scenario-clock UTC ms, as the Ops Log prints them):
 * - `obj:<id>` completed, `obj:<id>:start` activated
 * - `cond:<objId>.<n>` condition first satisfied (n = conditionIndex)
 * - `val:<objId>.<n>` value the condition observed when first satisfied (number)
 * - `cmd:<ID>:sent` / `:ack` / `:nak` first TT&C command record with that id
 * - `event:<id>:start` / `:end` interference, weather and hardware-fault events (resolved from the
 *   managers' schedules, so anchored times resolve once the anchor is live) and
 *   injected faults (`FAULT_CHANGED`)
 * - `account:<id>:<status>` first time the security console account read that status
 * - `security:<eventId>:flagged` the operator flagged (acknowledged) the audit entry
 *
 * Event-sourced keys (obj, cond, val, account, security, faults) are recorded
 * from the EventBus and a per-update poll between `begin()` and `end()`.
 * Schedule keys (cmd, interference, weather) are read live at lookup, so they
 * need no recording.
 */

import type { CommandingManager } from '@app/commanding/commanding-manager';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import type { HardwareFaultManager } from '@app/faults/hardware-fault-manager';
import type { InterferenceManager } from '@app/interference/interference-manager';
import type { SecurityConsoleCore } from '@app/security-console/security-console-core';
import { SimClock } from '@app/simulation/sim-clock';
import type { EventLedgerSnapshot } from '@app/sync/manager-state-types';
import type { WeatherManager } from '@app/weather/weather-manager';

/** `cmd:<ID>:<phase>` */
const CMD_KEY = /^cmd:(.+):(sent|ack|nak)$/;
/** `event:<id>:<start|end>` */
const EVENT_KEY = /^event:(.+):(start|end)$/;

/** Live manager lookups; each returns undefined while that manager is not running. */
export interface LedgerSources {
  commanding?: () => CommandingManager | undefined;
  interference?: () => InterferenceManager | undefined;
  weather?: () => WeatherManager | undefined;
  hardwareFault?: () => HardwareFaultManager | undefined;
  security?: () => SecurityConsoleCore | undefined;
  objectiveState?: (objectiveId: string) => { activatedAt?: number; completedAt?: number } | undefined;
}

export class EventTimeLedger {
  /**
   * Set by WorkingDocumentManager.initialize (and tests). Injected rather than
   * imported: the managers sit in the same import graph as the modal code that
   * fills tokens, and importing them here made a cycle.
   */
  private static sources_: LedgerSources = {};

  static setSources(sources: LedgerSources): void {
    EventTimeLedger.sources_ = sources;
  }

  private static times_ = new Map<string, number>();
  private static values_ = new Map<string, number>();
  private static active_ = false;
  /** Account statuses already stamped, so a status is recorded once */
  private static seenAccounts_ = new Set<string>();

  private static readonly onActivated_ = (data: { objectiveId: string; activatedAt?: number }): void => {
    EventTimeLedger.stamp_(`obj:${data.objectiveId}:start`);
  };
  private static readonly onCompleted_ = (data: { objectiveId: string }): void => {
    EventTimeLedger.stamp_(`obj:${data.objectiveId}`);
  };
  private static readonly onConditionChanged_ = (data: { objectiveId: string; conditionIndex: number; isSatisfied: boolean }): void => {
    if (data.isSatisfied) EventTimeLedger.stamp_(`cond:${data.objectiveId}.${data.conditionIndex}`);
  };
  private static readonly onConditionEvaluated_ = (data: { objectiveId: string; conditionIndex: number; isSatisfied: boolean; observed: unknown }): void => {
    if (!data.isSatisfied || typeof data.observed !== 'number' || !Number.isFinite(data.observed)) return;
    const key = `${data.objectiveId}.${data.conditionIndex}`;
    if (!EventTimeLedger.values_.has(key)) EventTimeLedger.values_.set(key, data.observed);
  };
  private static readonly onFaultChanged_ = (data: { id: string; action: 'injected' | 'cleared' }): void => {
    EventTimeLedger.stamp_(`event:${data.id}:${data.action === 'injected' ? 'start' : 'end'}`);
  };
  private static readonly onUpdate_ = (): void => {
    EventTimeLedger.poll_();
  };

  /** Start recording for a new scenario run (clears the previous run's entries). */
  static begin(): void {
    EventTimeLedger.end();
    EventTimeLedger.times_ = new Map();
    EventTimeLedger.values_ = new Map();
    EventTimeLedger.seenAccounts_ = new Set();
    EventTimeLedger.active_ = true;
    const bus = EventBus.getInstance();
    bus.on(Events.OBJECTIVE_ACTIVATED, EventTimeLedger.onActivated_);
    bus.on(Events.OBJECTIVE_COMPLETED, EventTimeLedger.onCompleted_);
    bus.on(Events.OBJECTIVE_CONDITION_CHANGED, EventTimeLedger.onConditionChanged_);
    bus.on(Events.OBJECTIVE_CONDITION_EVALUATED, EventTimeLedger.onConditionEvaluated_);
    bus.on(Events.FAULT_CHANGED, EventTimeLedger.onFaultChanged_);
    bus.on(Events.UPDATE, EventTimeLedger.onUpdate_);
  }

  /** Snapshot for a checkpoint (Phase 35 rt-s24-F4). */
  static getState(): EventLedgerSnapshot {
    return { times: [...EventTimeLedger.times_], values: [...EventTimeLedger.values_], seenAccounts: [...EventTimeLedger.seenAccounts_] };
  }

  /**
   * Restore a snapshot after begin() and after the objectives restore. Saved
   * entries win over anything the restore itself stamped (e.g. an
   * OBJECTIVE_ACTIVATED re-emitted during restoreState at the new clock).
   */
  static restoreState(snapshot: EventLedgerSnapshot | undefined): void {
    if (!snapshot) {
      return;
    }
    for (const [k, v] of snapshot.times ?? []) {
      if (typeof k === 'string' && Number.isFinite(v)) {
        EventTimeLedger.times_.set(k, v);
      }
    }
    for (const [k, v] of snapshot.values ?? []) {
      if (typeof k === 'string' && Number.isFinite(v)) {
        EventTimeLedger.values_.set(k, v);
      }
    }
    for (const a of snapshot.seenAccounts ?? []) {
      if (typeof a === 'string') {
        EventTimeLedger.seenAccounts_.add(a);
      }
    }
  }

  /** Stop listening (entries stay readable until the next begin). */
  static end(): void {
    if (!EventTimeLedger.active_) return;
    EventTimeLedger.active_ = false;
    const bus = EventBus.getInstance();
    bus.off(Events.OBJECTIVE_ACTIVATED, EventTimeLedger.onActivated_);
    bus.off(Events.OBJECTIVE_COMPLETED, EventTimeLedger.onCompleted_);
    bus.off(Events.OBJECTIVE_CONDITION_CHANGED, EventTimeLedger.onConditionChanged_);
    bus.off(Events.OBJECTIVE_CONDITION_EVALUATED, EventTimeLedger.onConditionEvaluated_);
    bus.off(Events.FAULT_CHANGED, EventTimeLedger.onFaultChanged_);
    bus.off(Events.UPDATE, EventTimeLedger.onUpdate_);
  }

  /** Record `key` at the scenario clock now, first time only. */
  static record(key: string, atMs: number = SimClock.nowMs()): void {
    if (!EventTimeLedger.times_.has(key)) EventTimeLedger.times_.set(key, atMs);
  }

  /** Record an observed value (first time only). Normally fed by the evaluator events. */
  static recordValue(objectiveCondition: string, value: number): void {
    if (!EventTimeLedger.values_.has(objectiveCondition)) EventTimeLedger.values_.set(objectiveCondition, value);
  }

  /** Scenario-clock UTC ms of `key`, or undefined when it has not happened or cannot be resolved. */
  static getTime(key: string): number | undefined {
    const recorded = EventTimeLedger.times_.get(key);
    if (recorded !== undefined) return recorded;

    return EventTimeLedger.resolveSchedule_(key);
  }

  /** Observed value for `<objId>.<n>` (a leading `val:` is accepted). */
  static getValue(key: string): number | undefined {
    return EventTimeLedger.values_.get(key.startsWith('val:') ? key.slice(4) : key);
  }

  private static stamp_(key: string): void {
    EventTimeLedger.record(key);
  }

  /** Mission-elapsed seconds to scenario-clock ms. */
  private static elapsedToMs_(elapsedS: number): number | undefined {
    if (!Number.isFinite(elapsedS)) return undefined;

    return SimClock.nowMs() - SimClock.scenarioElapsedMs() + elapsedS * 1000;
  }

  private static resolveSchedule_(key: string): number | undefined {
    const cmd = CMD_KEY.exec(key);
    if (cmd) return EventTimeLedger.commandTime_(cmd[1], cmd[2]);

    const event = EVENT_KEY.exec(key);
    if (event) return EventTimeLedger.eventTime_(event[1], event[2] === 'end');

    // Objective keys fall back to the objective state (covers objectives that were live before begin())
    const objective = /^obj:([^:]+)(:start)?$/.exec(key);
    if (objective) {
      const state = EventTimeLedger.sources_.objectiveState?.(objective[1]);
      const at = objective[2] ? state?.activatedAt : state?.completedAt;

      return typeof at === 'number' ? at : undefined;
    }

    return undefined;
  }

  private static commandTime_(id: string, phase: string): number | undefined {
    const manager = EventTimeLedger.sources_.commanding?.();
    if (!manager) return undefined;
    const wanted = phase === 'ack' ? 'acked' : phase === 'nak' ? 'rejected' : undefined;
    let first: number | undefined;
    for (const record of manager.state.commands) {
      if (record.id !== id || (wanted && record.status !== wanted) || record.elapsedS === undefined) continue;
      if (first === undefined || record.elapsedS < first) first = record.elapsedS;
    }

    return first === undefined ? undefined : EventTimeLedger.elapsedToMs_(first);
  }

  private static eventTime_(id: string, isEnd: boolean): number | undefined {
    const interference = EventTimeLedger.sources_.interference?.();
    const interferenceEvent = interference?.getEvents().find((e) => e.id === id);
    if (interference && interferenceEvent) {
      return EventTimeLedger.elapsedToMs_(isEnd ? interference.endS(interferenceEvent) : interference.startS(interferenceEvent));
    }

    const weather = EventTimeLedger.sources_.weather?.();
    const weatherEvent = weather?.getAllWeatherEvents().find((e) => e.id === id);
    if (weatherEvent) {
      if (weatherEvent.isAwaitingAnchor) return undefined;

      return EventTimeLedger.elapsedToMs_(weatherEvent.startTime + (isEnd ? weatherEvent.duration : 0));
    }

    const hardware = EventTimeLedger.sources_.hardwareFault?.();
    const schedule = hardware?.getEventScheduleS(id);
    if (schedule) {
      const at = isEnd ? schedule.endS : schedule.startS;

      return at === null ? undefined : EventTimeLedger.elapsedToMs_(at);
    }

    return undefined;
  }

  /** Sample the managers whose state changes without an event (accounts, flagged audit entries). */
  private static poll_(): void {
    const security = EventTimeLedger.sources_.security?.();
    if (!security) return;

    const config = security.getConfig();
    for (const account of config.accounts) {
      const status = security.getAccountStatus(account.id);
      if (status === undefined) continue;
      const key = `account:${account.id}:${status}`;
      if (!EventTimeLedger.seenAccounts_.has(key)) {
        EventTimeLedger.seenAccounts_.add(key);
        EventTimeLedger.record(key);
      }
    }
    for (const event of config.events) {
      if (security.isEventAcknowledged(event.id)) EventTimeLedger.record(`security:${event.id}:flagged`);
    }
  }
}
