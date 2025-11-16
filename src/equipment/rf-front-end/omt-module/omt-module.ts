import { HelpButton } from '@app/components/help-btn/help-btn';
import { ToggleSwitch } from '@app/components/toggle-switch/toggle-switch';
import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import { Logger } from '@app/logging/logger';
import { dBi, dBm, RfSignal, SignalOrigin } from '@app/types';
import { RFFrontEnd } from '../rf-front-end';
import { RFFrontEndModule } from '../rf-front-end-module';
import { dB } from './../../../types';
import './omt-module.css';

/**
 * Polarization types for OMT/Duplexer
 */
export type PolarizationType = null | 'H' | 'V' | 'LHCP' | 'RHCP';

/**
 * OMT/Duplexer module state
 */
export interface OMTState {
  isPowered: boolean;
  insertionLoss: dB; // part of state to make it easier to insert faults
  txPolarization: PolarizationType;
  rxPolarization: PolarizationType;
  crossPolIsolation: number; // dB (typical 25-35)
  isFaulted: boolean; // true if isolation < 20 dB
  effectiveTxPol: PolarizationType; // Effective TX polarization based on skew
  effectiveRxPol: PolarizationType; // Effective RX polarization based on skew
}

export class OMTModule extends RFFrontEndModule<OMTState> {
  // UI Components
  private readonly polarizationToggle_: ToggleSwitch;

  // Signals
  rxSignalsOut: RfSignal[] = [];
  txSignalsOut: RfSignal[] = [];

  /**
   * Get default state for OMT module
   */
  static getDefaultState(): OMTState {
    return {
      isPowered: true,
      txPolarization: 'H',
      rxPolarization: 'V',
      effectiveTxPol: 'H',
      effectiveRxPol: 'V',
      crossPolIsolation: 28.5 as dB,
      isFaulted: false,
      insertionLoss: 0.5 as dB
    };
  }

