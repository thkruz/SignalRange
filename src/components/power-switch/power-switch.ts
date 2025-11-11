import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import { Sfx } from "@app/sound/sfx-enum";
import SoundManager from "@app/sound/sound-manager";
import './power-switch.css';

export class PowerSwitch {
  protected html_: string;
  private readonly uniqueId: string;
  private dom_?: HTMLInputElement;
  private isOn_: boolean;

  constructor(uniqueId: string, isOn: boolean, isVertical: boolean, isSmall: boolean) {
    this.html_ = html`
      <div class="physical-switch-container ${isVertical ? 'vertical-power-switch' : 'horizontal-power-switch'}">
        <input type="checkbox" id="${uniqueId}" class="physical-power-switch" checked="${isOn ? 'checked' : ''}" />
        <label for="${uniqueId}" class="physical-switch ${isVertical ? 'vertical-power-switch' : 'horizontal-power-switch'} ${isSmall ? 'small-power-switch' : ''}">
            <div class="physical-switch-track">
                <div class="physical-switch-rocker">
                    <div class="physical-switch-light"></div>
                    <div class="physical-switch-dots"></div>
                    <div class="physical-switch-characters"></div>
                    <div class="physical-switch-shine"></div>
                    <div class="physical-switch-shadow"></div>
                </div>
            </div>
        </label>
      </div>
    `;

    this.isOn_ = isOn;
    this.uniqueId = uniqueId;

    // TODO: Add an event bus listener for DOM_READY if needed and remove addEventListeners calls
  }

  static create(domId: string, isOn: boolean, isVertical = true, isSmall = false): PowerSwitch {
    return new PowerSwitch(domId, isOn, isVertical, isSmall);
  }

  get html(): string {
    return this.html_;
  }

  addEventListeners(cb: (isOn: boolean) => void): void {
    qs(`#${this.uniqueId}`).addEventListener('change', (e) => {
      cb((e.target as HTMLInputElement).checked);
    });
  }

  get dom(): HTMLInputElement {
    this.dom_ ??= qs(`#${this.uniqueId}`);

    return this.dom_;
  }

  on(): void {
    if (!this.isOn_) {
      this.dom.checked = true;
      this.isOn_ = true;
      SoundManager.getInstance().play(Sfx.POWER_ON);
    }
  }

  off(): void {
    if (this.isOn_) {
      this.dom.checked = false;
      this.isOn_ = false;
    }
  }

  sync(isOn: boolean): void {
    switch (isOn) {
      case true:
        this.on();
        break;
      case false:
        this.off();
        break;
    }
  }
}