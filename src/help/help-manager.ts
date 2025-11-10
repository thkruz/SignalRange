import { html } from '@app/engine/utils/development/formatter';
import { qs } from '@app/engine/utils/query-selector';
import './help-manager.css';

export class HelpManager {
  private static instance: HelpManager;
  private modalElement: HTMLDivElement | null = null;

  private constructor() { }

  static getInstance(): HelpManager {
    if (!HelpManager.instance) {
      HelpManager.instance = new HelpManager();
    }
    return HelpManager.instance;
  }

  show(title: string, htmlContent: string): void {
    if (this.modalElement) return; // Prevent multiple modals

    const overlay = document.createElement('div');
    overlay.className = 'hm-modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.tabIndex = -1;

    overlay.innerHTML = html`
      <div class="hm-modal-box">
        <div class="hm-modal-header">
          <h1>${title}</h1>
        </div>
        <div class="hm-modal-body">
          ${htmlContent}
        </div>
        <div class="hm-modal-footer">
          <button type="button" class="hm-modal-close">
            Close
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Wire close button after insertion
    qs('.hm-modal-close', overlay as unknown as HTMLElement).addEventListener('click', () => this.hide());
    qs('.hm-modal-overlay').addEventListener('click', (e) => {
      if (e.target === overlay) {
        this.hide();
      }
    });

    // store reference
    this.modalElement = overlay;

    // focus for accessibility
    overlay.focus();
  }

  hide(): void {
    if (this.modalElement) {
      this.modalElement.remove();
      this.modalElement = null;
    }
  }
}