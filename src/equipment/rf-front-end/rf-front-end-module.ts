import { HelpButton } from '@app/components/help-btn/help-btn';
import { PowerSwitch } from '@app/components/power-switch/power-switch';
import { RotaryKnob } from '@app/components/rotary-knob/rotary-knob';
import { qs } from '@app/engine/utils/query-selector';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { Rng } from '@app/simulation/rng';
import { SimClock } from '@app/simulation/sim-clock';
import { RFFrontEndCore } from './rf-front-end-core';

/** Seeded draws for this module (see simulation/rng.ts). */
const random = (): number => Rng.stream('rf-front-end').next();

/**
 * Base state interface that all RF modules must implement
 */
export interface RFFrontEndModuleState {
  isPowered: boolean;
  gain?: number;
  isExtRefLocked?: boolean;
}

/**
 * Abstract base class for RF Front End modules
 * Provides common functionality for all RF modules (LNB, OMT, BUC, etc.)
 */
export abstract class RFFrontEndModule<TState extends RFFrontEndModuleState> {
  protected readonly uniqueId: string;
  protected readonly rfFrontEnd_: RFFrontEndCore;
  protected html_: string = '';
  protected dom_?: HTMLElement;
  state: TState;
  protected lastDraw_: number = 0;
  protected lastRenderState_: string = '';
  protected helpBtn_: HelpButton;

  // Common UI components
  protected powerSwitch_?: PowerSwitch;
  protected gainKnob_?: RotaryKnob;
  /** Run time the pending reference acquisition completes; null when none is pending */
  private lockAcquireDueRunMs_: number | null = null;
  /** Callers waiting on the pending acquisition */
  private readonly lockAcquireCallbacks_: (() => void)[] = [];

  constructor(state: TState, rfFrontEnd: RFFrontEndCore, modulePrefix: string, unit: number = 1) {
    this.state = state;
    this.rfFrontEnd_ = rfFrontEnd;
    this.uniqueId = `${modulePrefix}-${unit}`;

    // Register event listeners
    EventBus.getInstance().on(Events.UPDATE, this.update.bind(this));
    EventBus.getInstance().on(Events.DRAW, () => {
      const now = Date.now();
      if (now - this.lastDraw_ > 500) {
        this.syncDomWithState_();
        this.lastDraw_ = now;
      }
    });
    EventBus.getInstance().on(Events.SYNC, this.syncDomWithState_.bind(this));
  }

  /**
   * Ops Log line for an operator action no state event reports on its own
   * (BUC gain, HPA back-off, LNB / HPA power: nats-r4-s07-F1, s12-F2). The
   * EventAutoLogger writes it, tagged with this module's station.
   */
  protected logOperatorAction_(message: string): void {
    EventBus.getInstance().emit(Events.EQUIPMENT_ACTION, { message, system: 'RF FE', module: this });
  }

  /** A level for a log line: "23 dB", or one decimal when it has a fraction */
  protected static formatLevel_(value: number, unit: string): string {
    return `${Number.isInteger(value) ? value : value.toFixed(1)} ${unit}`;
  }

  /**
   * Build the module DOM and initialize components
   * Called by UI subclasses after component initialization
   */
  protected build(parentId: string): void {
    this.initializeDom(parentId);
    this.addEventListeners((state: TState) => {
      this.state = state;
      this.syncDomWithState_();
    });
  }

  get html(): string {
    return this.html_;
  }

  get dom(): HTMLElement {
    this.dom_ ??= qs(`#${this.uniqueId}`);
    return this.dom_;
  }

  /**
   * Initialize DOM structure
   * Must be implemented by UI classes
   */
  protected abstract initializeDom(parentId: string): HTMLElement;

  /**
   * Add event listeners for user interactions
   * Must be implemented by subclasses
   */
  abstract addEventListeners(cb: (state: TState) => void): void;

  /**
   * Update component state and check for faults
   * Must be implemented by subclasses
   */
  abstract update(): void;

  /**
   * Sync state from external source
   * Can be overridden by subclasses for custom behavior
   */
  sync(state: Partial<TState>): void {
    this.state = { ...this.state, ...state };
    this.syncDomWithState_();
  }

  /**
   * Check if module has alarms
   * Must be implemented by subclasses
   */
  abstract getAlarms(): string[];

  /**
   * Update the DOM to reflect current state
   * Must be implemented by subclasses
   */
  protected abstract syncDomWithState_(): void;

  /**
   * Helper method to check if state has changed
   */
  protected hasStateChanged(): boolean {
    const currentState = JSON.stringify(this.state);
    if (currentState === this.lastRenderState_) {
      return false;
    }
    this.lastRenderState_ = currentState;
    return true;
  }

  // ═══════════════════════════════════════════════════════════════
  // Common Helper Methods
  // ═══════════════════════════════════════════════════════════════

  /**
   * Check if external 10MHz reference is present from GPSDO
   */
  protected isExtRefPresent(): boolean {
    return this.rfFrontEnd_.gpsdoModule.get10MhzOutput().isPresent;
  }

