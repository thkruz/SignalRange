import { PowerSwitch } from '@app/components/power-switch/power-switch';
import { RotaryKnob } from '@app/components/rotary-knob/rotary-knob';
import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import { IfFrequency, IfSignal, MHz, RfFrequency, RfSignal } from '@app/types';
import { RFFrontEnd } from '../rf-front-end';
import { RFFrontEndModule } from '../rf-front-end-module';
import './buc-module.css';

/**
 * Block Up Converter module state
 */
export interface BUCState {
  isPowered: boolean;
  loFrequency: MHz; // MHz (typical 3700-4200)
  gain: number; // dB (0-70)
  isMuted: boolean;
  isExtRefLocked: boolean;
  outputPower: number; // dBm
}

export class BUCModule extends RFFrontEndModule<BUCState> {
  private static instance_: BUCModule;

  private readonly powerSwitch: PowerSwitch;
  private readonly gainKnob: RotaryKnob;
  ifSignals: IfSignal[] = [];
  postBUCSignals: RfSignal[] = [];
  rfSignals: RfSignal[] = [];

  static create(state: BUCState, rfFrontEnd: RFFrontEnd, unit: number = 1): BUCModule {
    this.instance_ ??= new BUCModule(state, rfFrontEnd, unit);
    return this.instance_;
  }

  static getInstance(): BUCModule {
    return this.instance_;
  }

  private constructor(state: BUCState, rfFrontEnd: RFFrontEnd, unit: number = 1) {
    super(state, rfFrontEnd, 'rf-fe-buc', unit);

    // Create UI components
    this.powerSwitch = PowerSwitch.create(
      `${this.uniqueId}-power`,
      this.state_.isPowered,
      false,
      true,
    );

    this.gainKnob = RotaryKnob.create(
      `${this.uniqueId}-gain-knob`,
      this.state_.gain,
      0,
      70,
      1,
      (value: number) => {
        this.state_.gain = value;
        this.rfFrontEnd_.calculateSignalPath();
      }
    );

    this.html_ = html`
      <div class="rf-fe-module buc-module">
        <div class="module-label">Block Upconverter</div>
        <div class="module-controls">
          <div class="control-group">
            <label>LO (MHz)</label>
            <input type="number"
                   class="input-buc-lo"
                   data-param="buc.loFrequency"
                   value="${this.state_.loFrequency}"
                   min="3700" max="4200" step="10" />
            <div class="digital-display buc-lo-display">${this.state_.loFrequency}</div>
          </div>
          <div class="control-group">
            <label>GAIN (dB)</label>
            ${this.gainKnob.html}
          </div>
          <div class="led-indicator">
            <span class="indicator-label">LOCK</span>
            <div class="led ${this.getLockLedStatus_()}"></div>
          </div>
          <div class="control-group">
            <label>MUTE</label>
            <button class="btn-mute ${this.state_.isMuted ? 'active' : ''}"
                    data-action="toggle-buc-mute">
              ${this.state_.isMuted ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>
        <div class="control-group">
          ${this.powerSwitch.html}
        </div>
      </div>
    `;
  }

  private getLockLedStatus_(): string {
    return this.state_.isExtRefLocked ? 'led-green' : 'led-red';
  }

  /**
   * Add event listeners for user interactions
   */
  addEventListeners(cb: (state: BUCState) => void): void {
    if (!this.powerSwitch || !this.gainKnob) {
      console.warn('BUCModule: Cannot add event listeners - components not initialized');
      return;
    }

    // Power switch handler
    this.powerSwitch.addEventListeners((isPowered: boolean) => {
      const parentPowered = this.rfFrontEnd_.state.isPowered;
      if (parentPowered) {
        this.state_.isPowered = isPowered;

        // Simulate lock acquisition when powered on
        if (isPowered && this.rfFrontEnd_.state.isExtRefPresent) {
          setTimeout(() => {
            this.state_.isExtRefLocked = true;
            this.syncDomWithState_();
            cb(this.state_);
          }, 2000);
        } else if (!isPowered) {
          this.state_.isExtRefLocked = false;
        }

        this.syncDomWithState_();
        cb(this.state_);
      }
    });

    // LO frequency input handler
    const container = qs('.buc-module');
    if (container) {
      const loInput = container.querySelector('.input-buc-lo');
      if (loInput) {
        loInput.addEventListener('change', (e: Event) => {
          const target = e.target as HTMLInputElement;
          const value = parseFloat(target.value);
          if (!isNaN(value)) {
            this.state_.loFrequency = value as MHz;
            this.syncDomWithState_();
            cb(this.state_);
          }
        });
      }

      // Mute button handler
      const muteButton = container.querySelector('[data-action="toggle-buc-mute"]');
      if (muteButton) {
        muteButton.addEventListener('click', () => {
          this.state_.isMuted = !this.state_.isMuted;
          this.syncDomWithState_();
          cb(this.state_);
        });
      }
    }

    // Gain knob already has its callback set in constructor
    this.gainKnob.attachListeners();
  }

