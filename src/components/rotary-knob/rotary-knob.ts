import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import { EventBus } from "@app/events/event-bus";
import { Events } from "@app/events/events";
import { Logger } from "@app/logging/logger";
import './rotary-knob.css';

export class RotaryKnob {
  protected html_: string;
  private readonly uniqueId: string;
  private dom_?: HTMLInputElement;
  private value: number = 0;
  valueOverride?: string;
  private readonly min: number;
  private readonly max: number;
  private readonly step: number;
  private angle: number = 0; // -135° to +135° (270° total range)
  private isDragging: boolean = false;
  private startY: number = 0;
  private startValue: number = 0;
  private callback?: (value: number) => void;

  constructor(
    uniqueId: string,
    initialValue: number,
    min: number,
    max: number,
    step: number = 1,
    callback?: (value: number) => void,
    valueOverride?: string
  ) {
    this.value = initialValue;
    this.min = min;
    this.max = max;
    this.step = step;
    this.callback = callback;
    this.valueOverride = valueOverride;
    this.html_ = html`
      <div class="rotary-knob" id="${uniqueId}">
        <div class="knob-body">
          <div class="knob-indicator"></div>
        </div>
        <div class="knob-value">${this.valueOverride ?? this.value.toFixed(1)}</div>
      </div>
    `;

    const container = document.createElement('div');
    container.className = 'rotary-knob-container';
    container.innerHTML = this.html_;

    this.uniqueId = uniqueId;
    this.updateAngleFromValue_();

    EventBus.getInstance().on(Events.DOM_READY, this.onDomReady_.bind(this));
  }

  private onDomReady_(): void {
    const knobBody = qs('.knob-body', this.dom);

    knobBody.addEventListener('mousedown', this.onDragStart.bind(this));
    document.addEventListener('mousemove', this.onDragMove.bind(this));
    document.addEventListener('mouseup', this.onDragEnd.bind(this));

    knobBody.addEventListener('wheel', this.onWheel_.bind(this), { passive: false });
  }

  private onDragStart(e: MouseEvent): void {
    this.isDragging = true;
    this.startY = e.clientY;
    this.startValue = this.value;
    e.preventDefault();
  }

  private onDragMove(e: MouseEvent): void {
    if (!this.isDragging) return;

    const deltaY = this.startY - e.clientY;
    const deltaX = e.clientX - (this.dom.getBoundingClientRect().left + this.dom.offsetWidth / 2);

    // Combine vertical and horizontal movement: up/right increases, down/left decreases
    const movement = deltaY + deltaX;
    const range = this.max - this.min;
    const deltaValue = (movement / 100) * range; // 100px = full range

    this.setValue_(this.startValue + deltaValue);
  }

  private onDragEnd(): void {
    this.isDragging = false;
  }

  private onWheel_(e: WheelEvent): void {
    e.preventDefault();
    const delta = -Math.sign(e.deltaY) * this.step;

    Logger.warn('RotaryKnob', `Wheel event delta: ${delta}`);

    this.setValue_(this.value + delta);
  }

  private setValue_(newValue: number): void {
    // Clamp and round to step
    this.value = Math.max(this.min, Math.min(this.max, newValue));
    this.value = Math.round(this.value / this.step) * this.step;

    this.updateAngleFromValue_();
    this.updateDisplay();

    if (this.callback) {
      this.callback(this.value);
    }
  }

  private updateAngleFromValue_(): void {
    const normalized = (this.value - this.min) / (this.max - this.min);
    this.angle = -135 + (normalized * 270); // -135° to +135°
  }

  updateDisplay(): void {
    qs('.knob-body', this.dom).style.transform = `rotate(${this.angle}deg)`;
    qs('.knob-value', this.dom).textContent = this.valueOverride ?? this.value.toFixed(1);
  }

  getValue(): number {
    return this.value;
  }

  get html(): string {
    return this.html_;
  }

  get dom(): HTMLInputElement {
    this.dom_ ??= qs(`#${this.uniqueId}`);

    return this.dom_;
  }

  sync(newValue: number): void {
    this.setValue_(newValue);
  }

  static create(
    id: string,
    initialValue: number,
    min: number,
    max: number,
    step: number = 1,
    callback?: (value: number) => void,
    valueOverride?: string
  ): RotaryKnob {
    return new RotaryKnob(id, initialValue, min, max, step, callback, valueOverride);
  }
}
