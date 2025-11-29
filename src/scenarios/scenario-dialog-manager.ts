import { EventBus } from '@app/events/event-bus';
import { Events, ObjectiveCompletedData } from '@app/events/events';
import { DialogManager } from '@app/modal/dialog-manager';
import { ScenarioManager } from '@app/scenario-manager';

export class ScenarioDialogManager {
  private static instance: ScenarioDialogManager;
  private eventBus: EventBus;
  private boundHandleObjectiveCompleted: (data: ObjectiveCompletedData) => void;

  private constructor() {
    this.eventBus = EventBus.getInstance();
    this.boundHandleObjectiveCompleted = this.handleObjectiveCompleted.bind(this);
  }

  static getInstance(): ScenarioDialogManager {
    if (!ScenarioDialogManager.instance) {
      ScenarioDialogManager.instance = new ScenarioDialogManager();
    }
    return ScenarioDialogManager.instance;
  }

  initialize(): void {
    this.eventBus.on(Events.OBJECTIVE_COMPLETED, this.boundHandleObjectiveCompleted);
  }

  private handleObjectiveCompleted(data: ObjectiveCompletedData): void {
    const scenario = ScenarioManager.getInstance().data;

    // Check if there's a dialog clip for this objective
    const dialogClip = scenario.dialogClips?.objectives?.[data.objectiveId];

    if (dialogClip) {
      // Find the objective to get its title
      const objective = scenario.objectives?.find(obj => obj.id === data.objectiveId);
      const title = objective?.title || data.objectiveId;

      // Wait a moment for UI to update and celebrate, then show dialog
      setTimeout(() => {
        DialogManager.getInstance().show(
          dialogClip.text,
          dialogClip.character,
          dialogClip.audioUrl,
          title,
          dialogClip.emotion
        );
      }, 500);
    }
  }

  destroy(): void {
    this.eventBus.off(Events.OBJECTIVE_COMPLETED, this.boundHandleObjectiveCompleted);
  }

  static reset(): void {
    if (ScenarioDialogManager.instance) {
      ScenarioDialogManager.instance.destroy();
      ScenarioDialogManager.instance = null;
    }
  }
}
