import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import { OMTState } from "./rf-front-end";

export class OMTModule {
  private static instance_: OMTModule;
  protected html_: string;
  private readonly uniqueId: string;
  private dom_?: HTMLElement;
  private state_: OMTState;

  private constructor(state: OMTState, unit?: number) {
    this.state_ = state;
    this.uniqueId = `rf-fe-omt-pol-${unit ?? 1}`;
    this.html_ = html`
      <div class="rf-fe-module omt-module">
        <div class="module-label">OMT/DUPLEXER</div>
        <div class="module-controls">
          <div class="control-group">
            <label>TX/RX POL</label>
            <div id="${this.uniqueId}"></div>
            <span class="pol-label">${this.state_.txPolarization}/${this.state_.rxPolarization}</span>
          </div>
          <div class="led-indicator">
            <span class="indicator-label">X-POL</span>
            <div class="led ${this.state_.isFaulted ? 'led-red' : 'led-off'}"></div>
            <span class="value-readout">${this.state_.crossPolIsolation.toFixed(1)} dB</span>
          </div>
        </div>
      </div>
    `;
  }

  static create(state: OMTState, unit?: number): OMTModule {
    this.instance_ ??= new OMTModule(state, unit);
    return this.instance_;
  }

  static getInstance(): OMTModule {
    return this.instance_;
  }

  get html(): string {
    return this.html_;
  }

  get dom(): HTMLElement {
    this.dom_ ??= qs(`#${this.uniqueId}`);
    return this.dom_;
  }

  sync(state: OMTState): void {
    this.state_ = state;
    // Optionally update DOM if needed
  }

  addEventListeners(_cb: (state: OMTState) => void): void {
    // Example: add event listeners to polarization toggle, etc.
    // qs(`#${this.uniqueId}`).addEventListener('change', ...)
  }
}
