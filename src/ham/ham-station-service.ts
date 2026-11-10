/**
 * @file ham-station-service - App wiring for the Campaign 3 station manager
 * @description Started by the page when `settings.hamStation` is set. Builds the singleton
 * manager, ticks it from `Events.UPDATE` on scenario time, supplies satellite geometry from the
 * simulation, emits a throttled `Events.HAM_STATION_UPDATED`, and installs the quiz pause when
 * the config asks for it. `destroy()` undoes all of it; other campaigns never start it.
 */

import { OrbitalSatellite, observerFromLocation } from '@app/equipment/satellite/orbital-satellite';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { ScenarioManager } from '@app/scenario-manager';
import { SimClock } from '@app/simulation/sim-clock';
import { SimulationManager } from '@app/simulation/simulation-manager';
import type { HamStationConfig } from './ham-station-config';
import { HamStationManager } from './ham-station-manager';
import type { SatGeometry } from './ops/satellite-link';
import { installQuizPause } from './quiz/quiz-pause';

/** Satellite geometry from the running simulation (first ground station as observer) */
export function simulationGeometry(noradId: number): SatGeometry | null {
  if (!SimulationManager.hasInstance()) return null;
  const sim = SimulationManager.getInstance();
  const sat = sim.getSatByNoradId(noradId);
  const gs = sim.groundStations?.[0];
  if (!(sat instanceof OrbitalSatellite) || !gs) return null;
  const g = sat.geometryFor(observerFromLocation(gs.state.location));

  return { az: g.az as number, el: g.el as number, rangeKm: g.rangeKm as number, dopplerFactor: g.dopplerFactor, isAboveHorizon: g.isAboveHorizon };
}

export class HamStationService {
  private static instance_: HamStationService | null = null;
  /** HAM_STATION_UPDATED at most 4 times a second */
  private static readonly EMIT_INTERVAL_MS = 250;

  readonly manager: HamStationManager;
  private readonly boundUpdateHandler_: () => void;
  private readonly uninstallQuizPause_: (() => void) | null;
  private lastSyncS_: number;
  private lastEmitMs_ = 0;

  private constructor(config: HamStationConfig) {
    const nowS = SimClock.scenarioElapsedMs() / 1000;
    this.lastSyncS_ = nowS;
    this.manager = HamStationManager.initialize(config, {
      nowS,
      geometry: (id) => simulationGeometry(id),
      onUpdate: (stateVersion, t) => this.emit_(stateVersion, t),
    });
    this.uninstallQuizPause_ = config.pauseOnQuiz ? installQuizPause() : null;
    this.boundUpdateHandler_ = this.sync_.bind(this);
    EventBus.getInstance().on(Events.UPDATE, this.boundUpdateHandler_);
  }

  /** Start the station for the current scenario; null when it has no `hamStation` */
  static start(): HamStationService | null {
    if (this.instance_) return this.instance_;
    const config = ScenarioManager.getInstance().settings.hamStation;
    if (!config) return null;
    this.instance_ = new HamStationService(config);

    return this.instance_;
  }

  static isInitialized(): boolean {
    return this.instance_ !== null;
  }

  static getInstance(): HamStationService | null {
    return this.instance_;
  }

  static destroy(): void {
    if (this.instance_) {
      EventBus.getInstance().off(Events.UPDATE, this.instance_.boundUpdateHandler_);
      this.instance_.uninstallQuizPause_?.();
    }
    this.instance_ = null;
    HamStationManager.destroy();
  }

  private sync_(): void {
    const nowS = SimClock.scenarioElapsedMs() / 1000;
    if (nowS <= this.lastSyncS_) return;
    this.lastSyncS_ = nowS;
    this.manager.tick(nowS);
  }

  private emit_(stateVersion: number, nowS: number): void {
    const now = Date.now();
    if (now - this.lastEmitMs_ < HamStationService.EMIT_INTERVAL_MS) return;
    this.lastEmitMs_ = now;
    EventBus.getInstance().emit(Events.HAM_STATION_UPDATED, { stateVersion, nowS });
  }

  /** UI actions bypass the throttle so a click shows at once */
  flush(): void {
    this.lastEmitMs_ = Date.now();
    EventBus.getInstance().emit(Events.HAM_STATION_UPDATED, { stateVersion: this.manager.stateVersion, nowS: this.manager.nowS });
  }
}
