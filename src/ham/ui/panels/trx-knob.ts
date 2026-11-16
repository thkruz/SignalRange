/**
 * @file trx-knob - A turnable knob for the C3 transceiver front panel (Phase 44 slice 8)
 * @description A role="slider" knob turned by dragging round it, the mouse wheel or the keyboard
 * (arrows step, Page Up/Down step coarse, Home/End to the stops). Each detent calls `onTurn` with the
 * new value; the owner commits it to the radio and calls `show` with what the radio accepted, so a
 * refused turn springs back. Bounded knobs sweep 270 degrees; an endless knob (the main dial) keeps
 * turning and shows its value in the display instead.
 */

import { h } from '../ui-kit';

export interface TrxKnobOptions {
  testId: string;
  label: string;
  /** Small text printed on the panel under the knob */
  legend: string;
  min: number;
  max: number;
  step: number;
  /** Page Up/Down step; defaults to ten steps */
  bigStep?: number;
  /** Stops for the wheel and drag (a filter knob clicks through its presets); arrows still step finely */
  detents?: readonly number[];
  /** The main dial turns without end stops */
  endless?: boolean;
  size?: 'main' | 'mid' | 'small';
  format: (v: number) => string;
  onTurn: (v: number) => void;
}

/** Wheel travel per detent for small (trackpad) deltas: a smooth flick must not spin through many steps */
const WHEEL_DETENT_PX = 40;
/** A single event this large is one notch of a real wheel (about 100 px on Chrome): exactly one detent */
const WHEEL_NOTCH_PX = 50;
/** Drag angle per detent */
const DRAG_DETENT_DEG = 15;

export class TrxKnob {
  readonly el: HTMLElement;
  private readonly cap_: HTMLElement;
  private readonly opts_: TrxKnobOptions;
  private value_: number;
  private turns_ = 0;
  private wheelAcc_ = 0;
  private dragAngle_: number | null = null;
  private readonly onKey_ = (e: KeyboardEvent): void => this.key_(e);
  private readonly onWheel_ = (e: WheelEvent): void => this.wheel_(e);
  private readonly onDown_ = (e: PointerEvent): void => this.down_(e);
  private readonly onMove_ = (e: PointerEvent): void => this.move_(e);
  private readonly onUp_ = (e: PointerEvent): void => this.up_(e);

  constructor(opts: TrxKnobOptions) {
    this.opts_ = opts;
    this.value_ = opts.min;
    this.cap_ = h('span', { class: 'trx-knob-cap', 'aria-hidden': 'true' }, h('span', { class: 'trx-knob-mark' }));
    const knob = h(
      'div',
      {
        class: `trx-knob trx-knob-${opts.size ?? 'small'}`,
        // An endless dial has no bounds, so it is a spinbutton; bounded knobs are sliders
        role: opts.endless ? 'spinbutton' : 'slider',
        tabindex: 0,
        id: opts.testId,
        'data-testid': opts.testId,
        'aria-label': opts.label,
        'aria-valuemin': opts.endless ? undefined : opts.min,
        'aria-valuemax': opts.endless ? undefined : opts.max,
      },
      this.cap_
    );
    knob.addEventListener('keydown', this.onKey_);
    knob.addEventListener('wheel', this.onWheel_, { passive: false });
    knob.addEventListener('pointerdown', this.onDown_);
    knob.addEventListener('pointermove', this.onMove_);
    knob.addEventListener('pointerup', this.onUp_);
    knob.addEventListener('pointercancel', this.onUp_);
    this.el = h('div', { class: `trx-knob-wrap trx-knob-wrap-${opts.size ?? 'small'}` }, knob, h('span', { class: 'trx-legend', 'aria-hidden': 'true', text: opts.legend }));
  }

  private get knob_(): HTMLElement {
    return this.el.firstElementChild as HTMLElement;
  }

  /** Show the value the radio holds; does not call onTurn */
  show(v: number): void {
    this.value_ = v;
    const o = this.opts_;
    const k = this.knob_;
    k.setAttribute('aria-valuenow', String(v));
    k.setAttribute('aria-valuetext', o.format(v));
    const deg = o.endless ? this.turns_ * DRAG_DETENT_DEG : -135 + (270 * (v - o.min)) / Math.max(1e-9, o.max - o.min);
    this.cap_.style.transform = `rotate(${deg}deg)`;
  }

  /** The main dial's step follows the STEP key */
  setStep(step: number): void {
    this.opts_.step = step;
  }

  setDisabled(off: boolean): void {
    this.knob_.setAttribute('aria-disabled', String(off));
  }

