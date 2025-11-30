import { html } from "@app/engine/utils/development/formatter";
import { qs, qsa } from "@app/engine/utils/query-selector";
import './fine-adjust-control.css';

/**
 * Step configuration for fine adjustment buttons
 */
interface StepConfig {
  /** Step value (e.g., 0.01, 1, 10) */
  value: number;
  /** Button label (e.g., "<", "<<", "<<<") */
  label: string;
}

/**
 * FineAdjustControl - Button-based fine adjustment control
 *
 * Displays a row of buttons for precise value adjustment:
 * <<< << < [value] > >> >>>
 * -10 -1 -0.01   +0.01 +1 +10
 */
export class FineAdjustControl {
  protected html_: string;
  private readonly uniqueId: string;
  private readonly label: string;
  private readonly unit: string;
  private readonly steps: StepConfig[];
  private dom_?: HTMLElement;
  private valueDisplay_?: HTMLElement;
  private pendingDisplay_?: HTMLElement;
  private value_: number;
  private pendingValue_: number | null = null;
  private readonly decimals: number;
  private callback_?: (delta: number) => void;

  /**
   * @param uniqueId Unique DOM id prefix for elements
   * @param label Label for the control (e.g., "Azimuth")
   * @param initialValue Initial value to display
   * @param unit Unit string (e.g., "°")
   * @param steps Step configurations (default: [10, 1, 0.01])
   * @param decimals Number of decimal places to display
   */
  constructor(
    uniqueId: string,
    label: string,
    initialValue: number = 0,
    unit: string = '°',
    steps: number[] = [10, 1, 0.01],
    decimals: number = 2
  ) {
    this.uniqueId = uniqueId;
    this.label = label;
    this.unit = unit;
    this.value_ = initialValue;
    this.decimals = decimals;

    // Build step configs with labels
    this.steps = steps.map((value, index) => ({
      value,
      label: '<'.repeat(steps.length - index)
    }));

    this.html_ = this.buildHtml_();
  }

  private buildHtml_(): string {
    // Generate decrease buttons (largest step first)
    const decreaseButtons = this.steps.map(step =>
      `<button type="button" class="btn-fine btn-fine-decrease" data-delta="-${step.value}" title="-${step.value}${this.unit}">${step.label}</button>`
    ).join('');

    // Generate increase buttons (smallest step first)
    const increaseButtons = this.steps.slice().reverse().map(step =>
      `<button type="button" class="btn-fine btn-fine-increase" data-delta="${step.value}" title="+${step.value}${this.unit}">${step.label.replace(/</g, '>')}</button>`
    ).join('');

    return html`
      <div class="fine-adjust-control" id="${this.uniqueId}">
        <label class="fine-adjust-label">${this.label}</label>
        <div class="fine-adjust-row">
          <div class="fine-adjust-buttons fine-adjust-decrease">
            ${decreaseButtons}
          </div>
          <div class="fine-adjust-display">
            <span class="fine-adjust-value fine-adjust-value-active" id="${this.uniqueId}-value">${this.formatValue_(this.value_)}</span>
            <span class="fine-adjust-value fine-adjust-value-pending" id="${this.uniqueId}-pending"></span>
          </div>
          <div class="fine-adjust-buttons fine-adjust-increase">
            ${increaseButtons}
          </div>
        </div>
      </div>
    `;
  }

  private formatValue_(value: number): string {
    return `${value.toFixed(this.decimals)}${this.unit}`;
  }

  static create(
    uniqueId: string,
    label: string,
    initialValue: number = 0,
    unit: string = '°',
    steps: number[] = [10, 1, 0.01],
    decimals: number = 2
  ): FineAdjustControl {
    return new FineAdjustControl(uniqueId, label, initialValue, unit, steps, decimals);
  }

  get html(): string {
    return this.html_;
  }

  get dom(): HTMLElement {
    this.dom_ ??= qs(`#${this.uniqueId}`);
    return this.dom_;
  }

  get valueDisplay(): HTMLElement {
    this.valueDisplay_ ??= qs(`#${this.uniqueId}-value`);
    return this.valueDisplay_;
  }

  get pendingDisplay(): HTMLElement {
    this.pendingDisplay_ ??= qs(`#${this.uniqueId}-pending`);
    return this.pendingDisplay_;
  }

  /**
   * Add event listeners for button clicks
   * @param callback Called with delta value when a button is clicked
   */
  addEventListeners(callback: (delta: number) => void): void {
    this.callback_ = callback;
    const buttons = qsa('.btn-fine', this.dom);
    buttons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const delta = parseFloat((e.target as HTMLElement).dataset.delta!);
        // No sound - operator is remote from antenna
        this.callback_!(delta);
      });
    });
  }

  /**
   * Sync the displayed value with external state
   * @param value Current active value to display
   * @param pendingValue Optional pending value (staged but not applied)
   */
  sync(value: number, pendingValue: number | null = null): void {
    // Update active value
    if (this.value_ !== value) {
      this.value_ = value;
      this.valueDisplay.textContent = this.formatValue_(value);
    }

    // Update pending value display
    if (this.pendingValue_ !== pendingValue) {
      this.pendingValue_ = pendingValue;
      if (pendingValue !== null && pendingValue !== value) {
        this.pendingDisplay.textContent = `→ ${this.formatValue_(pendingValue)}`;
      } else {
        this.pendingDisplay.textContent = '';
      }
    }
  }

  /**
   * Enable or disable the control
   * @param enabled Whether the control should be enabled
   */
  setEnabled(enabled: boolean): void {
    const buttons = qsa('.btn-fine', this.dom);
    buttons.forEach(btn => {
      (btn as HTMLButtonElement).disabled = !enabled;
    });
    this.dom.classList.toggle('disabled', !enabled);
  }
}
