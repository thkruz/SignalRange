import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import { IfFrequency, RfFrequency } from "@app/types";
import { RFFrontEnd } from '../rf-front-end';
import { RFFrontEndModule } from '../rf-front-end-module';
import './coupler-module.css';

/**
 * Spectrum analyzer tap point options
 */
export type TapPoint = 'PRE' | 'POST' | 'IF';

/**
 * Spectrum Analyzer coupler module state
 */
export interface CouplerState {
  tapPointA: TapPoint;
  tapPointB: TapPoint;
  couplingFactorA: number; // dB (typically -30)
  couplingFactorB: number; // dB (typically -30)
  isActiveA: boolean;
  isActiveB: boolean;
}

export class CouplerModule extends RFFrontEndModule<CouplerState> {
  private static instance_: CouplerModule;

  static create(state: CouplerState, rfFrontEnd: RFFrontEnd, unit: number = 1): CouplerModule {
    this.instance_ ??= new CouplerModule(state, rfFrontEnd, unit);
    return this.instance_;
  }

  static getInstance(): CouplerModule {
    return this.instance_;
  }

  private constructor(state: CouplerState, rfFrontEnd: RFFrontEnd, unit: number = 1) {
    super(state, rfFrontEnd, 'rf-fe-coupler', unit);

    this.html_ = html`
      <div class="rf-fe-module coupler-module">
        <div class="module-label">SPEC-A TAPS</div>
        <div class="module-controls">
          <!-- Tap Point A -->
          <div class="control-group">
            <label>TAP POINT A</label>
            <select class="input-coupler-tap-a" data-param="tapPointA">
              <option value="PRE" ${this.state_.tapPointA === 'PRE' ? 'selected' : ''}>RF PRE</option>
              <option value="POST" ${this.state_.tapPointA === 'POST' ? 'selected' : ''}>RF POST</option>
              <option value="IF" ${this.state_.tapPointA === 'IF' ? 'selected' : ''}>IF</option>
            </select>
          </div>
          <div class="led-indicator">
            <span class="indicator-label">ACTIVE A</span>
            <div class="led ${this.state_.isActiveA ? 'led-green' : 'led-off'}"></div>
          </div>

          <!-- Coupling Factor Display -->
          <div class="value-display">
            <span class="display-label">COUPLING A:</span>
            <span id="coupling-factor-a" class="value-readout">${this.state_.couplingFactorA} dB</span>
          </div>

          <!-- Tap Point B -->
          <div class="control-group">
            <label>TAP POINT B</label>
            <select class="input-coupler-tap-b" data-param="tapPointB">
              <option value="PRE" ${this.state_.tapPointB === 'PRE' ? 'selected' : ''}>RF PRE</option>
              <option value="POST" ${this.state_.tapPointB === 'POST' ? 'selected' : ''}>RF POST</option>
              <option value="IF" ${this.state_.tapPointB === 'IF' ? 'selected' : ''}>IF</option>
            </select>
          </div>
          <div class="led-indicator">
            <span class="indicator-label">ACTIVE B</span>
            <div class="led ${this.state_.isActiveB ? 'led-green' : 'led-off'}"></div>
          </div>

          <!-- Coupling Factor Display -->
          <div class="value-display">
            <span class="display-label">COUPLING B:</span>
            <span id="coupling-factor-b" class="value-readout">${this.state_.couplingFactorB} dB</span>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Add event listeners for user interactions
   */
  addEventListeners(cb: (state: CouplerState) => void): void {
    const container = qs('.coupler-module');
    if (!container) {
      console.warn('CouplerModule: Cannot add event listeners - module not found in DOM');
      return;
    }

    // Tap Point A change handler
    const tapASelect = qs('.input-coupler-tap-a', container) as HTMLSelectElement;
    if (tapASelect) {
      tapASelect.addEventListener('change', (e) => {
        const target = e.target as HTMLSelectElement;
        this.state_.tapPointA = target.value as TapPoint;
        this.updateActiveStates_();
        this.syncDomWithState_();
        cb(this.state_);
      });
    }

    // Tap Point B change handler
    const tapBSelect = qs('.input-coupler-tap-b', container) as HTMLSelectElement;
    if (tapBSelect) {
      tapBSelect.addEventListener('change', (e) => {
        const target = e.target as HTMLSelectElement;
        this.state_.tapPointB = target.value as TapPoint;
        this.updateActiveStates_();
        this.syncDomWithState_();
        cb(this.state_);
      });
    }
  }

  /**
   * Update component state and check for faults
   */
  update(): void {
    this.updateActiveStates_();
  }

  /**
   * Update active states based on signal flow direction and power
   */
  private updateActiveStates_(): void {
    const isPowered = this.rfFrontEnd_.state.isPowered;
    const direction = this.rfFrontEnd_.state.signalFlowDirection;

    // Tap Point A is active if powered and on the appropriate path
    this.state_.isActiveA = isPowered && this.isTapPointActive_(this.state_.tapPointA, direction);

    // Tap Point B is active if powered and on the appropriate path
    this.state_.isActiveB = isPowered && this.isTapPointActive_(this.state_.tapPointB, direction);
  }

  /**
   * Determine if a tap point is active based on signal flow direction
   */
  private isTapPointActive_(tapPoint: TapPoint, direction: 'TX' | 'RX' | 'IDLE'): boolean {
    if (direction === 'IDLE') {
      return false;
    }

    // PRE and POST are on TX path, IF is on RX path
    if (tapPoint === 'PRE' || tapPoint === 'POST') {
      return direction === 'TX';
    } else if (tapPoint === 'IF') {
      return direction === 'RX';
    }

    return false;
  }

  /**
   * Sync state from external source
   */
  sync(state: Partial<CouplerState>): void {
    super.sync(state);

    // Update select elements
    const container = qs('.coupler-module');
    if (!container) return;

    if (state.tapPointA !== undefined) {
      const selectA = qs('.input-coupler-tap-a', container) as HTMLSelectElement;
      if (selectA) selectA.value = state.tapPointA;
    }

    if (state.tapPointB !== undefined) {
      const selectB = qs('.input-coupler-tap-b', container) as HTMLSelectElement;
      if (selectB) selectB.value = state.tapPointB;
    }
  }

  /**
   * Check if module has alarms
   */
  getAlarms(): string[] {
    const alarms: string[] = [];

    // No alarms for coupler module - it's passive
    // Could add warnings for same tap point selected twice

    if (this.state_.tapPointA === this.state_.tapPointB) {
      alarms.push('Both tap points set to same location');
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

    const container = qs('.coupler-module');
    if (!container) return;

    // Update Active A LED
    const ledA = container.querySelectorAll('.led-indicator .led')[0];
    if (ledA) {
      ledA.className = `led ${this.state_.isActiveA ? 'led-green' : 'led-off'}`;
    }

    // Update Active B LED
    const ledB = container.querySelectorAll('.led-indicator .led')[1];
    if (ledB) {
      ledB.className = `led ${this.state_.isActiveB ? 'led-green' : 'led-off'}`;
    }

    // Update coupling factor display
    const couplingReadoutA = qs('#coupling-factor-a', container);
    if (couplingReadoutA) {
      couplingReadoutA.textContent = `${this.state_.couplingFactorA} dB`;
    }

    // Update coupling factor display
    const couplingReadoutB = qs('#coupling-factor-b', container);
    if (couplingReadoutB) {
      couplingReadoutB.textContent = `${this.state_.couplingFactorB} dB`;
    }

    // Update select values
    const selectA = qs('.input-coupler-tap-a', container) as HTMLSelectElement;
    if (selectA) selectA.value = this.state_.tapPointA;

    const selectB = qs('.input-coupler-tap-b', container) as HTMLSelectElement;
    if (selectB) selectB.value = this.state_.tapPointB;
  }

  /**
   * Get coupler output for tap point A
   */
  getCouplerOutputA(): { frequency: RfFrequency | IfFrequency; power: number } {
    return this.getCouplerOutput_(this.state_.tapPointA, this.state_.couplingFactorA);
  }

  /**
   * Get coupler output for tap point B
   */
  getCouplerOutputB(): { frequency: RfFrequency | IfFrequency; power: number } {
    return this.getCouplerOutput_(this.state_.tapPointB, this.state_.couplingFactorB);
  }

  /**
   * Get coupler output for a specific tap point
   */
  private getCouplerOutput_(tapPoint: TapPoint, couplingFactor: number): { frequency: RfFrequency | IfFrequency; power: number } {
    const signalPath = this.rfFrontEnd_.state.signalPath;
    const filter = this.rfFrontEnd_.state.filter;

    switch (tapPoint) {
      case 'PRE':
        return {
          frequency: signalPath.txPath.rfFrequency,
          power: signalPath.txPath.rfPower + couplingFactor,
        };
      case 'POST':
        return {
          frequency: signalPath.txPath.rfFrequency,
          power: (signalPath.txPath.rfPower - filter.insertionLoss) + couplingFactor,
        };
      case 'IF':
        return {
          frequency: signalPath.rxPath.ifFrequency,
          power: signalPath.rxPath.ifPower + couplingFactor,
        };
    }
  }
}
