import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { Objective, ObjectiveState } from '@app/objectives/objective-types';
import { DialogClip } from '@app/scenario-manager';
import { Character, Emotion } from './character-enum';
import { DialogManager } from './dialog-manager';

export interface DialogHistoryEntry {
  text: string;
  character: Character;
  audioUrl: string;
  timestamp: number;
  title: string;
  emotion?: Emotion;
}

export class DialogHistoryManager {
  private static instance: DialogHistoryManager;
  private history: DialogHistoryEntry[] = [];

  private constructor() { }

  static getInstance(): DialogHistoryManager {
    if (!DialogHistoryManager.instance) {
      DialogHistoryManager.instance = new DialogHistoryManager();
    }
    return DialogHistoryManager.instance;
  }

  /**
   * Add a dialog entry to the history
   */
  addEntry(text: string, character: Character, audioUrl: string, title: string, emotion?: Emotion): void {
    // Don't add the same audioUrl twice
    const isAlreadyInHistory = this.history.some(entry => entry.audioUrl === audioUrl);
    if (isAlreadyInHistory) {
      return;
    }

    this.history.push({
      text,
      character,
      audioUrl,
      timestamp: Date.now(),
      title,
      emotion,
    });

    EventBus.getInstance().emit(Events.DIALOG_HISTORY_CHANGED);
  }

  /**
   * Get all dialog history entries
   */
  getHistory(): DialogHistoryEntry[] {
    return [...this.history];
  }

  /**
   * Replay a specific dialog from history
   */
  replayDialog(entry: DialogHistoryEntry): void {
    DialogManager.getInstance().show(entry.text, entry.character, entry.audioUrl, entry.title, entry.emotion);
  }

  /**
   * Clear all history (useful for scenario reset)
   */
  clearHistory(): void {
    this.history = [];
  }

  /**
   * Reconstruct dialog history from completed objectives when restoring from checkpoint.
   * This ensures the dialog history box shows previously played dialogs after browser reload.
   */
  reconstructFromCompletedObjectives(
    dialogClips: { intro?: DialogClip; objectives?: Record<string, DialogClip> } | undefined,
    objectiveStates: ObjectiveState[],
    objectives: Objective[]
  ): void {
    if (!dialogClips || !objectiveStates) {
      return;
    }

    // Get completed objectives sorted by completion time
    const completedStates = objectiveStates
      .filter(state => state.isCompleted && state.completedAt)
      .sort((a, b) => (a.completedAt ?? 0) - (b.completedAt ?? 0));

    if (completedStates.length === 0) {
      return;
    }

    // Add intro clip first if it exists
    if (dialogClips.intro) {
      this.addEntry(
        dialogClips.intro.text,
        dialogClips.intro.character,
        dialogClips.intro.audioUrl,
        'Introduction',
        dialogClips.intro.emotion
      );
    }

    // Add each completed objective's dialog clip in chronological order
    for (const state of completedStates) {
      const objectiveId = state.objective.id;
      const dialogClip = dialogClips.objectives?.[objectiveId];

      if (dialogClip) {
        // Find the objective to get its title
        const objective = objectives.find(obj => obj.id === objectiveId);
        const title = objective?.title ?? objectiveId;

        this.addEntry(
          dialogClip.text,
          dialogClip.character,
          dialogClip.audioUrl,
          title,
          dialogClip.emotion
        );
      }
    }
  }
}
