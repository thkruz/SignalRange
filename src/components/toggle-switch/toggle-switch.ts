import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import { Sfx } from "@app/sound/sfx-enum";
import SoundManager from "@app/sound/sound-manager";
import './toggle-switch.css';

export class ToggleSwitch {
  protected html_: string;
  private readonly uniqueId: string;
  private dom_?: HTMLInputElement;
  private isActive_: boolean;
  private readonly checkedMeansActive: boolean;

  /**
   * @param uniqueId Unique DOM id for the input element.
   * @param isActive Initial active state.
   * @param checkedMeansActive If true, checked means "active/up"; if false, checked means "inactive/down".
   */
  constructor(uniqueId: string, isActive: boolean, checkedMeansActive: boolean = false) {
    this.checkedMeansActive = checkedMeansActive;
    const checked = checkedMeansActive ? isActive : !isActive;
    this.html_ = html`
      <div class="toggle-switch-wrapper">
        <div class="toggle-switch">
          <input class="switch" type="checkbox" id="${uniqueId}" ${checked ? 'checked' : ''} />
          <span class="knob"></span>
        </div>
      </div>
    `;
    this.isActive_ = isActive;
    this.uniqueId = uniqueId;

    // TODO: Add an event bus listener for DOM_READY if needed and remove addEventListeners calls
  }

  static create(domId: string, isActive: boolean, showDownWhenActive: boolean = false): ToggleSwitch {
    return new ToggleSwitch(domId, isActive, showDownWhenActive);
  }

  get html(): string {
    return this.html_;
  }

  addEventListeners(cb: (isActive: boolean) => void): void {
    this.dom.addEventListener('change', (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      this.isActive_ = checked ? this.checkedMeansActive : !this.checkedMeansActive;
      SoundManager.getInstance().play(Sfx.SWITCH);
      cb(this.isActive_);
    });
  }

  get dom(): HTMLInputElement {
    this.dom_ ??= qs(`#${this.uniqueId}`);
    return this.dom_;
  }

  activate(): void {
    if (!this.isActive_) {
      this.dom.checked = !!this.checkedMeansActive;
      this.isActive_ = true;
    }
  }

  deactivate(): void {
    if (this.isActive_) {
      this.dom.checked = !this.checkedMeansActive;
      this.isActive_ = false;
    }
  }

  sync(isActive: boolean): void {
    switch (isActive) {
      case true:
        this.activate();
        break;
      case false:
        this.deactivate();
        break;
    }
  }
}
