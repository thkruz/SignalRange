import { GroundStation } from '@app/assets/ground-station/ground-station';
import { OrbitalSatellite, observerFromLocation } from '@app/equipment/satellite/orbital-satellite';
import { Satellite } from '@app/equipment/satellite/satellite';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { DialogHistoryBox } from '@app/modal/dialog-history-box';
import { DraggableHtmlBox } from '@app/modal/draggable-html-box';
import { QuizManager } from '@app/modal/quiz-manager';
import { ObjectivesManager } from '@app/objectives';
import { EventAutoLogger } from '@app/ops-log/event-auto-logger';
import { OpsLogManager } from '@app/ops-log/ops-log-manager';
import { OpsLogModal } from '@app/ops-log/ops-log-modal';
import { Equipment } from '@app/pages/sandbox/equipment';
import { ScenarioManager } from '@app/scenario-manager';
import { resetMissionClock } from '@app/simulation/mission-clock';
import { createPropagationServiceFromRegistry } from '@app/simulation/propagation/propagation-service';
import { getProvidedTleSet, SatelliteRegistry } from '@app/simulation/satellite-registry';
import { FIXED_STEP_MS, SimClock } from '@app/simulation/sim-clock';
import { getSimulatedNowMs } from '@app/simulation/sim-time';
import { SMALL_SCENARIO_THRESHOLD, TierScheduler } from '@app/simulation/tier-scheduler';
import { TimeSkipController } from '@app/simulation/time-skip-controller';
import { RfSignal } from '@app/types';
import { ProgressSaveManager } from '@app/user-account/progress-save-manager';
import { UserDataService } from '@app/user-account/user-data-service';
import { Milliseconds } from 'ootk';

export class SimulationManager {
  private static instance_: SimulationManager;
  private lastFrameTime: number;
  private animationFrameId_: number | null = null;
  private isDestroyed_ = false;
  private readonly boundVisibilityHandler_ = this.handleVisibilityChange_.bind(this);
  equipment: Equipment | null = null;
  groundStations: GroundStation[] = [];
  isDeveloperMode = false;

  /** Simulation step emitted with Events.UPDATE (always FIXED_STEP_MS) */
  dt = FIXED_STEP_MS as Milliseconds;

  private registry_!: SatelliteRegistry;

  /**
   * Hydrated satellites: authored plus constellation members currently hydrated.
   * Live array owned by the registry. Assigning replaces the authored set (tests).
   */
  get satellites(): Satellite[] {
    return this.registry_.hydrated;
  }

  set satellites(authored: Satellite[]) {
    // Replaces the authored set (tests): the old scheduler is retired and the
    // new one is not started, so the satellites are not ticked unless asked.
    this.scheduler_?.dispose();
    this.registry_ = this.createRegistry_(authored);
    this.scheduler_ = new TierScheduler({ registry: this.registry_, now: getSimulatedNowMs });
  }

  private scheduler_!: TierScheduler;
  private unsubscribeClock_: (() => void) | null = null;

  /** Tier scheduler: the one Events.UPDATE subscriber that ticks satellites. */
  get scheduler(): TierScheduler {
    return this.scheduler_;
  }

  /** Hot satellites an antenna should consider (authored plus hydrated members), via the tier scheduler. */
  candidateSatellites(): readonly Satellite[] {
    return this.scheduler_.candidatesFor();
  }

  /** Authored plus pinned satellites that are orbital: what per-satellite UI (timeline, embed host) lists at scale. */
  trackedOrbitalSatellites(): OrbitalSatellite[] {
    return this.registry_.tracked().filter((sat): sat is OrbitalSatellite => sat instanceof OrbitalSatellite);
  }

  /** Whether the scenario has orbital satellites: constellation members (hydrated or not) or authored ones. */
  hasOrbitalSatellites(): boolean {
    return this.registry_.memberCount > 0 || this.registry_.hydrated.some((sat) => sat instanceof OrbitalSatellite);
  }

  /** Every satellite in the scenario, hydrated or not. Use `registry.get(norad)` instead of scanning `satellites`. */
  get registry(): SatelliteRegistry {
    return this.registry_;
  }

  satelliteSignals: RfSignal[];
  userSignals: RfSignal[] = [];
  objectivesManager: ObjectivesManager;
  progressSaveManager: ProgressSaveManager;
  userDataServices: UserDataService;

  missionBriefBox?: DraggableHtmlBox;
  checklistBox?: DraggableHtmlBox;
  dialogHistoryBox?: DialogHistoryBox;

