import { Character } from './character-enum';
import { DialogManager } from './dialog-manager';

export interface DialogHistoryEntry {
  text: string;
  character: Character;
  audioUrl: string;
  timestamp: number;
  title: string;
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
  addEntry(text: string, character: Character, audioUrl: string, title: string): void {
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
    });
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
    DialogManager.getInstance().show(entry.text, entry.character, entry.audioUrl);
  }

  /**
   * Clear all history (useful for scenario reset)
   */
  clearHistory(): void {
    this.history = [];
  }
}
