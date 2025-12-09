import { html } from "@app/engine/utils/development/formatter";
import './dialog-history-box.css';
import { DialogHistoryManager } from "./dialog-history-manager";
import { DraggableHtmlBox } from "./draggable-html-box";

export class DialogHistoryBox extends DraggableHtmlBox {
  constructor() {
    super('Dialog History', 'dialog-history', '');
    this.updateContent(this.generateHistoryHtml());
  }

  private generateHistoryHtml(): string {
    const history = DialogHistoryManager.getInstance().getHistory();

    if (history.length === 0) {
      return html`
        <div class="dialog-history-empty">
          <p>No dialogs have been played yet.</p>
        </div>
      `;
    }

    const historyItems = history.map((entry, index) => {
      const timeStr = new Date(entry.timestamp).toLocaleTimeString();
      return html`
        <div class="dialog-history-item">
          <div class="dialog-history-item-header">
            <span class="dialog-history-title">${entry.title}</span>
            <span class="dialog-history-time">${timeStr}</span>
          </div>
          <div class="dialog-history-character">${entry.character}</div>
          <button class="dialog-history-replay-btn" data-index="${index}">
            ▶ Replay
          </button>
        </div>
      `;
    }).join('');

    return html`
      <div class="dialog-history-container">
        ${historyItems}
      </div>
    `;
  }

  protected onOpen(): void {
    super.onOpen();
    this.updateContent(this.generateHistoryHtml());
    this.attachReplayListeners();
  }

  private attachReplayListeners(): void {
    const replayButtons = this.popupDom.querySelectorAll('.dialog-history-replay-btn');
    replayButtons.forEach((button) => {
      button.addEventListener('click', (e) => {
        const target = e.target as HTMLButtonElement;
        const index = parseInt(target.getAttribute('data-index') || '0', 10);
        const history = DialogHistoryManager.getInstance().getHistory();
        if (history[index]) {
          DialogHistoryManager.getInstance().replayDialog(history[index]);
        }
      });
    });
  }

  open(): void {
    super.open();
    this.updateContent(this.generateHistoryHtml());
    this.attachReplayListeners();
  }
}