  constructor(state: OMTState, rfFrontEnd: RFFrontEnd, unit: number = 1) {
    super(state, rfFrontEnd, 'rf-fe-omt-pol', unit);

    // Create UI components
    this.polarizationToggle_ = ToggleSwitch.create(
      this.uniqueId,
      this.state_.txPolarization === 'V'
    );
    this.helpBtn_ = HelpButton.create(
      `omt-help-${this.rfFrontEnd_.state.uuid}`,
      "OMT / Duplexer",
      null,
      'http://docs.signalrange.space/equipment/orthomode-transducer?content-only=true&dark=true'
    );

    this.html_ = html`
      <div class="rf-fe-module omt-module">
        <div class="module-label">
          <span>OMT/DUPLEXER</span>
          ${this.helpBtn_.html}
        </div>
        <div class="module-controls">
          <div class="split-top-section">
            <div class="input-knobs">
              <div class="control-group">
                <label>TOGGLE</label>
                ${this.polarizationToggle_.html}
              </div>
            </div>
            <div class="led-indicators">
              <div class="led-indicator">
                <span class="indicator-label">X-POL</span>
                <div class="led ${this.getXPolLedStatus_()}"></div>
              </div>
            </div>
          </div>
          <!-- Status Displays -->
          <div class="status-displays">
            <div class="control-group">
              <label>TX POL</label>
              <div class="digital-display omt-tx">${this.state_.txPolarization ?? '_'}</div>
            </div>
            <div class="control-group">
              <label>RX POL</label>
              <div class="digital-display omt-rx">${this.state_.rxPolarization ?? '_'}</div>
            </div>
            <div class="control-group">
              <!-- Gap -->
            </div>
            <div class="control-group">
              <label>TX EFF POL</label>
              <div class="digital-display omt-tx-eff">${this.state_.effectiveTxPol ?? '_'}</div>
            </div>
            <div class="control-group">
              <label>RX EFF POL</label>
              <div class="digital-display omt-rx-eff">${this.state_.effectiveRxPol ?? '_'}</div>
            </div>
            <div class="control-group">
              <label>X-POL (dB)</label>
              <div class="digital-display omt-x-pol">${this.state_.crossPolIsolation ?? '_'}</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private getXPolLedStatus_(): string | number {
    if (this.state_.crossPolIsolation < 25) {
      return 'led-red';
    }
    if (this.state_.crossPolIsolation < 30) {
      return 'led-amber';
    }

    return 'led-green';
  }

  /**
   * Add event listeners for user interactions
   */
  addEventListeners(cb: (state: OMTState) => void): void {
    if (!this.polarizationToggle_) {
      console.warn('OMTModule: Cannot add event listeners - components not initialized');
      return;
    }

    this.polarizationToggle_.addEventListeners((isVertical: boolean) => {
      // Toggle between H and V polarization
      this.state_.txPolarization = isVertical ? 'V' : 'H';
      this.state_.rxPolarization = isVertical ? 'H' : 'V';

      // Update the polarization displays
      this.updatePolarizationDisplays_();

      // Notify parent of state change
      cb(this.state_);
    });
  }

  /**
   * Update component state and check for faults
   */
  update(): void {
    this.updateCrossPolIsolation_();

    // Calculate effective polarization based on antenna skew
    this.updateEffectivePolarization_(this.rfFrontEnd_.antenna?.state.polarization ?? null);

    this.rxSignalsOut = this.rxSignalsIn.map(sig => {
      if (sig.polarization !== this.state_.effectiveRxPol) {
        // Apply cross-pol isolation loss
        const isolatedPower = sig.power - this.state_.crossPolIsolation;
        return {
          ...sig,
          power: isolatedPower as dBm,
          isDegraded: true,
          origin: SignalOrigin.OMT_RX,
        };
      }

      return sig;
    });

    // Set TX signal polarization based on OMT setting
    // Any changes to the TX signals' polarization by the antenna module
    // will happen inside the antenna module itself
    this.txSignalsOut = this.txSignalsIn.map((sig: RfSignal) => {
      return {
        ...sig,
        polarization: this.state_.txPolarization,
        origin: SignalOrigin.OMT_TX,
      };
    });
  }

  get txSignalsIn(): RfSignal[] {
    return this.rfFrontEnd_.hpaModule.outputSignals;
  }

  get rxSignalsIn(): RfSignal[] {
    if (this.rfFrontEnd_.antenna?.state.isLoopback) {
      // In loopback mode, RX signals come from the TX path
      return this.txSignalsOut.map(sig => ({
        ...sig,
        polarization: sig.polarization === 'H' ? 'V' : 'H', // Reverse polarization for RX
      }));
    }

    const rxSignals = this.rfFrontEnd_.antenna?.state.rxSignalsIn.map(sig => ({
      ...sig,
      // Add small loss through OMT to the gain calculation
      gainInPath: (sig.gainInPath - 0.5) as dBi,
    }));

    return rxSignals ?? [];
  }

  private updateCrossPolIsolation_(): void {
    if (!this.rfFrontEnd_.antenna) {
      Logger.warn('OMTModule', 'Cannot update cross-pol isolation - antenna module not found');
      this.state.isFaulted = true;
      return;
    }

    // Check polarization of visible signal
    const signal = this.rfFrontEnd_.antenna.state.rxSignalsIn[0];
    if (signal) {
      if (signal.polarization === this.state_.effectiveRxPol) {
        // Aligned polarization, normal isolation
        this.state_.crossPolIsolation = 30 + Math.random() * 5; // 30-35 dB
      } else {
        // Misaligned polarization, degraded isolation
        this.state_.crossPolIsolation = 15 + Math.random() * 10; // 15-25 dB
      }
    } else {
      // No signal, normal isolation
      this.state_.crossPolIsolation = 30 + Math.random() * 5; // 30-35 dB
    }

    // Update fault status
    this.state_.isFaulted = this.state_.crossPolIsolation < 25;
  }

  /**
   * Calculate effective polarization based on antenna skew and OMT reversal
   * If OMT is set to reverse (txPolarization = 'V'), effective polarization is opposite of what skew would normally do.
   * H if |θ| < 15°, V if |θ−90°| < 15°, but reversed if OMT is toggled.
   * @param skew Antenna skew in degrees
   */
  private updateEffectivePolarization_(skew: number | null): void {
    if (skew === null) {
      this.state_.effectiveTxPol = null;
      this.state_.effectiveRxPol = null;
      return;
    }

    // Normalize skew to 0-180 range
    const normalizedSkew = ((skew % 180) + 180) % 180;

    // Determine if OMT is set to reverse (toggle switch is vertical)
    const isReversed = this.state_.txPolarization === 'V';

    let baseTxPol: PolarizationType;
    let baseRxPol: PolarizationType;

    if (Math.abs(normalizedSkew) < 15 || Math.abs(normalizedSkew - 180) < 15) {
      baseTxPol = 'H';
      baseRxPol = 'V';
    } else if (Math.abs(normalizedSkew - 90) < 15) {
      baseTxPol = 'V';
      baseRxPol = 'H';
    } else {
      // Logger.info('OMTModule', 'Skew between polarizations, using configured pol');
      baseTxPol = this.state_.txPolarization;
      baseRxPol = this.state_.rxPolarization;
    }

    // If reversed, swap the base polarizations
    const newEffectiveTxPol = isReversed ? (baseTxPol === 'H' ? 'V' : 'H') : baseTxPol;
    const newEffectiveRxPol = isReversed ? (baseRxPol === 'H' ? 'V' : 'H') : baseRxPol;

    const txChanged = this.state_.effectiveTxPol !== newEffectiveTxPol;
    const rxChanged = this.state_.effectiveRxPol !== newEffectiveRxPol;

    this.state_.effectiveTxPol = newEffectiveTxPol;
    this.state_.effectiveRxPol = newEffectiveRxPol;

    if (txChanged || rxChanged) {
      this.syncDomWithState_();
    }
  }

  /**
   * Sync state from external source
   */
  sync(state: Partial<OMTState>): void {
    super.sync(state);
  }

  /**
   * Check if module has alarms
   */
  getAlarms(): string[] {
    const alarms: string[] = [];

    if (this.state_.isFaulted) {
      alarms.push('Cross-pol isolation degraded');
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
    const container = qs('.omt-module');
    if (!container) return;

    // Update polarization displays
    this.updatePolarizationDisplays_();

    // Update cross-pol LED
    const xpolLed = container.querySelector('.led-indicator .led');
    if (xpolLed) {
      xpolLed.className = `led ${this.getXPolLedStatus_()}`;
    }

    // Update cross-pol isolation readout
    const xpolReadout = container.querySelector('.led-indicator .value-readout');
    if (xpolReadout) {
      xpolReadout.textContent = `${this.state_.crossPolIsolation.toFixed(1)} dB`;
    }
  }

  /**
   * Update all polarization digital displays
   */
  private updatePolarizationDisplays_(): void {
    const container = qs('.omt-module');
    if (!container) return;

    // Update TX POL
    const txPolDisplay = container.querySelector('.omt-tx');
    if (txPolDisplay) {
      txPolDisplay.textContent = this.state_.txPolarization;
    }

    // Update RX POL
    const rxPolDisplay = container.querySelector('.omt-rx');
    if (rxPolDisplay) {
      rxPolDisplay.textContent = this.state_.rxPolarization;
    }

    // Update TX Effective POL and check for mismatch
    const txEffDisplay = container.querySelector('.omt-tx-eff');
    if (txEffDisplay) {
      txEffDisplay.textContent = this.state_.effectiveTxPol || '―';

      // Add mismatch class if TX POL and TX EFF don't match
      if (this.state_.effectiveTxPol && this.state_.effectiveTxPol !== this.state_.txPolarization) {
        txEffDisplay.classList.add('pol-mismatch');
      } else {
        txEffDisplay.classList.remove('pol-mismatch');
      }
    }

    // Update RX Effective POL and check for mismatch
    const rxEffDisplay = container.querySelector('.omt-rx-eff');
    if (rxEffDisplay) {
      rxEffDisplay.textContent = this.state_.effectiveRxPol || '―';

      // Add mismatch class if RX POL and RX EFF don't match
      if (this.state_.effectiveRxPol && this.state_.effectiveRxPol !== this.state_.rxPolarization) {
        rxEffDisplay.classList.add('pol-mismatch');
      } else {
        rxEffDisplay.classList.remove('pol-mismatch');
      }
    }

    const crossPolElement = qs('.omt-x-pol', container);
    if (crossPolElement) {
      crossPolElement.textContent = this.state_.crossPolIsolation.toFixed(1);
      if (this.state_.isFaulted) {
        crossPolElement.classList.add('pol-mismatch');
      } else {
        crossPolElement.classList.remove('pol-mismatch');
      }
    }
  }
}