  private constructor() {
    this.progressSaveManager = new ProgressSaveManager();

    const settings = ScenarioManager.getInstance().settings;
    this.registry_ = this.createRegistry_(settings.satellites);
    for (const ref of settings.constellations ?? []) {
      const set = getProvidedTleSet(ref.tleSet);
      if (set) {
        this.registry_.addConstellation(set, ref);
      } else {
        console.warn(`[SatelliteRegistry] TLE set "${ref.tleSet}" was not loaded before the scenario started`);
      }
    }

    // Satellites are module singletons that outlive a scenario: uplinks the
    // last run's antennas left on them would be relayed beside this run's own
    // carriers as co-channel copies (phase 27: arrivals are no longer merged)
    this.satellites.forEach((sat) => {
      sat.rxSignal = [];
    });

    this.satelliteSignals = this.satellites.flatMap((sat) => sat.txSignal);

    // One scheduler-driven update replaces each satellite's own UPDATE subscription.
    // It subscribes here, where the satellites used to, so tick order against the
    // other subscribers is unchanged.
    const stations = (settings.groundStations ?? []).map((gs) => ({
      latDeg: gs.location.latitude,
      lonDeg: gs.location.longitude,
      altKm: gs.location.elevation / 1000,
    }));
    const tiered = this.registry_.memberCount > 0 && this.registry_.size >= SMALL_SCENARIO_THRESHOLD && stations.length > 0;
    this.scheduler_ = new TierScheduler({
      registry: this.registry_,
      service: tiered ? createPropagationServiceFromRegistry(this.registry_, stations) : null,
      stations,
      now: getSimulatedNowMs,
      speed: () => SimClock.speed,
      nextStepMs: () => getSimulatedNowMs() + (SimClock.isPaused('scenario') ? 0 : FIXED_STEP_MS),
    });
    this.scheduler_.start();
    // Time skips and checkpoint restores jump the clock: cached samples are stale
    this.unsubscribeClock_ = SimClock.onChange((change) => {
      if (change === 'jump') {
        this.scheduler_.invalidate();
      }
    });

    this.lastFrameTime = performance.now();

    // A hidden tab stops the whole simulation (plan Q3): nobody is training,
    // and resuming must not replay the absence as one giant step
    document.addEventListener('visibilitychange', this.boundVisibilityHandler_);
    if (document.hidden) {
      SimClock.pause('hidden');
    }
    // Start the loop on the NEXT frame, not synchronously. Running update()
    // inside the constructor emits Events.UPDATE before getInstance() has
    // assigned `instance_`; any condition/handler that calls
    // SimulationManager.getInstance() during that first tick would re-enter
    // this constructor and recurse infinitely (Maximum call stack size
    // exceeded). Deferring to requestAnimationFrame lets the constructor
    // return and `instance_` be assigned before the first tick fires.
    this.animationFrameId_ = requestAnimationFrame(this.gameLoop_.bind(this));
  }

  static getInstance(): SimulationManager {
    if (!this.instance_) {
      this.instance_ = new SimulationManager();
      window.signalRange.simulationManager = this.instance_;
    }
    return this.instance_;
  }

  /** Whether a SimulationManager already exists (does not construct one). */
  static hasInstance(): boolean {
    return !!this.instance_;
  }

  private gameLoop_(): void {
    // Stop the loop if destroyed
    if (this.isDestroyed_) {
      return;
    }

    const now = performance.now();
    const frameMs = now - this.lastFrameTime;
    this.lastFrameTime = now;

    this.advance(frameMs);
    this.draw(frameMs as Milliseconds);
    this.animationFrameId_ = requestAnimationFrame(this.gameLoop_.bind(this));
  }

  /**
   * Run the fixed simulation steps owed for `frameMs` of real time. Every
   * UPDATE carries exactly FIXED_STEP_MS, so the simulation is identical at
   * any frame rate. Public for headless harnesses, which drive it directly.
   */
  advance(frameMs: number): void {
    const steps = SimClock.consumeFrame(frameMs);
    for (let i = 0; i < steps; i++) {
      // Hold the sim a frame rather than compute grid points here when the propagation worker is behind
      if (!this.scheduler_.canStep()) {
        SimClock.deferSteps(steps - i);
        break;
      }
      SimClock.step();
      this.update(this.dt);
    }
  }

  private handleVisibilityChange_(): void {
    if (document.hidden) {
      SimClock.pause('hidden');
    } else {
      SimClock.resume('hidden');
      this.lastFrameTime = performance.now();
    }
  }

  private update(_dt: Milliseconds): void {
    EventBus.getInstance().emit(Events.UPDATE, _dt);
  }

  private draw(_dt: Milliseconds): void {
    EventBus.getInstance().emit(Events.DRAW, _dt);
  }

  sync(): void {
    EventBus.getInstance().emit(Events.SYNC);
  }

  getSatByNoradId(noradId: number): Satellite | undefined {
    return this.registry_.get(noradId);
  }

  /** Registry for a satellite list; hydration wires members into the event bus and signal list. */
  private createRegistry_(authored: Satellite[]): SatelliteRegistry {
    const station = ScenarioManager.getInstance().settings.groundStations?.[0];
    return new SatelliteRegistry(authored, {
      observer: station ? observerFromLocation(station.location, station.name) : undefined,
      now: getSimulatedNowMs,
      onHydrated: (sat) => {
        sat.rxSignal = [];
        this.satelliteSignals?.push(...sat.txSignal);
      },
      onReleased: (sat) => {
        const gone = new Set(sat.txSignal);
        this.satelliteSignals = this.satelliteSignals?.filter((sig) => !gone.has(sig));
      },
    });
  }

  static destroy(): void {
    if (SimulationManager.instance_) {
      // Stop the animation loop
      SimulationManager.instance_.isDestroyed_ = true;
      SimulationManager.instance_.scheduler_?.dispose();
      SimulationManager.instance_.unsubscribeClock_?.();
      document.removeEventListener('visibilitychange', SimulationManager.instance_.boundVisibilityHandler_);
      if (SimulationManager.instance_.animationFrameId_ !== null) {
        cancelAnimationFrame(SimulationManager.instance_.animationFrameId_);
        SimulationManager.instance_.animationFrameId_ = null;
      }

      SimulationManager.instance_.checklistBox?.close();
      SimulationManager.instance_.missionBriefBox?.close();
      SimulationManager.instance_ = null;
    }

    // Stop any running fast-forward before the clocks it drives go away, then
    // drop the skipped time - otherwise the next scenario starts with its
    // elapsed-keyed mechanics already past their trigger times.
    TimeSkipController.destroy();
    resetMissionClock();

    // Clean up singleton managers
    ObjectivesManager.destroy();
    QuizManager.destroy();
    EventAutoLogger.destroy();
    OpsLogManager.destroy();
    OpsLogModal.destroy();
  }
}
