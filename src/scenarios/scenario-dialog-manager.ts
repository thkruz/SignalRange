import { EventBus } from '@app/events/event-bus';
import { Events, ObjectiveActivatedData, ObjectiveCompletedData } from '@app/events/events';
import { DialogManager } from '@app/modal/dialog-manager';
import { CountdownHold } from '@app/objectives/countdown-hold';
import type { DialogClip } from '@app/scenario-manager';
import { ScenarioManager } from '@app/scenario-manager';

export class ScenarioDialogManager {
  private static instance: ScenarioDialogManager;
  private eventBus: EventBus;
  private boundHandleObjectiveCompleted: (data: ObjectiveCompletedData) => void;
  private boundHandleObjectiveActivated: (data: ObjectiveActivatedData) => void;
  /** Clips scheduled but not yet shown; the countdown hold stays on while any are */
  private pendingClips_ = 0;

  private constructor() {
    this.eventBus = EventBus.getInstance();
    this.boundHandleObjectiveCompleted = this.handleObjectiveCompleted.bind(this);
    this.boundHandleObjectiveActivated = this.handleObjectiveActivated.bind(this);
  }

  static getInstance(): ScenarioDialogManager {
    if (!ScenarioDialogManager.instance) {
      ScenarioDialogManager.instance = new ScenarioDialogManager();
    }
    return ScenarioDialogManager.instance;
  }

  initialize(): void {
    this.eventBus.on(Events.OBJECTIVE_COMPLETED, this.boundHandleObjectiveCompleted);
    this.eventBus.on(Events.OBJECTIVE_ACTIVATED, this.boundHandleObjectiveActivated);
  }

  private handleObjectiveCompleted(data: ObjectiveCompletedData): void {
    const clip = ScenarioManager.getInstance().data.dialogClips?.objectives?.[data.objectiveId];
    if (clip) {
      this.scheduleClip_(clip, data.objectiveId);
    }
  }

  private handleObjectiveActivated(data: ObjectiveActivatedData): void {
    const clip = ScenarioManager.getInstance().data.dialogClips?.objectivesOnStart?.[data.objectiveId];
    if (clip) {
      this.scheduleClip_(clip, data.objectiveId);
    }
  }

  /**
   * Show a clip after a short beat so the checklist can update first. The
   * next objective's timer starts in the same frame, so hold the countdowns
   * through the wait too, or the clip eats the first half second of it.
   */
  private scheduleClip_(clip: DialogClip, objectiveId: string): void {
    const objective = ScenarioManager.getInstance().data.objectives?.find((obj) => obj.id === objectiveId);
    const title = objective?.title || objectiveId;

    this.pendingClips_++;
    CountdownHold.set('dialog-pending', true);
    setTimeout(() => {
      this.pendingClips_ = Math.max(0, this.pendingClips_ - 1);
      if (this.pendingClips_ === 0) {
        CountdownHold.set('dialog-pending', false);
      }
      DialogManager.getInstance().show(clip.text, clip.character, clip.audioUrl, title, clip.emotion);
    }, 500);
  }

  destroy(): void {
    this.eventBus.off(Events.OBJECTIVE_COMPLETED, this.boundHandleObjectiveCompleted);
    this.eventBus.off(Events.OBJECTIVE_ACTIVATED, this.boundHandleObjectiveActivated);
    DialogManager.getInstance().clearQueue();
    this.pendingClips_ = 0;
    CountdownHold.set('dialog-pending', false);
  }

  static reset(): void {
    if (ScenarioDialogManager.instance) {
      ScenarioDialogManager.instance.destroy();
      ScenarioDialogManager.instance = null;
    }
  }
}
