import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import { IfFrequency, RfFrequency } from "@app/types";
import { RFFrontEnd } from '../rf-front-end';
import { RFFrontEndModule } from '../rf-front-end-module';
import './coupler-module.css';

/**
 * Spectrum analyzer tap point options
 */
export type TapPoint = 'TX IF' | 'RX IF' | 'POST BUC / PRE HPA TX RF' | 'POST HPA / PRE OMT TX RF' | 'POST OMT/PRE ANT TX RF' | 'PRE OMT/POST ANT RX RF' | 'POST OMT/PRE LNA RX RF' | 'POST LNA RX RF'

/**
 * Spectrum Analyzer coupler module state
 */
export interface CouplerState {
  isPowered: boolean;
  tapPointA: TapPoint;
  tapPointB: TapPoint;
  couplingFactorA: number; // dB (typically -30)
  couplingFactorB: number; // dB (typically -30)
  isActiveA: boolean;
  isActiveB: boolean;
}

export class CouplerModule extends RFFrontEndModule<CouplerState> {
  private static instance_: CouplerModule;

  /**
   * Get default state for Coupler module
   */
  static getDefaultState(): CouplerState {
    return {
      isPowered: true,
      tapPointA: 'TX IF',
      tapPointB: 'RX IF',
      couplingFactorA: -30, // dB
      couplingFactorB: -20, // dB
      isActiveA: true,
      isActiveB: true,
    };
  }

  static create(state: CouplerState, rfFrontEnd: RFFrontEnd, unit: number = 1): CouplerModule {
    this.instance_ ??= new CouplerModule(state, rfFrontEnd, unit);
    return this.instance_;
  }

  static getInstance(): CouplerModule {
    return this.instance_;
  }

  private constructor(state: CouplerState, rfFrontEnd: RFFrontEnd, unit: number = 1) {
    super(state, rfFrontEnd, 'rf-fe-coupler', unit);

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
              <div class="led led-a ${this.state_.isActiveA ? 'led-green' : 'led-off'}"></div>
            </div>
            <div class="led-indicator">
              <span class="indicator-label">ACTIVE B</span>
              <div class="led led-b ${this.state_.isActiveB ? 'led-green' : 'led-off'}"></div>
            </div>
          </div>

          <div class="status-displays">
            <div class="control-group">
              <label>TAP POINT A</label>
              <select class="input-coupler-tap-a" data-param="tapPointA">
                ${tapPointOptions.map(tp => `<option value="${tp}"${this.state_.tapPointA === tp ? ' selected' : ''}>${tp}</option>`).join('\n')}
              </select>
            </div>
            <div class="control-group">
              <label>TAP POINT B</label>
              <select class="input-coupler-tap-b" data-param="tapPointB">
                ${tapPointOptions.map(tp => `<option value="${tp}"${this.state_.tapPointB === tp ? ' selected' : ''}>${tp}</option>`).join('\n')}
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
      'TX IF',
      'POST BUC / PRE HPA TX RF',
      'POST HPA / PRE OMT TX RF',
      'POST OMT/PRE ANT TX RF'
    ];

    const rxTapPoints: TapPoint[] = [
      'RX IF',
      'PRE OMT/POST ANT RX RF',
      'POST OMT/PRE LNA RX RF',
      'POST LNA RX RF'
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
    const ledA = qs('.led-a', container);
    if (ledA) {
      ledA.className = `led ${this.state_.isActiveA ? 'led-green' : 'led-off'}`;
    }

    // Update Active B LED
    const ledB = qs('.led-b', container);
    if (ledB) {
      ledB.className = `led ${this.state_.isActiveB ? 'led-green' : 'led-off'}`;
    }

    // Update coupling factor display
    qs('.coupling-factor-a', container).textContent = `${this.state_.couplingFactorA} dB`;
    qs('.coupling-factor-b', container).textContent = `${this.state_.couplingFactorB} dB`;

    // Update select values
    const selectA: HTMLSelectElement = qs('.input-coupler-tap-a', container);
    if (selectA) selectA.value = this.state_.tapPointA;

    const selectB: HTMLSelectElement = qs('.input-coupler-tap-b', container);
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
