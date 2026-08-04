/**
 * @file SpaceEventManager - Space-domain events / ephemeris management (nats-eu M4)
 * @description Schedules on-orbit events (a conjunction-avoidance burn, a
 * station-keeping maneuver) that invalidate a satellite's authored TLE. When the
 * event fires the ephemeris goes "stale": pass predictions and pointing drift
 * against the old element set. A "new ephemeris available" notice appears; the
 * operator loads the updated TLE, which reloads the OrbitalSatellite and restores
 * accurate telemetry. The ephemeris-updated objective condition reads that.
 *
 * Started only when settings.spaceEvents is present. Subscribes to Events.UPDATE
 * to fire maneuvers on the mission clock; tests can call triggerManeuver()
 * directly for determinism.
 */

import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { OrbitalSatellite } from '@app/equipment/satellite/orbital-satellite';
import { ScenarioManager } from '@app/scenario-manager';
import { missionNowMs } from '@app/simulation/mission-clock';
import { SimulationManager } from '@app/simulation/simulation-manager';
import type { Milliseconds, TleLine1, TleLine2 } from 'ootk';

/** settings.spaceEvents[] */
export interface SpaceEventConfig {
  id: string;
  /** Satellite whose ephemeris the maneuver invalidates */
  satelliteNoradId: number;
  /** Elapsed second (since mission start) the maneuver fires */
  maneuverAtS: number;
  /** Updated element set the operator loads after the maneuver */
  newTle: { tle1: string; tle2: string };
  /** Ops-log / notice label */
  label?: string;
  /**
   * Opt-in (Campaign 3 S6): element set forced onto the satellite when the
   * manager starts - the "tampered/stale TLE" the scenario BOOTS with, while
   * newTle carries the authored truth. Applied on every scenario load, so a
   * replay re-tampers the (module-shared, mutated-by-reloadTle) satellite
   * instance and the puzzle survives Play Again. Absent = legacy behavior.
   */
  initialTle?: { tle1: string; tle2: string };
}

export type EphemerisPhase = 'nominal' | 'stale' | 'updated';

export class SpaceEventManager {
  private static instance_: SpaceEventManager | null = null;

  private readonly events_: SpaceEventConfig[];
  private readonly phase_ = new Map<string, EphemerisPhase>();
  private readonly missionStartTime_ = missionNowMs();
  private readonly boundUpdateHandler_: (dt: Milliseconds) => void;

  private constructor() {
    this.events_ = (ScenarioManager.getInstance().settings.spaceEvents as SpaceEventConfig[] | undefined) ?? [];
    this.events_.forEach((e) => this.phase_.set(e.id, 'nominal'));
    this.applyInitialTles_();
    this.boundUpdateHandler_ = this.update_.bind(this);
    EventBus.getInstance().on(Events.UPDATE, this.boundUpdateHandler_);
  }

  /** Force any authored initial (tampered/stale) element sets onto their birds */
  private applyInitialTles_(): void {
    if (!SimulationManager.hasInstance()) {
      return;
    }
    for (const event of this.events_) {
      if (!event.initialTle) {
        continue;
      }
      const sat = SimulationManager.getInstance().satellites.find((s) => s.noradId === event.satelliteNoradId);
      if (sat instanceof OrbitalSatellite) {
        sat.reloadTle(event.initialTle.tle1 as TleLine1, event.initialTle.tle2 as TleLine2);
      }
    }
  }

  static getInstance(): SpaceEventManager {
    this.instance_ ??= new SpaceEventManager();

    return this.instance_;
  }

  static isInitialized(): boolean {
    return this.instance_ !== null;
  }

  static destroy(): void {
    if (this.instance_) {
      EventBus.getInstance().off(Events.UPDATE, this.instance_.boundUpdateHandler_);
      this.instance_ = null;
    }
  }

  /** Current ephemeris phase for an event (nominal until its maneuver fires). */
  getPhase(eventId: string): EphemerisPhase {
    return this.phase_.get(eventId) ?? 'nominal';
  }

  /** Events whose ephemeris is currently stale (a notice should be shown). */
  getStaleEvents(): SpaceEventConfig[] {
    return this.events_.filter((e) => this.phase_.get(e.id) === 'stale');
  }

  /** Every configured event, for the operator-facing ephemeris panel. */
  getEvents(): readonly SpaceEventConfig[] {
    return this.events_;
  }

  /** Force the maneuver (used by the tick and by tests) - marks ephemeris stale. */
  triggerManeuver(eventId: string): void {
    if (this.phase_.get(eventId) === 'nominal') {
      this.phase_.set(eventId, 'stale');
    }
  }

  /**
   * Load the updated ephemeris after a maneuver: reloads the OrbitalSatellite's
   * TLE (best-effort - only if the sat is present and orbital) and marks the
   * event updated.
   */
  applyEphemerisUpdate(eventId: string): void {
    const event = this.events_.find((e) => e.id === eventId);
    if (!event || this.phase_.get(eventId) !== 'stale') {
      return;
    }
    // Reload the TLE only when a simulation is actually running (in-app). Guard
    // with hasInstance() so this never constructs the heavy sim singleton
    // (headless tests just verify the phase transition).
    if (SimulationManager.hasInstance()) {
      const sat = SimulationManager.getInstance().satellites.find((s) => s.noradId === event.satelliteNoradId);
      if (sat instanceof OrbitalSatellite) {
        sat.reloadTle(event.newTle.tle1 as TleLine1, event.newTle.tle2 as TleLine2);
      }
    }
    this.phase_.set(eventId, 'updated');
  }

  /** Whether an event's ephemeris has been updated (or, with no id, all stale ones cleared). */
  isEphemerisUpdated(eventId?: string): boolean {
    if (eventId) {
      return this.phase_.get(eventId) === 'updated';
    }
    // With no id: at least one event has occurred and none remain stale.
    const phases = new Set(this.phase_.values());

    return phases.has('updated') && !phases.has('stale');
  }

  private update_(): void {
    const elapsed = (missionNowMs() - this.missionStartTime_) / 1000;
    for (const event of this.events_) {
      if (elapsed >= event.maneuverAtS && this.phase_.get(event.id) === 'nominal') {
        this.phase_.set(event.id, 'stale');
      }
    }
  }
}