  dispose(): void {
    const k = this.knob_;
    k.removeEventListener('keydown', this.onKey_);
    k.removeEventListener('wheel', this.onWheel_);
    k.removeEventListener('pointerdown', this.onDown_);
    k.removeEventListener('pointermove', this.onMove_);
    k.removeEventListener('pointerup', this.onUp_);
    k.removeEventListener('pointercancel', this.onUp_);
  }

  private clamp_(v: number): number {
    const o = this.opts_;
    const r = Math.round(v / o.step) * o.step;
    const fixed = Math.round(r * 1e6) / 1e6;

    return o.endless ? fixed : Math.max(o.min, Math.min(o.max, fixed));
  }

  /** Turn by `n` detents: fine steps, or through the detent list when `useDetents` */
  private turn_(n: number, useDetents: boolean): void {
    if (this.knob_.getAttribute('aria-disabled') === 'true' || n === 0) return;
    const o = this.opts_;
    let next: number;
    if (useDetents && o.detents?.length) {
      const list = o.detents;
      let at = -1;
      if (n > 0) at = list.findIndex((d) => d > this.value_ + 1e-9);
      else for (let i = list.length - 1; i >= 0 && at < 0; i--) if (list[i] < this.value_ - 1e-9) at = i;
      if (at < 0) return;
      next = list[Math.max(0, Math.min(list.length - 1, at + (n > 0 ? n - 1 : n + 1)))];
    } else {
      next = this.clamp_(this.value_ + n * o.step);
    }
    this.turnTo_(next, n);
  }

  private turnTo_(next: number, dir: number): void {
    if (next === this.value_) return;
    this.turns_ += Math.sign(dir);
    this.value_ = next;
    this.show(next);
    this.opts_.onTurn(next);
  }

  private key_(e: KeyboardEvent): void {
    const o = this.opts_;
    const big = o.bigStep ?? o.step * 10;
    switch (e.key) {
      case 'ArrowUp':
      case 'ArrowRight':
        this.turn_(1, false);
        break;
      case 'ArrowDown':
      case 'ArrowLeft':
        this.turn_(-1, false);
        break;
      case 'PageUp':
        this.turnTo_(this.clamp_(this.value_ + big), 1);
        break;
      case 'PageDown':
        this.turnTo_(this.clamp_(this.value_ - big), -1);
        break;
      case 'Home':
        if (o.endless) return;
        this.turnTo_(o.min, -1);
        break;
      case 'End':
        if (o.endless) return;
        this.turnTo_(o.max, 1);
        break;
      default:
        return;
    }
    e.preventDefault();
  }

  private wheel_(e: WheelEvent): void {
    e.preventDefault();
    const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
    if (Math.abs(dy) >= WHEEL_NOTCH_PX) {
      // One notch is one detent, whatever the platform reports for the notch
      this.wheelAcc_ = 0;
      this.turn_(dy > 0 ? -1 : 1, true);

      return;
    }
    this.wheelAcc_ += dy;
    while (Math.abs(this.wheelAcc_) >= WHEEL_DETENT_PX) {
      // Wheel down turns the knob down (anticlockwise), like a scroll wheel on a real dial
      const dir = this.wheelAcc_ > 0 ? -1 : 1;
      this.wheelAcc_ += dir * WHEEL_DETENT_PX;
      this.turn_(dir, true);
    }
  }

  private angle_(e: PointerEvent): number {
    const r = this.knob_.getBoundingClientRect();

    return (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) / Math.PI;
  }

  private down_(e: PointerEvent): void {
    if (e.button !== 0) return;
    this.knob_.focus({ preventScroll: true });
    this.knob_.setPointerCapture?.(e.pointerId);
    this.dragAngle_ = this.angle_(e);
    this.knob_.classList.add('is-turning');
  }

  private move_(e: PointerEvent): void {
    if (this.dragAngle_ === null) return;
    const a = this.angle_(e);
    let d = a - this.dragAngle_;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    while (Math.abs(d) >= DRAG_DETENT_DEG) {
      const dir = d > 0 ? 1 : -1;
      this.turn_(dir, true);
      d -= dir * DRAG_DETENT_DEG;
      this.dragAngle_ += dir * DRAG_DETENT_DEG;
    }
  }

  private up_(e: PointerEvent): void {
    if (this.dragAngle_ === null) return;
    this.dragAngle_ = null;
    this.knob_.releasePointerCapture?.(e.pointerId);
    this.knob_.classList.remove('is-turning');
  }
}
