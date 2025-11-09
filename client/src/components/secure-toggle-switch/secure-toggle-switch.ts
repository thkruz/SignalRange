import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import './secure-toggle-switch.css';

export class SecureToggleSwitch {
  protected html_: string;
  private readonly uniqueId: string;
  private dom_?: HTMLInputElement;
  private isUp_: boolean;

  constructor(uniqueId: string, isUp: boolean, isLight = true) {
    this.html_ = html`
      <div class="secure-toggle-switch-wrapper">
        <div class="secure-toggle-switch">
          <input class="guard" type="checkbox" id="${uniqueId}-guard" />
          <span class="guard-sides"></span>
          <input class="switch" type="checkbox" id="${uniqueId}" ${isUp ? 'checked' : ''} />
          <span class="knob"></span>
          ${isLight ? html`<span class="light"></span>` : ''}
        </div>
      </div>
    `;
    this.isUp_ = isUp;
    this.uniqueId = uniqueId;
  }

  static create(domId: string, isUp: boolean, isLight = true): SecureToggleSwitch {
    return new SecureToggleSwitch(domId, isUp, isLight);
  }

  get html(): string {
    return this.html_;
  }

  addEventListeners(cb: (isUp: boolean) => void): void {
    qs(`#${this.uniqueId}`).addEventListener('change', (e) => {
      cb((e.target as HTMLInputElement).checked);
    });
  }

  get dom(): HTMLInputElement {
    this.dom_ ??= qs(`#${this.uniqueId}`);
    return this.dom_;
  }

  up(): void {
    if (!this.isUp_) {
      this.dom.checked = true;
      this.isUp_ = true;
    }
  }

  down(): void {
    if (this.isUp_) {
      this.dom.checked = false;
      this.isUp_ = false;
    }
  }

  sync(isUp: boolean): void {
    switch (isUp) {
      case true:
        this.up();
        break;
      case false:
        this.down();
        break;
    }
  }
}
