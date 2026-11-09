/**
 * @file plant-event-controller - Objective-anchored plant events (Campaign 6, M02)
 * @description Fires authored events (fault injection, fault clearing, weather,
 * flags) once, after an anchor objective is live plus an offset. Same anchor
 * mechanism as HardwareFaultManager, so a slow player never misses an event.
 * Core stays DOM-free: it talks to a narrow `PlantEventTarget`, and the
 * service passes scenario seconds into `update`.
 *
 * Restore never re-applies actions: the plant state already holds their effects.
 */

import { ObjectiveAnchors } from '@app/objectives/objective-anchor';
import type { PlantEnvironment, PlantEventAction, PlantEventConfig, PlantFault } from './physical-plant-types';

/** What the controller may change; the service wires it to the plant */
export interface PlantEventTarget {
  injectFault(fault: PlantFault): void;
  clearFault(faultId: string): boolean;
  /** Starts a normal boot of the part (the staged recovery of S4); absent targets ignore the action */
  rebootPart?(partId: string): void;
  setWeather(weather: Partial<PlantEnvironment>): void;
  /** M15 policy and records actions; absent targets ignore the action */
  setAccount?(patch: Extract<PlantEventAction, { kind: 'set-account' }>['patch']): void;
  setProvider?(patch: Extract<PlantEventAction, { kind: 'set-provider' }>['patch']): void;
  setEndpoint?(patch: Extract<PlantEventAction, { kind: 'set-endpoint' }>['patch']): void;
  deliverNotice?(noticeId: string, version?: number): void;
  respondRequest?(requestId: string, status: 'approved' | 'rejected'): void;
  /** Optional ops-log line writer */
  log?(line: string): void;
  /** Called after an event's actions ran (M04 bumps its event epoch and stamps an evidence marker here) */
  onFire?(eventId: string, atS: number): void;
}

export type PlantFlagValue = string | number | boolean;

export interface PlantEventState {
  fired: Array<[string, number]>;
  anchors: Array<[string, number]>;
  flags: Record<string, PlantFlagValue>;
}

export class PlantEventController {
  private readonly events_: PlantEventConfig[];
  private readonly target_: PlantEventTarget;
  private readonly anchors_: ObjectiveAnchors;
  private readonly fired_ = new Map<string, number>();
  private flags_: Record<string, PlantFlagValue> = {};

  constructor(events: PlantEventConfig[], target: PlantEventTarget) {
    this.events_ = events;
    this.target_ = target;
    this.anchors_ = new ObjectiveAnchors(events.map((e) => e.startAfterObjectiveId));
  }

  /** Poll anchors and fire every due event, (requiresFired chains resolve within one call) */
  update(elapsedS: number): void {
    if (this.fired_.size === this.events_.length) {
      return;
    }
    this.anchors_.poll(elapsedS);
    // Repeat until nothing new fires, so requiresFired works whatever the authored order
    let firedAny = true;
    while (firedAny) {
      firedAny = false;
      for (const event of this.events_) {
        if (this.fired_.has(event.id)) {
          continue;
        }
        if (elapsedS < this.anchors_.atS(event.offsetS ?? 0, event.startAfterObjectiveId)) {
          continue;
        }
        if (event.requiresFired?.some((id) => !this.fired_.has(id))) {
          continue;
        }
        this.fire_(event, elapsedS);
        firedAny = true;
      }
    }
  }

  hasFired(id: string): boolean {
    return this.fired_.has(id);
  }

  firedAtS(id: string): number | null {
    return this.fired_.get(id) ?? null;
  }

  /** Number of events fired so far */
  get firedCount(): number {
    return this.fired_.size;
  }

  getFlag(key: string): PlantFlagValue | undefined {
    return this.flags_[key];
  }

  getFlags(): Record<string, PlantFlagValue> {
    return { ...this.flags_ };
  }

  getState(): PlantEventState {
    return { fired: [...this.fired_], anchors: this.anchors_.getState(), flags: { ...this.flags_ } };
  }

  /** Fired ids stay fired and never re-apply; anchors keep their original times */
  restoreState(state: PlantEventState | undefined): void {
    if (!state) {
      return;
    }
    this.fired_.clear();
    if (Array.isArray(state.fired)) {
      const known = new Set(this.events_.map((e) => e.id));
      for (const entry of state.fired) {
        if (Array.isArray(entry) && typeof entry[0] === 'string' && Number.isFinite(entry[1]) && known.has(entry[0])) {
          this.fired_.set(entry[0], entry[1]);
        }
      }
    }
    this.anchors_.restoreState(state.anchors);
    this.flags_ = { ...state.flags };
  }

  private fire_(event: PlantEventConfig, elapsedS: number): void {
    // Recorded before the actions run, so an action that throws cannot cause a re-fire
    this.fired_.set(event.id, elapsedS);
    for (const action of event.actions) {
      switch (action.kind) {
        case 'inject-fault':
          this.target_.injectFault(action.fault);
          break;
        case 'clear-fault':
          this.target_.clearFault(action.faultId);
          break;
        case 'reboot-part':
          this.target_.rebootPart?.(action.partId);
          break;
        case 'set-weather':
          this.target_.setWeather(action.weather);
          break;
        case 'set-flag':
          this.flags_[action.key] = action.value;
          break;
        case 'set-account':
          this.target_.setAccount?.(action.patch);
          break;
        case 'set-provider':
          this.target_.setProvider?.(action.patch);
          break;
        case 'set-endpoint':
          this.target_.setEndpoint?.(action.patch);
          break;
        case 'deliver-notice':
          this.target_.deliverNotice?.(action.noticeId, action.version);
          break;
        case 'respond-request':
          this.target_.respondRequest?.(action.requestId, action.status);
          break;
        default:
          break;
      }
    }
    if (event.logLine) {
      this.target_.log?.(event.logLine);
    }
    this.target_.onFire?.(event.id, elapsedS);
  }
}
