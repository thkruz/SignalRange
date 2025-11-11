import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import { EventBus } from "@app/events/event-bus";
import { Events } from "@app/events/events";
import { Logger } from "@app/logging/logger";
import './continuous-rotary-knob.css';

export class ContinuousRotaryKnob {
  protected html_: string;
  private readonly uniqueId: string;
  private dom_?: HTMLInputElement;
  private angle: number = 0; // Continuous angle, can go beyond 360°
  private isDragging: boolean = false;
  private startY: number = 0;
  private startAngle: number = 0;
  private readonly step: number;
  private callback?: (delta: number) => void;
  private totalRotations: number = 0;
  valueOverride?: string;

  constructor(
    uniqueId: string,
    initialAngle: number = 0,
    step: number = 1,
    callback?: (delta: number) => void,
    valueOverride?: string
  ) {
    this.uniqueId = uniqueId;
    this.angle = initialAngle;
    this.step = step;
    this.callback = callback;
    this.valueOverride = valueOverride;

    this.html_ = html`
      <div class="continuous-rotary-knob" id="${uniqueId}">
        <div class="knob-body">
          <div class="knob-indicator"></div>
        </div>
        <div class="knob-value">${this.valueOverride ?? this.formatRotations()}</div>
      </div>
    `;

    const container = document.createElement('div');
    container.className = 'continuous-rotary-knob-container';
    container.innerHTML = this.html_;

    EventBus.getInstance().on(Events.DOM_READY, this.onDomReady_.bind(this));
  }

  private onDomReady_(): void {
    this.dom_ ??= qs(`#${this.uniqueId}`);
    const knobBody = qs('.knob-body', this.dom);

    knobBody.addEventListener('mousedown', this.onDragStart.bind(this));
    document.addEventListener('mousemove', this.onDragMove.bind(this));
    document.addEventListener('mouseup', this.onDragEnd.bind(this));

    knobBody.addEventListener('wheel', this.onWheel_.bind(this), { passive: false });
  }

  private onDragStart(e: MouseEvent): void {
    this.isDragging = true;
    this.startY = e.clientY;
    this.startAngle = this.angle;
    e.preventDefault();
  }

  private onDragMove(e: MouseEvent): void {
    if (!this.isDragging) return;

    const deltaY = this.startY - e.clientY;
    const deltaX = e.clientX - (this.dom.getBoundingClientRect().left + this.dom.offsetWidth / 2);

    // Combine vertical and horizontal movement: up/right increases, down/left decreases
    const movement = deltaY + deltaX;
    const deltaAngle = (movement / 100) * 360; // 100px = full rotation

    this.setAngle_(this.startAngle + deltaAngle);
  }

  private onDragEnd(): void {
    this.isDragging = false;
  }

  private onWheel_(e: WheelEvent): void {
    e.preventDefault();
    const delta = -Math.sign(e.deltaY) * this.step;

    Logger.warn('ContinuousRotaryKnob', `Wheel event delta: ${delta}`);

    this.setAngle_(this.angle + delta);
  }

  private setAngle_(newAngle: number): void {
    const oldAngle = this.angle;
    this.angle = Math.round(newAngle / this.step) * this.step;

    const delta = this.angle - oldAngle;

    // Update total rotations for display
    this.totalRotations = Math.floor(this.angle / 360);

    this.updateDisplay();

    if (this.callback && delta !== 0) {
      this.callback(delta);
    }
  }

  private formatRotations(): string {
    const normalizedAngle = ((this.angle % 360) + 360) % 360;
    if (this.totalRotations === 0) {
      return `${normalizedAngle.toFixed(0)}°`;
    }
    return `${this.totalRotations > 0 ? '+' : ''}${this.totalRotations}×${normalizedAngle.toFixed(0)}°`;
  }

  updateDisplay(): void {
    const displayAngle = this.angle % 360;
    qs('.knob-body', this.dom).style.transform = `rotate(${displayAngle}deg)`;
    qs('.knob-value', this.dom).textContent = this.valueOverride ?? this.formatRotations();
  }

  getAngle(): number {
    return this.angle;
  }

  getTotalRotations(): number {
    return this.totalRotations;
  }

  reset(): void {
    this.setAngle_(0);
  }

  get html(): string {
    return this.html_;
  }

  get dom(): HTMLInputElement {
    this.dom_ ??= qs(`#${this.uniqueId}`);
    return this.dom_;
  }

  sync(newAngle: number): void {
    this.setAngle_(newAngle);
  }

  static create(
    id: string,
    initialAngle: number = 0,
    step: number = 1,
    callback?: (delta: number) => void,
    valueOverride?: string
  ): ContinuousRotaryKnob {
    return new ContinuousRotaryKnob(id, initialAngle, step, callback, valueOverride);
  }
}
