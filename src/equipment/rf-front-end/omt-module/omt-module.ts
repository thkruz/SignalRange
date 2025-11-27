import { HelpButton } from '@app/components/help-btn/help-btn';
import { html } from "@app/engine/utils/development/formatter";
import { Logger } from '@app/logging/logger';
import { SignalOrigin } from "@app/SignalOrigin";
import type { dBi, dBm, RfSignal } from '@app/types';
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
    this.helpBtn_ = HelpButton.create(
      `omt-help-${this.rfFrontEnd_.state.uuid}`,
      "OMT / Duplexer",
      null,
      'https://docs.signalrange.space/equipment/orthomode-transducer?content-only=true&dark=true'
    );

    this.html_ = html`
      <div class="rf-fe-module omt-module">
        <div class="module-label">
          <span>OMT/DUPLEXER</span>
          ${this.helpBtn_.html}
        </div>
      </div>
    `;
  }

  /**
   * Initialize DOM structure (stub for backward compatibility)
   * @deprecated This module will be refactored to use the new pattern
   */
  protected initializeDom(_parentId: string): HTMLElement {
    // Stub implementation - this module still uses old pattern
    return document.createElement('div') as unknown as HTMLElement;
  }

  /**
   * Get UI components for composite layouts
   * Exposes OMT module components for parent to arrange in custom layouts
   */
  getComponents() {
    return {
      helpBtn: this.helpBtn_
    };
  }

  /**
   * Get display value functions for composite layouts
   * Returns functions that compute current display values
   */
  getDisplays() {
    return {
      txPolarization: () => this.state_.txPolarization || 'None',
      rxPolarization: () => this.state_.rxPolarization || 'None',
      crossPolIsolation: () => this.state_.crossPolIsolation.toFixed(1)
    };
  }

  /**
   * Get LED status functions for composite layouts
   * Returns functions that compute current LED states
   */
  getLEDs() {
    return {
      fault: () => this.state_.isFaulted ? 'led-red' : 'led-off'
    };
  }

  /**
   * Add event listeners for user interactions
   */
  addEventListeners(_cb: (state: OMTState) => void): void {
    // No user-interactive controls in this version
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
      baseTxPol = this.state_.txPolarization;
      baseRxPol = this.state_.rxPolarization;
    }

    const reverseTxPol = baseTxPol === 'H' ? 'V' : 'H';
    const reverseRxPol = baseRxPol === 'H' ? 'V' : 'H';

    // If reversed, swap the base polarizations
    const newEffectiveTxPol = isReversed ? reverseTxPol : baseTxPol;
    const newEffectiveRxPol = isReversed ? reverseRxPol : baseRxPol;

    const txChanged = this.state_.effectiveTxPol !== newEffectiveTxPol;
    const rxChanged = this.state_.effectiveRxPol !== newEffectiveRxPol;

    this.state_.effectiveTxPol = newEffectiveTxPol;
    this.state_.effectiveRxPol = newEffectiveRxPol;

    if (txChanged || rxChanged) {
      this.syncDomWithState_();
    }
  }

  getAlarms(): string[] {
    return [];
  }

  /**
   * Update the DOM to reflect current state
   */
  protected syncDomWithState_(): void {
    // Static dom
  }
}