  /**
   * Check if external 10MHz reference is warmed up and stable
   */
  protected isExtRefWarmedUp(): boolean {
    return this.rfFrontEnd_.gpsdoModule.get10MhzOutput().isWarmedUp;
  }

  /**
   * Get lock LED status class based on lock state
   */
  protected getLockLedStatus(): string {
    return this.state.isExtRefLocked ? 'led-green' : 'led-red';
  }
  // ═══════════════════════════════════════════════════════════════
  // Common UI Component Management
  // ═══════════════════════════════════════════════════════════════

  /**
   * Create power switch component
   */
  protected createPowerSwitch(): void {
    this.powerSwitch_ = PowerSwitch.create(`power-${this.uniqueId}`, this.state.isPowered, true, true);
  }

  /**
   * Create gain knob component
   * @param min Minimum gain value
   * @param max Maximum gain value
   * @param step Step size for gain adjustment
   */
  protected createGainKnob(min: number, max: number, step: number = 1): void {
    if (this.state.gain === undefined) {
      console.warn(`${this.uniqueId}: Cannot create gain knob - state.gain is undefined`);
      return;
    }

    this.gainKnob_ = RotaryKnob.create(`${this.uniqueId}-gain-knob`, this.state.gain, min, max, step, (value: number) => {
      if (this.state.gain !== undefined) {
        this.state.gain = value;
      }
    });
  }

  /**
   * Add power switch event listener
   * @param cb Callback function when power state changes
   * @param onPowerOn Optional callback when powered on (for lock acquisition)
   */
  protected addPowerSwitchListener(cb: (state: TState) => void, onPowerOn?: () => void): void {
    if (!this.powerSwitch_) {
      console.warn(`${this.uniqueId}: Cannot add power switch listener - not initialized`);
      return;
    }

    this.powerSwitch_.addEventListeners((isPowered: boolean) => {
      this.state.isPowered = isPowered;

      // Simulate lock acquisition when powered on
      if (isPowered && this.isExtRefPresent() && onPowerOn) {
        onPowerOn();
      } else if (!isPowered && this.state.isExtRefLocked !== undefined) {
        this.state.isExtRefLocked = false;
      }

      this.syncDomWithState_();
      cb(this.state);
    });
  }

  /**
   * Standard lock acquisition simulation
   * @param minDelay Minimum delay in milliseconds
   * @param maxDelay Maximum delay in milliseconds
   * @param cb Optional callback after lock is acquired
   */
  protected simulateLockAcquisition(minDelay: number = 2000, maxDelay: number = 5000, cb?: () => void, canLock?: () => boolean): void {
    if (this.state.isExtRefLocked === undefined) {
      return;
    }

    if (cb) {
      this.lockAcquireCallbacks_.push(cb);
    }
    // One acquisition at a time (phase 27, r2-s02-F4: a new timer was
    // scheduled every frame while unlocked). A timer lost to a clock reset
    // (due long past) does not block a fresh one.
    if (this.lockAcquireDueRunMs_ !== null && SimClock.runMs() <= this.lockAcquireDueRunMs_ + 1000) {
      return;
    }

    const delay = minDelay + random() * (maxDelay - minDelay);
    this.lockAcquireDueRunMs_ = SimClock.runMs() + delay;
    SimClock.setTimeout(() => {
      this.lockAcquireDueRunMs_ = null;
      // The reference went away (or the unit lost power) while the PLL was
      // still pulling in: no lock
      if (this.state.isExtRefLocked !== undefined && (!canLock || canLock())) {
        this.state.isExtRefLocked = true;
      }
      this.syncDomWithState_();
      const callbacks = this.lockAcquireCallbacks_.splice(0);
      for (const callback of callbacks) {
        callback();
      }
    }, delay);
  }

  /**
   * The synthesiser is pulling in to its 10 MHz reference: powered, reference
   * present, not yet locked, an acquisition under way (2-5 s; phase 27). A
   * normal transient, not a fault.
   */
  get isAcquiringReference(): boolean {
    return this.lockAcquireDueRunMs_ !== null && this.state.isExtRefLocked === false && this.state.isPowered && this.isExtRefPresent();
  }

  /**
   * Update lock status based on power and external reference
   * Common pattern used by LNB and BUC modules
   */
  protected updateLockStatus(): void {
    if (this.state.isExtRefLocked === undefined) {
      return;
    }

    const extRefPresent = this.isExtRefPresent();
    const canLock = this.state.isPowered && extRefPresent;

    if (!canLock) {
      this.state.isExtRefLocked = false;
      return;
    }

    // Simulate lock acquisition if not already locked
    if (!this.state.isExtRefLocked) {
      this.simulateLockAcquisition(2000, 5000, undefined, () => this.state.isPowered && this.isExtRefPresent());
    }
  }

  /**
   * Sync common UI components (power switch, gain knob)
   * Call this from child class sync() methods
   */
  protected syncCommonComponents(state: Partial<TState>): void {
    if (this.powerSwitch_ && state.isPowered !== undefined) {
      this.powerSwitch_.sync(state.isPowered);
    }
    if (this.gainKnob_ && state.gain !== undefined) {
      this.gainKnob_.sync(state.gain);
    }
  }
}
