import { PowerSwitch } from '@app/components/power-switch/power-switch';
import { RotaryKnob } from '@app/components/rotary-knob/rotary-knob';
import { qs } from "@app/engine/utils/query-selector";
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { RFFrontEnd } from './rf-front-end';

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
  protected readonly rfFrontEnd_: RFFrontEnd;
  protected html_: string = '';
  protected dom_?: HTMLElement;
  protected state_: TState;
  protected lastDraw_: number = 0;
  protected lastRenderState_: string = '';

  // Common UI components
  protected powerSwitch_?: PowerSwitch;
  protected gainKnob_?: RotaryKnob;

  constructor(state: TState, rfFrontEnd: RFFrontEnd, modulePrefix: string, unit: number = 1) {
    this.state_ = state;
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

  get html(): string {
    return this.html_;
  }

  get dom(): HTMLElement {
    this.dom_ ??= qs(`#${this.uniqueId}`);
    return this.dom_;
  }

  get state(): TState {
    return this.state_;
  }

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
    this.state_ = { ...this.state_, ...state };
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
    return this.state_.isExtRefLocked ? 'led-green' : 'led-red';
  }
  // ═══════════════════════════════════════════════════════════════
  // Common UI Component Management
  // ═══════════════════════════════════════════════════════════════

  /**
   * Create power switch component
   */
  protected createPowerSwitch(): void {
    this.powerSwitch_ = PowerSwitch.create(
      `${this.uniqueId}-power`,
      this.state_.isPowered,
      true,
      true,
    );
  }

  /**
   * Create gain knob component
   * @param min Minimum gain value
   * @param max Maximum gain value
   * @param step Step size for gain adjustment
   */
  protected createGainKnob(min: number, max: number, step: number = 1): void {
    if (this.state_.gain === undefined) {
      console.warn(`${this.uniqueId}: Cannot create gain knob - state.gain is undefined`);
      return;
    }

    this.gainKnob_ = RotaryKnob.create(
      `${this.uniqueId}-gain-knob`,
      this.state_.gain,
      min,
      max,
      step,
      (value: number) => {
        if (this.state_.gain !== undefined) {
          this.state_.gain = value;
        }
      }
    );
  }

  /**
   * Add power switch event listener
   * @param cb Callback function when power state changes
   * @param onPowerOn Optional callback when powered on (for lock acquisition)
   */
  protected addPowerSwitchListener(
    cb: (state: TState) => void,
    onPowerOn?: () => void
  ): void {
    if (!this.powerSwitch_) {
      console.warn(`${this.uniqueId}: Cannot add power switch listener - not initialized`);
      return;
    }

    this.powerSwitch_.addEventListeners((isPowered: boolean) => {
      this.state_.isPowered = isPowered;

      // Simulate lock acquisition when powered on
      if (isPowered && this.isExtRefPresent() && onPowerOn) {
        onPowerOn();
      } else if (!isPowered && this.state_.isExtRefLocked !== undefined) {
        this.state_.isExtRefLocked = false;
      }

      this.syncDomWithState_();
      cb(this.state_);
    });
  }

  /**
   * Standard lock acquisition simulation
   * @param minDelay Minimum delay in milliseconds
   * @param maxDelay Maximum delay in milliseconds
   * @param cb Optional callback after lock is acquired
   */
  protected simulateLockAcquisition(
    minDelay: number = 2000,
    maxDelay: number = 5000,
    cb?: () => void
  ): void {
    if (this.state_.isExtRefLocked === undefined) {
      return;
    }

    const delay = minDelay + Math.random() * (maxDelay - minDelay);
    setTimeout(() => {
      if (this.state_.isExtRefLocked !== undefined) {
        this.state_.isExtRefLocked = true;
      }
      this.syncDomWithState_();
      if (cb) {
        cb();
      }
    }, delay);
  }

  /**
   * Update lock status based on power and external reference
   * Common pattern used by LNB and BUC modules
   */
  protected updateLockStatus(): void {
    if (this.state_.isExtRefLocked === undefined) {
      return;
    }

    const extRefPresent = this.isExtRefPresent();
    const canLock = this.state_.isPowered && extRefPresent;

    if (!canLock) {
      this.state_.isExtRefLocked = false;
      return;
    }

    // Simulate lock acquisition if not already locked
    if (!this.state_.isExtRefLocked) {
      this.simulateLockAcquisition();
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
