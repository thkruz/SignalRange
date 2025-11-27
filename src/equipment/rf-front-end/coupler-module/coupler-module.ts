import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import { SignalPathManager } from "@app/simulation/signal-path-manager";
import { IfFrequency, RfFrequency } from "@app/types";
import { RFFrontEnd } from '../rf-front-end';
import { RFFrontEndModule } from '../rf-front-end-module';
import './coupler-module.css';

/**
 * Spectrum analyzer tap point options
 */
export enum TapPoint {
  TX_IF = 'TX IF',
  RX_IF = 'RX IF',
  TX_RF_POST_BUC = 'TX RF POST BUC',
  TX_RF_POST_HPA = 'TX RF POST HPA',
  TX_RF_POST_OMT = 'TX RF POST OMT',
  RX_RF_PRE_OMT = 'RX RF PRE OMT',
  RX_RF_POST_OMT = 'RX RF POST OMT',
  RX_RF_POST_LNA = 'RX RF POST LNA',
}

/**
 * Spectrum Analyzer coupler module state
 */
export interface CouplerState {
  isPowered: boolean;
  tapPointA: TapPoint;
  tapPointB: TapPoint;
  availableTapPointsA?: TapPoint[];
  availableTapPointsB?: TapPoint[];
  couplingFactorA: number; // dB (typically -30)
  couplingFactorB: number; // dB (typically -30)
  isActiveA: boolean;
  isActiveB: boolean;
}

export class CouplerModule extends RFFrontEndModule<CouplerState> {
  signalPathManager: SignalPathManager;

  /**
   * Get default state for Coupler module
   */
  static getDefaultState(): CouplerState {
    return {
      isPowered: true,
      tapPointA: TapPoint.TX_IF,
      tapPointB: TapPoint.RX_IF,
      availableTapPointsA: [TapPoint.TX_IF, TapPoint.TX_RF_POST_BUC, TapPoint.TX_RF_POST_HPA, TapPoint.TX_RF_POST_OMT],
      availableTapPointsB: [TapPoint.RX_IF, TapPoint.RX_RF_PRE_OMT, TapPoint.RX_RF_POST_OMT, TapPoint.RX_RF_POST_LNA],
      couplingFactorA: -30, // dB
      couplingFactorB: -20, // dB
      isActiveA: true,
      isActiveB: true,
    };
  }

