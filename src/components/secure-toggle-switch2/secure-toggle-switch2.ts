import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import { EventBus } from "@app/events/event-bus";
import { Events } from "@app/events/events";
import { Sfx } from "@app/sound/sfx-enum";
import SoundManager from "@app/sound/sound-manager";
import './secure-toggle-switch2.css';

export class SecureToggleSwitch2 {
  protected html_: string;
  private readonly uniqueId: string;
  private dom_?: HTMLInputElement;
  private isUp_: boolean;
  private readonly cb_: (isUp: boolean) => void;

  constructor(uniqueId: string, cb: (isUp: boolean) => void, isUp: boolean) {
    this.html_ = html`
      <div class="toggle-switch-wrapper">
        <div class="toggle-switch">
          <input class="guard" type="checkbox" id="${uniqueId}-guard" />
          <span class="guard-sides"></span>
          <input class="switch" type="checkbox" id="${uniqueId}" ${isUp ? 'checked' : ''} />
          <span class="knob"></span>
          <span class="light"></span>
        </div>
      </div>
    `;
    this.isUp_ = isUp;
    this.cb_ = cb;
    this.uniqueId = uniqueId;

    EventBus.getInstance().on(Events.DOM_READY, this.onDomReady_.bind(this));
  }

  private onDomReady_(): void {
    this.dom_ ??= qs(`#${this.uniqueId}`);
    qs(`#${this.uniqueId}`).addEventListener('change', (e) => {
      SoundManager.getInstance().play(Sfx.SWITCH);
      this.cb_((e.target as HTMLInputElement).checked);
    });
  }

  static create(domId: string, cb: (isUp: boolean) => void, isUp: boolean): SecureToggleSwitch2 {
    return new SecureToggleSwitch2(domId, cb, isUp);
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
