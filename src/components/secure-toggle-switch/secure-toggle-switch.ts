import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import { EventBus } from "@app/events/event-bus";
import { Events } from "@app/events/events";
import './secure-toggle-switch.css';

export class SecureToggleSwitch {
  protected html_: string;
  private readonly uniqueId: string;
  private dom_?: HTMLInputElement;
  private isUp_: boolean;
  private readonly cb_: (isUp: boolean) => void;

  constructor(uniqueId: string, cb: (isUp: boolean) => void, isUp: boolean, isLight = true) {
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
    this.cb_ = cb;
    this.isUp_ = isUp;
    this.uniqueId = uniqueId;

    EventBus.getInstance().on(Events.DOM_READY, this.onDomReady_.bind(this));
  }

  private onDomReady_(): void {
    this.dom_ ??= qs(`#${this.uniqueId}`);
    qs(`#${this.uniqueId}`).addEventListener('change', (e) => {
      this.cb_((e.target as HTMLInputElement).checked);
    });
  }

  static create(domId: string, cb: (isUp: boolean) => void, isUp: boolean, isLight = true): SecureToggleSwitch {
    return new SecureToggleSwitch(domId, cb, isUp, isLight);
  }

  get html(): string {
    return this.html_;
  }

  addEventListeners(_cb: (isUp: boolean) => void): void {
    // Guard switch
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
