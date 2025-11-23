import { html } from '@app/engine/utils/development/formatter';
import { qs } from '@app/engine/utils/query-selector';
import './panel-manager.css';

export type PanelSide = 'left' | 'right';

export class PanelManager {
  private static instance: PanelManager;
  private panelElement: HTMLDivElement | null = null;
  private activeTitle: string | null = null;
  private onHideCallbacks: Array<() => void> = [];

  private constructor() { }

  static getInstance(): PanelManager {
    if (!PanelManager.instance) {
      PanelManager.instance = new PanelManager();
    }
    return PanelManager.instance;
  }

  isShowing(title?: string): boolean {
    if (!this.panelElement) {
      return false;
    }
    if (!title) {
      return true;
    }
    return this.activeTitle === title;
  }

  onHide(cb: () => void): void {
    this.onHideCallbacks.push(cb);
  }

  show(title: string, htmlContent: string, side: PanelSide = 'right'): void {
    if (this.panelElement) return; // Prevent multiple panels

    const panel = document.createElement('div');
    panel.className = `hm-panel hm-panel-${side}`;
    panel.setAttribute('role', 'complementary');
    panel.setAttribute('aria-label', title);

    const isUrl = /^https?:\/\//.test(htmlContent);

    panel.innerHTML = html`
      <div class="hm-panel-container">
        <div class="hm-panel-header">
          <h2>${title}</h2>
          <button type="button" class="hm-panel-close" aria-label="Close panel">
            ×
          </button>
        </div>
        <div class="hm-panel-body">
          ${isUrl ? `<iframe src="${htmlContent}" style="width:100%;height:100%;border:none;"></iframe>` : htmlContent}
        </div>
      </div>
    `;

    document.body.appendChild(panel);

    // Wire close button after insertion
    qs('.hm-panel-close', panel as unknown as HTMLElement).addEventListener('click', () => this.hide());

    // Store reference
    this.panelElement = panel;
    this.activeTitle = title;

    // Trigger animation
    requestAnimationFrame(() => {
      panel.classList.add('hm-panel-visible');
    });
  }

  updateContent(htmlContent: string): void {
    if (!this.panelElement) {
      return;
    }

    const body = this.panelElement.querySelector('.hm-panel-body');
    if (!body) {
      return;
    }

    const isUrl = /^https?:\/\//.test(htmlContent);
    body.innerHTML = isUrl ? `<iframe src="${htmlContent}" style="width:100%;height:100%;border:none;"></iframe>` : htmlContent;
  }

  hide(): void {
    if (this.panelElement) {
      this.panelElement.classList.remove('hm-panel-visible');

      // Wait for animation to complete before removing
      setTimeout(() => {
        if (this.panelElement) {
          this.panelElement.remove();
          this.panelElement = null;
          this.activeTitle = null;
          this.onHideCallbacks.forEach((cb) => cb());
          this.onHideCallbacks = [];
        }
      }, 300); // Match CSS transition duration
    }
  }
}