  /**
   * Update component state and check for faults
   */
  update(): void {
    // Get IF Signals (from upstream modulator/transmitter)
    // TODO: This needs to go to the RFFrontEnd and then back to the Transmitter
    this.ifSignals = [];

    // Update lock status based on power and reference availability
    this.updateLockStatus_();

    // Calculate output power
    this.updateOutputPower_();

    // Check for alarms
    this.checkAlarms_();

    // Calculate post-BUC signals (apply upconversion and gain if powered)
    this.postBUCSignals = this.ifSignals.map(sig => {
      const rfFreq = this.calculateRfFrequency(sig.frequency);
      const gain = this.state_.isPowered && !this.state_.isMuted ? this.state_.gain : -120;
      return {
        frequency: rfFreq,
        power: sig.power + gain,
        bandwidth: sig.bandwidth,
      } as RfSignal;
    });

    // Output signals for next stage
    this.rfSignals = this.postBUCSignals;
  }

  /**
   * Calculate BUC output power
   */
  private updateOutputPower_(): void {
    if (this.state_.isPowered && !this.state_.isMuted) {
      const inputPower = -10; // dBm typical IF input
      this.state_.outputPower = inputPower + this.state_.gain;
    } else {
      this.state_.outputPower = -120; // Effectively off
    }
  }

  /**
   * Update lock status based on power and external reference
   */
  private updateLockStatus_(): void {
    const parentPowered = this.rfFrontEnd_.state.isPowered;
    const extRefPresent = this.rfFrontEnd_.state.isExtRefPresent;

    if (!parentPowered || !this.state_.isPowered) {
      this.state_.isExtRefLocked = false;
    } else if (!extRefPresent) {
      this.state_.isExtRefLocked = false;
    } else {
      // In real system, lock acquisition takes 2-5 seconds
      // For simulation, we'll maintain the lock if conditions are met
      if (!this.state_.isExtRefLocked) {
        this.state_.isExtRefLocked = true;
      }
    }
  }

  /**
   * Check for alarm conditions
   */
  private checkAlarms_(): void {
    // Alarms are retrieved via getAlarms() method
  }

  /**
   * Sync state from external source
   */
  sync(state: Partial<BUCState>): void {
    super.sync(state);

    // Update UI components
    if (this.powerSwitch && state.isPowered !== undefined) {
      this.powerSwitch.sync(state.isPowered);
    }
    if (this.gainKnob && state.gain !== undefined) {
      this.gainKnob.sync(state.gain);
    }
  }

  /**
   * Check if module has alarms
   */
  getAlarms(): string[] {
    const alarms: string[] = [];

    const parentPowered = this.rfFrontEnd_.state.isPowered;
    const extRefPresent = this.rfFrontEnd_.state.isExtRefPresent;

    // Lock alarm
    if (this.state_.isPowered && !this.state_.isExtRefLocked && extRefPresent && parentPowered) {
      alarms.push('BUC not locked to reference');
    }

    // High output power warning
    if (this.state_.outputPower > 10) {
      alarms.push(`BUC output power high (${this.state_.outputPower.toFixed(1)} dBm)`);
    }

    return alarms;
  }

  /**
   * Update the DOM to reflect current state
   */
  protected syncDomWithState_(): void {
    if (!this.hasStateChanged()) {
      return; // No changes, skip update
    }

    const container = qs('.buc-module');
    if (!container) return;

    // Update LO frequency display
    const loDisplay = qs('.buc-lo-display', container);
    if (loDisplay) {
      loDisplay.textContent = this.state_.loFrequency.toString();
    }

    // Update LO frequency input
    const loInput: HTMLInputElement = qs('.input-buc-lo', container);
    if (loInput) {
      loInput.value = this.state_.loFrequency.toString();
    }

    // Update lock LED
    const lockLed = qs('.led-indicator .led', container);
    if (lockLed) {
      lockLed.className = `led ${this.getLockLedStatus_()}`;
    }

    // Update mute button
    const muteButton: HTMLButtonElement = qs('[data-action="toggle-buc-mute"]', container);
    if (muteButton) {
      muteButton.className = `btn-mute ${this.state_.isMuted ? 'active' : ''}`;
      muteButton.textContent = this.state_.isMuted ? 'ON' : 'OFF';
    }

    this.powerSwitch.sync(this.state_.isPowered);
    this.gainKnob.sync(this.state_.gain);
  }

  /**
   * Calculate upconverted RF frequency
   * @param ifFrequency IF input frequency in Hz
   * @returns RF output frequency in Hz
   */
  calculateRfFrequency(ifFrequency: IfFrequency): RfFrequency {
    return (ifFrequency + this.state_.loFrequency * 1e6) as RfFrequency;
  }

  /**
   * Get total gain through BUC
   * @returns Gain in dB
   */
  getTotalGain(): number {
    if (!this.state_.isPowered || this.state_.isMuted) {
      return -120; // Effectively off
    }
    return this.state_.gain;
  }

  /**
   * Get output power for given input power
   * @param inputPowerDbm Input IF power in dBm
   * @returns Output RF power in dBm
   */
  getOutputPower(inputPowerDbm: number): number {
    if (!this.state_.isPowered || this.state_.isMuted) {
      return -120; // Effectively off
    }
    return inputPowerDbm + this.state_.gain;
  }
}
