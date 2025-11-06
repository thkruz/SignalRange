import { html } from "@app/engine/utils/development/formatter";

export class RotaryKnob {
  private element: HTMLElement;
  private value: number;
  private min: number;
  private max: number;
  private step: number;
  private angle: number = 0; // -135° to +135° (270° total range)
  private isDragging: boolean = false;
  private startY: number = 0;
  private startValue: number = 0;
  private callback?: (value: number) => void;

  constructor(
    id: string,
    initialValue: number,
    min: number,
    max: number,
    step: number = 1,
    callback?: (value: number) => void
  ) {
    this.value = initialValue;
    this.min = min;
    this.max = max;
    this.step = step;
    this.callback = callback;

    const container = document.createElement('div');
    container.className = 'rotary-knob-container';
    container.innerHTML = html`
      <div class="rotary-knob" id="${id}">
        <div class="knob-body">
          <div class="knob-indicator"></div>
        </div>
        <div class="knob-value">${this.value.toFixed(1)}</div>
      </div>
    `;

    this.element = container.firstElementChild as HTMLElement;
    this.updateAngleFromValue();
    this.attachListeners();
  }

  private attachListeners(): void {
    const knobBody = this.element.querySelector('.knob-body') as HTMLElement;

    knobBody.addEventListener('mousedown', this.onDragStart.bind(this));
    document.addEventListener('mousemove', this.onDragMove.bind(this));
    document.addEventListener('mouseup', this.onDragEnd.bind(this));

    knobBody.addEventListener('wheel', this.onWheel.bind(this), { passive: false });
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
    const range = this.max - this.min;
    const deltaValue = (deltaY / 100) * range; // 100px = full range

    this.setValue(this.startValue + deltaValue);
  }

  private onDragEnd(): void {
    this.isDragging = false;
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const delta = -Math.sign(e.deltaY) * this.step;
    this.setValue(this.value + delta);
  }

  private setValue(newValue: number): void {
    // Clamp and round to step
    this.value = Math.max(this.min, Math.min(this.max, newValue));
    this.value = Math.round(this.value / this.step) * this.step;

    this.updateAngleFromValue();
    this.updateDisplay();

    if (this.callback) {
      this.callback(this.value);
    }
  }

  private updateAngleFromValue(): void {
    const normalized = (this.value - this.min) / (this.max - this.min);
    this.angle = -135 + (normalized * 270); // -135° to +135°
  }

  private updateDisplay(): void {
    const knobBody = this.element.querySelector('.knob-body') as HTMLElement;
    if (knobBody) {
      knobBody.style.transform = `rotate(${this.angle}deg)`;
    }

    const valueDisplay = this.element.querySelector('.knob-value') as HTMLElement;
    if (valueDisplay) {
      valueDisplay.textContent = this.value.toFixed(1);
    }
  }

  public getValue(): number {
    return this.value;
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public sync(newValue: number): void {
    this.setValue(newValue);
  }

  public static create(
    id: string,
    initialValue: number,
    min: number,
    max: number,
    step: number = 1,
    callback?: (value: number) => void
  ): RotaryKnob {
    return new RotaryKnob(id, initialValue, min, max, step, callback);
  }
}
