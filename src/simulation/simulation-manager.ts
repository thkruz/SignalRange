import { Satellite } from '@app/equipment/satellite/satellite';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { DialogHistoryBox } from '@app/modal/dialog-history-box';
import { DraggableHtmlBox } from '@app/modal/draggable-html-box';
import { ObjectivesManager } from '@app/objectives';
import { Equipment } from '@app/pages/sandbox/equipment';
import { ScenarioManager } from '@app/scenario-manager';
import { ProgressSaveManager } from '@app/user-account/progress-save-manager';
import { UserDataService } from '@app/user-account/user-data-service';
import { Degrees, Milliseconds } from 'ootk';
import { RfSignal } from './../types';

export class SimulationManager {
  private static instance_: SimulationManager;
  equipment: Equipment;
  isDeveloperMode = false;

  /** Delta time between frames in milliseconds */
  dt = 0 as Milliseconds;

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

    this.satelliteSignals = this.satellites.flatMap(sat => sat.txSignal);

    this.gameLoop_();
  }

  static getInstance(): SimulationManager {
    if (!this.instance_) {
      this.instance_ = new SimulationManager();
      window.signalRange.simulationManager = this.instance_;
    }
    return this.instance_;
  }

  private lastFrameTime = performance.now();

  private gameLoop_(): void {
    const now = performance.now();
    this.dt = (now - this.lastFrameTime) as Milliseconds;
    this.lastFrameTime = now;

    this.update(this.dt);
    this.draw(this.dt);
    requestAnimationFrame(this.gameLoop_.bind(this));
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
    return this.satellites.find(sat => sat.noradId === noradId);
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
    SimulationManager.instance_?.checklistBox?.close();
    SimulationManager.instance_?.missionBriefBox?.close();
    SimulationManager.instance_ = null;
  }
}