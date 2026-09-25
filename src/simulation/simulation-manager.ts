import { GroundStation } from '@app/assets/ground-station/ground-station';
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
import { FIXED_STEP_MS, SimClock } from '@app/simulation/sim-clock';
import { TimeSkipController } from '@app/simulation/time-skip-controller';
import { RfSignal } from '@app/types';
import { ProgressSaveManager } from '@app/user-account/progress-save-manager';
import { UserDataService } from '@app/user-account/user-data-service';
import { Degrees, Milliseconds } from 'ootk';

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

  satellites: Satellite[] = [];
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

    this.satellites = ScenarioManager.getInstance().settings.satellites;

    // Subscribe satellites to current EventBus (they may have been created before EventBus was ready)
    this.satellites.forEach((sat) => sat.subscribeToEventBus());

    this.satelliteSignals = this.satellites.flatMap((sat) => sat.txSignal);

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
    return this.satellites.find((sat) => sat.noradId === noradId);
  }

  getSatsByAzEl(az: Degrees, el: Degrees): Satellite[] {
    return this.satellites.filter((sat) => {
      // If +/- 2 degrees of az/el, consider it a match since the receive side will have more filtering
      const azDiff = Math.abs(sat.az - az);
      const elDiff = Math.abs(sat.el - el);
      return azDiff <= 2 && elDiff <= 2;
    });
  }

  static destroy(): void {
    if (SimulationManager.instance_) {
      // Stop the animation loop
      SimulationManager.instance_.isDestroyed_ = true;
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