  constructor(state: CouplerState, rfFrontEnd: RFFrontEnd, unit: number = 1) {
    super(state, rfFrontEnd, 'rf-fe-coupler', unit);

    this.signalPathManager = new SignalPathManager(this.rfFrontEnd_);

    const tapPointOptions = [
      'TX IF',
      'RX IF',
      'POST BUC / PRE HPA TX RF',
      'POST HPA / PRE OMT TX RF',
      'POST OMT/PRE ANT TX RF',
      'PRE OMT/POST ANT RX RF',
      'POST OMT/PRE LNA RX RF',
      'POST LNA RX RF'
    ];

    this.html_ = html`
      <div class="rf-fe-module coupler-module">
        <div class="module-label">SPEC-A TAPS</div>
        <div class="module-controls">
          <div class="led-indicators">
            <div class="led-indicator">
              <span class="indicator-label">ACTIVE A</span>
              <div id="led-a" class="led ${this.state_.isActiveA ? 'led-green' : 'led-off'}"></div>
            </div>
            <div class="led-indicator">
              <span class="indicator-label">ACTIVE B</span>
              <div id="led-b" class="led ${this.state_.isActiveB ? 'led-green' : 'led-off'}"></div>
            </div>
          </div>

          <div class="status-displays">
            <div class="control-group">
              <label>TAP POINT A</label>
              <select class="input-coupler-tap-a" data-param="tapPointA">
                ${(this.state_.availableTapPointsA ?? tapPointOptions).map(tp => `<option value="${tp}"${this.state_.tapPointA === tp ? ' selected' : ''}>${tp}</option>`).join('\n')}
              </select>
            </div>
            <div class="control-group">
              <label>TAP POINT B</label>
              <select class="input-coupler-tap-b" data-param="tapPointB">
                ${(this.state_.availableTapPointsB ?? tapPointOptions).map(tp => `<option value="${tp}"${this.state_.tapPointB === tp ? ' selected' : ''}>${tp}</option>`).join('\n')}
              </select>
            </div>
          </div>

          <div class="status-displays">
            <div class="control-group">
              <label>COUPLING A (dB)</label>
              <div class="digital-display coupling-factor-a">${this.state_.couplingFactorA}</div>
            </div>
            <div class="control-group">
              <label>COUPLING B (dB)</label>
              <div class="digital-display coupling-factor-b">${this.state_.couplingFactorB}</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Get UI components for composite layouts
   * Exposes Coupler module components for parent to arrange in custom layouts
   */
  getComponents() {
    return {
      // No interactive components in this module yet
    };
  }

  /**
   * Get display value functions for composite layouts
   * Returns functions that compute current display values
   */
  getDisplays() {
    return {
      tapPointA: () => this.state_.tapPointA,
      tapPointB: () => this.state_.tapPointB,
      couplingFactorA: () => this.state_.couplingFactorA.toFixed(1),
      couplingFactorB: () => this.state_.couplingFactorB.toFixed(1)
    };
  }

  /**
   * Get LED status functions for composite layouts
   * Returns functions that compute current LED states
   */
  getLEDs() {
    return {
      activeA: () => this.state_.isActiveA ? 'led-green' : 'led-off',
      activeB: () => this.state_.isActiveB ? 'led-green' : 'led-off'
    };
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
    // Tap Point A is active if powered and on the appropriate path
    this.state_.isActiveA = this.isTapPointActive_(this.state_.tapPointA);

    // Tap Point B is active if powered and on the appropriate path
    this.state_.isActiveB = this.isTapPointActive_(this.state_.tapPointB);
  }

  /**
   * Determine if a tap point is active based on signal flow direction
   */
  private isTapPointActive_(tapPoint: TapPoint): boolean {
    const txTapPoints: TapPoint[] = [
      TapPoint.TX_IF,
      TapPoint.TX_RF_POST_BUC,
      TapPoint.TX_RF_POST_HPA,
      TapPoint.TX_RF_POST_OMT
    ];

    const rxTapPoints: TapPoint[] = [
      TapPoint.RX_IF,
      TapPoint.RX_RF_PRE_OMT,
      TapPoint.RX_RF_POST_OMT,
      TapPoint.RX_RF_POST_LNA
    ];

    if (
      txTapPoints.includes(tapPoint) ||
      rxTapPoints.includes(tapPoint)
    ) {
      return true;
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
    const ledA = qs('#led-a', container);
    if (ledA) {
      ledA.className = `led ${this.state_.isActiveA ? 'led-green' : 'led-off'}`;
    }

    // Update Active B LED
    const ledB = qs('#led-b', container);
    if (ledB) {
      ledB.className = `led ${this.state_.isActiveB ? 'led-green' : 'led-off'}`;
    }

    // TODO: We should be using a domCache instead of querying each time

    // Update coupling factor display
    qs('.coupling-factor-a', container)!.textContent = `${this.state_.couplingFactorA} dB`;
    qs('.coupling-factor-b', container)!.textContent = `${this.state_.couplingFactorB} dB`;

    // Update select values
    const selectA: HTMLSelectElement | null = qs('.input-coupler-tap-a', container);
    if (selectA) selectA.value = this.state_.tapPointA;

    const selectB: HTMLSelectElement | null = qs('.input-coupler-tap-b', container);
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
  private getCouplerOutput_(_tapPoint: TapPoint, couplingFactor: number): { frequency: RfFrequency | IfFrequency; power: number } {
    // Return a random number for now
    return {
      frequency: Math.random() * 1000 as RfFrequency | IfFrequency,
      power: - Math.abs(couplingFactor) // Coupled power is negative of coupling factor
    };
  }
}
