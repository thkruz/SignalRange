import { PowerSwitch } from '@app/components/power-switch/power-switch';
import { ToggleSwitch } from "@app/components/toggle-switch/toggle-switch";
import { EventBus } from "@app/events/event-bus";
import { html } from "../../engine/utils/development/formatter";
import { qs } from "../../engine/utils/query-selector";
import { Events } from "../../events/events";
import { IfFrequency, MHz, RfFrequency } from "../../types";
import { BaseEquipment } from "../base-equipment";
import './rf-front-end.css';

/**
 * Polarization types for OMT/Duplexer
 */
export type PolarizationType = 'H' | 'V' | 'LHCP' | 'RHCP';

/**
 * Filter bandwidth modes
 */
export type FilterMode = 'WIDE' | 'MEDIUM' | 'NARROW';

/**
 * Spectrum analyzer tap point
 */
export type TapPoint = 'RF_PRE_FILTER' | 'RF_POST_FILTER' | 'IF_AFTER_LNB';

/**
 * OMT/Duplexer module state
 */
export interface OMTState {
  txPolarization: PolarizationType;
  rxPolarization: PolarizationType;
  crossPolIsolation: number; // dB (typical 25-35)
  isFaulted: boolean; // true if isolation < 20 dB
}

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

/**
 * High Power Amplifier module state
 */
export interface HPAState {
  isEnabled: boolean;
  backOff: number; // dB from P1dB (0-10)
  outputPower: number; // dBW (1-200W -> 0-53 dBW)
  isOverdriven: boolean; // true if back-off < 3 dB
  imdLevel: number; // dBc
  temperature: number; // Celsius
}

/**
 * Preselector/Filter module state
 */
export interface FilterState {
  mode: FilterMode;
  bandwidth: MHz; // MHz
  insertionLoss: number; // dB
  centerFrequency: RfFrequency; // Hz
}

/**
 * Low Noise Block converter module state
 */
export interface LNBState {
  isPowered: boolean;
  loFrequency: MHz; // MHz (typical 3700-4200)
  gain: number; // dB (40-65)
  noiseFigure: number; // dB (0.3-1.2)
  noiseTemperature: number; // Kelvin
  isExtRefLocked: boolean;
  isSpectrumInverted: boolean;
}

/**
 * Spectrum Analyzer coupler module state
 */
export interface CouplerState {
  tapPoint: TapPoint;
  couplingFactor: number; // dB (typically -30)
  isActive: boolean;
}

/**
 * Signal path calculation result
 */
export interface SignalPath {
  txPath: {
    ifFrequency: IfFrequency;
    ifPower: number; // dBm
    rfFrequency: RfFrequency;
    rfPower: number; // dBm
    totalGain: number; // dB
  };
  rxPath: {
    rfFrequency: RfFrequency;
    rfPower: number; // dBm
    ifFrequency: IfFrequency;
    ifPower: number; // dBm
    totalGain: number; // dB
    noiseFigure: number; // dB
  };
}

/**
 * Complete RF Front-End state
 */
export interface RFFrontEndState {
  unit: number; // Case number 1-4
  teamId: number;
  serverId: number;
  isPowered: boolean;
  isExtRefPresent: boolean;
  isAdvancedMode: boolean;
  signalFlowDirection: 'TX' | 'RX' | 'IDLE';

  omt: OMTState;
  buc: BUCState;
  hpa: HPAState;
  filter: FilterState;
  lnb: LNBState;
  coupler: CouplerState;

  signalPath: SignalPath;
}

/**
 * RFFrontEnd - RF Front-End case for frequency translation and RF signal chain
 * Sits between Antenna and Receiver cases
 * Manages BUC, LNB, HPA, filters, and signal routing
 * Extends Equipment base class for standard lifecycle
 */
export class RFFrontEnd extends BaseEquipment {
  // State
  state: RFFrontEndState;
  // private inputData: Partial<RFFrontEndState> = {};
  private lastRenderState: RFFrontEndState | null = null;

  // Power management
  // private readonly powerBudget = 45000; // mW (typical RF front-end power consumption)

  // UI Components
  powerSwitch: PowerSwitch;
  omtPolarizationToggle: ToggleSwitch;
  bucPowerSwitch: PowerSwitch;
  hpaEnableSwitch: PowerSwitch;
  filterModeToggle: ToggleSwitch;
  lnbPowerSwitch: PowerSwitch;
  couplerTapToggle: ToggleSwitch;
  advancedModeToggle: ToggleSwitch;

  constructor(parentId: string, unit: number, teamId: number = 1, serverId: number = 1) {
    super(parentId, unit, teamId);

    // Initialize state with default values
    this.state = {
      unit: this.id,
      teamId: this.teamId,
      serverId: serverId,
      isPowered: true,
      isExtRefPresent: true,
      isAdvancedMode: false,
      signalFlowDirection: 'IDLE',

      omt: {
        txPolarization: 'H',
        rxPolarization: 'V',
        crossPolIsolation: 28.5, // dB
        isFaulted: false,
      },

      buc: {
        isPowered: true,
        loFrequency: 4200 as MHz, // MHz
        gain: 58, // dB
        isMuted: false,
        isExtRefLocked: true,
        outputPower: -10, // dBm
      },

      hpa: {
        isEnabled: false,
        backOff: 6, // dB
        outputPower: 10, // dBW (10W)
        isOverdriven: false,
        imdLevel: -30, // dBc
        temperature: 45, // Celsius
      },

      filter: {
        mode: 'MEDIUM',
        bandwidth: 250 as MHz, // MHz
        insertionLoss: 2.0, // dB
        centerFrequency: 5800 * 1e6 as RfFrequency, // 5.8 GHz
      },

      lnb: {
        isPowered: true,
        loFrequency: 4200 as MHz, // MHz
        gain: 55, // dB
        noiseFigure: 0.6, // dB
        noiseTemperature: 45, // K
        isExtRefLocked: true,
        isSpectrumInverted: true,
      },

      coupler: {
        tapPoint: 'RF_POST_FILTER',
        couplingFactor: -30, // dB
        isActive: true,
      },

      signalPath: {
        txPath: {
          ifFrequency: 1600 * 1e6 as IfFrequency,
          ifPower: -30,
          rfFrequency: 5800 * 1e6 as RfFrequency,
          rfPower: 10,
          totalGain: 58,
        },
        rxPath: {
          rfFrequency: 5800 * 1e6 as RfFrequency,
          rfPower: -100,
          ifFrequency: 1600 * 1e6 as IfFrequency,
          ifPower: -45,
          totalGain: 55,
          noiseFigure: 0.6,
        },
      },
    };

    this.build(parentId);

    EventBus.getInstance().on(Events.UPDATE, this.update.bind(this));
    EventBus.getInstance().on(Events.SYNC, this.syncDomWithState.bind(this));
  }

  public update(): void {
    // Update signal path calculations
    this.calculateSignalPath();

    // Update component states based on conditions
    this.updateComponentStates();

    // Check for alarms and faults
    this.checkAlarms();
  }

  initializeDom(parentId: string): HTMLElement {
    const parentDom = super.initializeDom(parentId);

    // Create UI components
    this.powerSwitch = PowerSwitch.create(
      `rf-fe-power-${this.state.unit}`,
      this.state.isPowered
    );

    this.omtPolarizationToggle = ToggleSwitch.create(
      `rf-fe-omt-pol-${this.state.unit}`,
      this.state.omt.txPolarization === 'V'
    );

    this.bucPowerSwitch = PowerSwitch.create(
      `rf-fe-buc-power-${this.state.unit}`,
      this.state.buc.isPowered
    );

    this.hpaEnableSwitch = PowerSwitch.create(
      `rf-fe-hpa-enable-${this.state.unit}`,
      this.state.hpa.isEnabled
    );

    this.filterModeToggle = ToggleSwitch.create(
      `rf-fe-filter-mode-${this.state.unit}`,
      this.state.filter.mode === 'NARROW'
    );

    this.lnbPowerSwitch = PowerSwitch.create(
      `rf-fe-lnb-power-${this.state.unit}`,
      this.state.lnb.isPowered
    );

    this.couplerTapToggle = ToggleSwitch.create(
      `rf-fe-coupler-tap-${this.state.unit}`,
      this.state.coupler.tapPoint === 'IF_AFTER_LNB'
    );

    this.advancedModeToggle = ToggleSwitch.create(
      `rf-fe-advanced-mode-${this.state.unit}`,
      this.state.isAdvancedMode
    );

    parentDom.innerHTML = html`
      <div
        id="rf-fe-box-${this.state.unit}"
        class="equipment-box" data-unit="${this.state.unit}"
      >

        <!-- Top Status Bar -->
        <div class="equipment-case-header">
          <div class="equipment-case-title">RF FRONT END ${this.state.unit}</div>
          <div class="equipment-case-power-controls">
            <div id="rf-fe-power-${this.state.unit}" class="equipment-case-main-power"></div>
            <div class="equipment-case-status-indicator">
              <span class="equipment-case-status-label">EXT REF</span>
              <div class="led ${this.state.isExtRefPresent && this.state.buc.isExtRefLocked ? 'led-green' : 'led-amber'}"></div>
            </div>
          </div>
        </div>

        <!-- Signal Flow Diagram -->
        <div class="rf-fe-signal-flow">
          <svg class="signal-flow-line" viewBox="0 0 700 80" preserveAspectRatio="none">
            <!-- TX Path (top half) -->
            <line class="flow-line flow-tx ${this.state.signalFlowDirection === 'TX' ? 'active' : ''}"
                  x1="50" y1="25" x2="650" y2="25" />
            <polygon class="flow-arrow flow-tx" points="645,25 635,20 635,30" />

            <!-- RX Path (bottom half) -->
            <line class="flow-line flow-rx ${this.state.signalFlowDirection === 'RX' ? 'active' : ''}"
                  x1="650" y1="55" x2="50" y2="55" />
            <polygon class="flow-arrow flow-rx" points="55,55 65,50 65,60" />

            <!-- Module connection points -->
            <circle class="flow-point" cx="120" cy="40" r="3" />
            <circle class="flow-point" cx="240" cy="40" r="3" />
            <circle class="flow-point" cx="360" cy="40" r="3" />
            <circle class="flow-point" cx="480" cy="40" r="3" />
            <circle class="flow-point" cx="600" cy="40" r="3" />
          </svg>
        </div>

        <!-- Main Module Container -->
        <div class="rf-fe-modules">

          ${this.state.isAdvancedMode ? html`
            <!-- OMT/Duplexer Module -->
            <div class="rf-fe-module omt-module">
              <div class="module-label">OMT/DUPLEXER</div>
              <div class="module-controls">
                <div class="control-group">
                  <label>TX/RX POL</label>
                  <div id="rf-fe-omt-pol-${this.state.unit}"></div>
                  <span class="pol-label">${this.state.omt.txPolarization}/${this.state.omt.rxPolarization}</span>
                </div>
                <div class="led-indicator">
                  <span class="indicator-label">X-POL</span>
                  <div class="led ${this.state.omt.isFaulted ? 'led-red' : 'led-off'}"></div>
                  <span class="value-readout">${this.state.omt.crossPolIsolation.toFixed(1)} dB</span>
                </div>
              </div>
            </div>
          ` : ''}

          <!-- BUC Module -->
          <div class="rf-fe-module buc-module">
            <div class="module-label">BUC</div>
            <div class="module-controls">
              <div class="control-group">
                <label>POWER</label>
                <div id="rf-fe-buc-power-${this.state.unit}"></div>
              </div>
              <div class="control-group">
                <label>LO (MHz)</label>
                <input type="number"
                       class="input-buc-lo"
                       data-param="buc.loFrequency"
                       value="${this.state.buc.loFrequency}"
                       min="3700" max="4200" step="10" />
                <div class="digital-display">${this.state.buc.loFrequency}</div>
              </div>
              <div class="control-group">
                <label>GAIN (dB)</label>
                <input type="range"
                       class="rotary-knob"
                       data-param="buc.gain"
                       value="${this.state.buc.gain}"
                       min="0" max="70" step="1" />
                <span class="value-readout">${this.state.buc.gain}</span>
              </div>
              <div class="led-indicator">
                <span class="indicator-label">LOCK</span>
                <div class="led ${this.state.buc.isExtRefLocked ? 'led-green' : 'led-red'}"></div>
              </div>
              <div class="control-group">
                <label>MUTE</label>
                <button class="btn-mute ${this.state.buc.isMuted ? 'active' : ''}"
                        data-action="toggle-buc-mute">
                  ${this.state.buc.isMuted ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>
          </div>

          ${this.state.isAdvancedMode ? html`
            <!-- HPA/SSPA Module -->
            <div class="rf-fe-module hpa-module">
              <div class="module-label">HPA/SSPA</div>
              <div class="module-controls">
                <div class="control-group">
                  <label>ENABLE</label>
                  <div id="rf-fe-hpa-enable-${this.state.unit}"></div>
                </div>
                <div class="control-group">
                  <label>BACK-OFF (dB)</label>
                  <input type="range"
                         class="rotary-knob"
                         data-param="hpa.backOff"
                         value="${this.state.hpa.backOff}"
                         min="0" max="10" step="0.5" />
                  <span class="value-readout">${this.state.hpa.backOff}</span>
                </div>
                <div class="power-meter">
                  <div class="meter-label">OUTPUT</div>
                  <div class="led-bar">
                    ${this.renderPowerMeter(this.state.hpa.outputPower)}
                  </div>
                  <span class="value-readout">${this.state.hpa.outputPower.toFixed(1)} dBW</span>
                </div>
                <div class="led-indicator">
                  <span class="indicator-label">IMD</span>
                  <div class="led ${this.state.hpa.isOverdriven ? 'led-orange' : 'led-off'}"></div>
                  <span class="value-readout">${this.state.hpa.imdLevel} dBc</span>
                </div>
              </div>
            </div>

            <!-- Filter/Preselector Module -->
            <div class="rf-fe-module filter-module">
              <div class="module-label">FILTER</div>
              <div class="module-controls">
                <div class="control-group">
                  <label>MODE</label>
                  <select class="input-filter-mode" data-param="filter.mode">
                    <option value="WIDE" ${this.state.filter.mode === 'WIDE' ? 'selected' : ''}>WIDE</option>
                    <option value="MEDIUM" ${this.state.filter.mode === 'MEDIUM' ? 'selected' : ''}>MEDIUM</option>
                    <option value="NARROW" ${this.state.filter.mode === 'NARROW' ? 'selected' : ''}>NARROW</option>
                  </select>
                </div>
                <div class="led-indicator">
                  <span class="indicator-label">INSERTION LOSS</span>
                  <div class="led led-orange" style="opacity: ${this.state.filter.insertionLoss / 3}"></div>
                  <span class="value-readout">${this.state.filter.insertionLoss.toFixed(1)} dB</span>
                </div>
                <div class="value-display">
                  <span class="display-label">BW:</span>
                  <span class="value-readout">${this.state.filter.bandwidth} MHz</span>
                </div>
              </div>
            </div>
          ` : ''}

          <!-- LNB Module -->
          <div class="rf-fe-module lnb-module">
            <div class="module-label">LNB</div>
            <div class="module-controls">
              <div class="control-group">
                <label>POWER</label>
                <div id="rf-fe-lnb-power-${this.state.unit}"></div>
              </div>
              <div class="control-group">
                <label>LO (MHz)</label>
                <input type="number"
                       class="input-lnb-lo"
                       data-param="lnb.loFrequency"
                       value="${this.state.lnb.loFrequency}"
                       min="3700" max="4200" step="10" />
                <div class="digital-display">${this.state.lnb.loFrequency}</div>
              </div>
              <div class="control-group">
                <label>GAIN (dB)</label>
                <input type="range"
                       class="rotary-knob"
                       data-param="lnb.gain"
                       value="${this.state.lnb.gain}"
                       min="40" max="65" step="1" />
                <span class="value-readout">${this.state.lnb.gain}</span>
              </div>
              <div class="led-indicator">
                <span class="indicator-label">LOCK</span>
                <div class="led ${this.state.lnb.isExtRefLocked ? 'led-green' : 'led-red'}"></div>
              </div>
              <div class="led-indicator">
                <span class="indicator-label">NOISE TEMP</span>
                <div class="led led-blue" style="filter: brightness(${2 - this.state.lnb.noiseTemperature / 50})"></div>
                <span class="value-readout">${this.state.lnb.noiseTemperature.toFixed(0)} K</span>
              </div>
            </div>
          </div>

          ${this.state.isAdvancedMode ? html`
            <!-- Spec-A Coupler Module -->
            <div class="rf-fe-module coupler-module">
              <div class="module-label">SPEC-A TAP</div>
              <div class="module-controls">
                <div class="control-group">
                  <label>TAP POINT</label>
                  <select class="input-coupler-tap" data-param="coupler.tapPoint">
                    <option value="RF_PRE_FILTER" ${this.state.coupler.tapPoint === 'RF_PRE_FILTER' ? 'selected' : ''}>RF PRE</option>
                    <option value="RF_POST_FILTER" ${this.state.coupler.tapPoint === 'RF_POST_FILTER' ? 'selected' : ''}>RF POST</option>
                    <option value="IF_AFTER_LNB" ${this.state.coupler.tapPoint === 'IF_AFTER_LNB' ? 'selected' : ''}>IF</option>
                  </select>
                </div>
                <div class="led-indicator">
                  <span class="indicator-label">ACTIVE</span>
                  <div class="led ${this.state.coupler.isActive ? 'led-green' : 'led-off'}"></div>
                </div>
                <div class="value-display">
                  <span class="display-label">COUPLING:</span>
                  <span class="value-readout">${this.state.coupler.couplingFactor} dB</span>
                </div>
              </div>
            </div>
          ` : ''}

        </div>

        <!-- Bottom Status Bar -->
        <div class="equipment-case-footer">
          <div class="signal-path-readout">
            ${this.formatSignalPath()}
          </div>
          <div class="mode-toggle">
            <button class="btn-mode-toggle" data-action="toggle-advanced-mode">
              ${this.state.isAdvancedMode ? 'SIMPLE' : 'ADVANCED'}
            </button>
          </div>
        </div>

      </div>
    `;

    return parentDom;
  }

  protected addListeners(): void {
    // No additional listeners for now
  }

  protected attachEventListeners(): void {
    const container = qs(`.equipment-box[data-unit="${this.state.unit}"]`);
    if (!container) return;

    // Input change handlers
    container.querySelectorAll('input, select').forEach(element => {
      element.addEventListener('change', this.handleInputChange.bind(this));
      element.addEventListener('input', this.handleInputChange.bind(this));
    });

    // Button action handlers
    container.querySelectorAll('[data-action]').forEach(button => {
      button.addEventListener('click', this.handleButtonAction.bind(this));
    });

    // Power switch handlers
    this.powerSwitch.addEventListeners((isPowered: boolean) => {
      this.state.isPowered = isPowered;
      if (!isPowered) {
        // Power down all modules
        this.state.buc.isPowered = false;
        this.state.hpa.isEnabled = false;
        this.state.lnb.isPowered = false;
      }
      this.syncDomWithState();
      this.emit(Events.RF_FE_POWER_CHANGED, { unit: this.id, isPowered });
    });

    this.bucPowerSwitch.addEventListeners((isPowered: boolean) => {
      if (this.state.isPowered) {
        this.state.buc.isPowered = isPowered;
        this.syncDomWithState();
        this.emit(Events.RF_FE_BUC_CHANGED, { unit: this.id, buc: this.state.buc });
      }
    });

    this.hpaEnableSwitch.addEventListeners((isEnabled: boolean) => {
      if (this.state.isPowered && this.state.buc.isPowered) {
        this.state.hpa.isEnabled = isEnabled;
        this.syncDomWithState();
        this.emit(Events.RF_FE_HPA_CHANGED, { unit: this.id, hpa: this.state.hpa });
      }
    });

    this.lnbPowerSwitch.addEventListeners((isPowered: boolean) => {
      if (this.state.isPowered) {
        this.state.lnb.isPowered = isPowered;
        this.syncDomWithState();
        this.emit(Events.RF_FE_LNB_CHANGED, { unit: this.id, lnb: this.state.lnb });
      }
    });
  }

  protected initialize(): void {
    this.syncDomWithState();
  }

  public sync(data: Partial<RFFrontEndState>): void {
    // Deep merge state
    if (data.omt) this.state.omt = { ...this.state.omt, ...data.omt };
    if (data.buc) this.state.buc = { ...this.state.buc, ...data.buc };
    if (data.hpa) this.state.hpa = { ...this.state.hpa, ...data.hpa };
    if (data.filter) this.state.filter = { ...this.state.filter, ...data.filter };
    if (data.lnb) this.state.lnb = { ...this.state.lnb, ...data.lnb };
    if (data.coupler) this.state.coupler = { ...this.state.coupler, ...data.coupler };

    // Update scalar properties
    if (data.isPowered !== undefined) this.state.isPowered = data.isPowered;
    if (data.isExtRefPresent !== undefined) this.state.isExtRefPresent = data.isExtRefPresent;
    if (data.isAdvancedMode !== undefined) this.state.isAdvancedMode = data.isAdvancedMode;
    if (data.signalFlowDirection !== undefined) this.state.signalFlowDirection = data.signalFlowDirection;

    this.syncDomWithState();
  }

  /**
   * Private Methods
   */

  private handleInputChange(e: Event): void {
    const target = e.target as HTMLInputElement | HTMLSelectElement;
    const param = target.dataset.param;
    if (!param) return;

    const value = target.type === 'number' ? parseFloat(target.value) : target.value;

    // Parse nested parameter path (e.g., "buc.loFrequency")
    const parts = param.split('.');
    if (parts.length === 2) {
      const [module, property] = parts;
      if (module in this.state && typeof this.state[module as keyof RFFrontEndState] === 'object') {
        (this.state[module as keyof RFFrontEndState] as any)[property] = value;
      }
    }

    this.calculateSignalPath();
    this.syncDomWithState();
  }

  private handleButtonAction(e: Event): void {
    const button = e.target as HTMLButtonElement;
    const action = button.dataset.action;

    switch (action) {
      case 'toggle-buc-mute':
        this.state.buc.isMuted = !this.state.buc.isMuted;
        break;
      case 'toggle-advanced-mode':
        this.state.isAdvancedMode = !this.state.isAdvancedMode;
        this.rebuild();
        break;
    }

    this.syncDomWithState();
  }
  rebuild() {
    throw new Error('Method not implemented.');
  }

  private calculateSignalPath(): void {
    // TX Path: IF → BUC (upconvert) → HPA → Filter → Antenna
    const txIfFreq = 1600; // MHz (example)
    const txIfPower = -30; // dBm

    // BUC upconversion
    const txRfFreq = txIfFreq + this.state.buc.loFrequency;
    let txRfPower = txIfPower + this.state.buc.gain;

    // HPA amplification
    if (this.state.hpa.isEnabled) {
      txRfPower += (this.state.hpa.outputPower - txRfPower);
    }

    // Filter insertion loss
    txRfPower -= this.state.filter.insertionLoss;

    this.state.signalPath.txPath = {
      ifFrequency: txIfFreq * 1e6 as IfFrequency,
      ifPower: txIfPower,
      rfFrequency: txRfFreq * 1e6 as RfFrequency,
      rfPower: txRfPower,
      totalGain: this.state.buc.gain - this.state.filter.insertionLoss,
    };

    // RX Path: Antenna → Filter → LNB (downconvert) → Receiver
    const rxRfFreq = 5800; // MHz (example)
    let rxRfPower = -100; // dBm

    // Filter insertion loss
    rxRfPower -= this.state.filter.insertionLoss;

    // LNB downconversion
    const rxIfFreq = Math.abs(rxRfFreq - this.state.lnb.loFrequency);
    let rxIfPower = rxRfPower + this.state.lnb.gain;

    this.state.signalPath.rxPath = {
      rfFrequency: rxRfFreq * 1e6 as RfFrequency,
      rfPower: -100,
      ifFrequency: rxIfFreq * 1e6 as IfFrequency,
      ifPower: rxIfPower,
      totalGain: this.state.lnb.gain,
      noiseFigure: this.state.lnb.noiseFigure,
    };
  }

  private updateComponentStates(): void {
    // Update HPA overdrive status
    this.state.hpa.isOverdriven = this.state.hpa.backOff < 3;

    // Update OMT cross-pol fault
    this.state.omt.isFaulted = this.state.omt.crossPolIsolation < 20;

    // Update external reference lock status
    if (!this.state.isExtRefPresent) {
      this.state.buc.isExtRefLocked = false;
      this.state.lnb.isExtRefLocked = false;
    }

    // Calculate LNB noise temperature from noise figure
    // T = 290 * (10^(NF/10) - 1)
    const nfLinear = Math.pow(10, this.state.lnb.noiseFigure / 10);
    this.state.lnb.noiseTemperature = 290 * (nfLinear - 1);
  }

  private checkAlarms(): void {
    const alarms: string[] = [];

    if (!this.state.isExtRefPresent) {
      alarms.push('External reference lost');
    }

    if (!this.state.buc.isExtRefLocked && this.state.buc.isPowered) {
      alarms.push('BUC not locked to reference');
    }

    if (!this.state.lnb.isExtRefLocked && this.state.lnb.isPowered) {
      alarms.push('LNB not locked to reference');
    }

    if (this.state.hpa.isOverdriven) {
      alarms.push('HPA overdrive - IMD degradation');
    }

    if (this.state.omt.isFaulted) {
      alarms.push('Cross-pol isolation degraded');
    }

    if (alarms.length > 0) {
      this.emit(Events.RF_FE_ALARM, { unit: this.id, alarms });
    }
  }

  private formatSignalPath(): string {
    const tx = this.state.signalPath.txPath;
    const rx = this.state.signalPath.rxPath;

    if (this.state.signalFlowDirection === 'TX') {
      return `TX: ${(tx.ifFrequency / 1e6).toFixed(0)} MHz IF → [BUC +${this.state.buc.loFrequency}] → ${(tx.rfFrequency / 1e6).toFixed(0)} MHz RF @ ${tx.rfPower.toFixed(1)} dBm`;
    } else if (this.state.signalFlowDirection === 'RX') {
      return `RX: ${(rx.rfFrequency / 1e6).toFixed(0)} MHz RF → [LNB -${this.state.lnb.loFrequency}] → ${(rx.ifFrequency / 1e6).toFixed(0)} MHz IF @ ${rx.ifPower.toFixed(1)} dBm`;
    } else {
      return 'Signal flow idle';
    }
  }

  private renderPowerMeter(powerDbW: number): string {
    // 5-segment LED bar for 0-50 dBW range
    const segments = 5;
    const segmentThreshold = 10; // dBW per segment
    const activeSegments = Math.min(segments, Math.floor(powerDbW / segmentThreshold) + 1);

    let html = '';
    for (let i = 0; i < segments; i++) {
      const isActive = i < activeSegments;
      const color = i < 3 ? 'led-green' : i < 4 ? 'led-orange' : 'led-red';
      html += `<div class="led ${isActive ? color : 'led-off'}"></div>`;
    }
    return html;
  }

  private syncDomWithState(): void {
    // Prevent unnecessary re-renders
    if (JSON.stringify(this.state) === JSON.stringify(this.lastRenderState)) {
      return;
    }

    // Update UI based on state changes
    const container = qs(`.equipment-box[data-unit="${this.state.unit}"]`);
    if (!container) return;

    // Update digital displays
    const bucLoDisplay = container.querySelector('.buc-module .digital-display');
    if (bucLoDisplay) {
      bucLoDisplay.textContent = this.state.buc.loFrequency.toString();
    }

    const lnbLoDisplay = container.querySelector('.lnb-module .digital-display');
    if (lnbLoDisplay) {
      lnbLoDisplay.textContent = this.state.lnb.loFrequency.toString();
    }

    // Update signal path readout
    const pathReadout = container.querySelector('.signal-path-readout');
    if (pathReadout) {
      pathReadout.textContent = this.formatSignalPath();
    }

    // Update LED indicators
    this.updateLEDs(container);

    // Update power switches
    if (this.powerSwitch) {
      this.powerSwitch.sync(this.state.isPowered);
    }
    if (this.bucPowerSwitch) {
      this.bucPowerSwitch.sync(this.state.buc.isPowered);
    }
    if (this.hpaEnableSwitch) {
      this.hpaEnableSwitch.sync(this.state.hpa.isEnabled);
    }
    if (this.lnbPowerSwitch) {
      this.lnbPowerSwitch.sync(this.state.lnb.isPowered);
    }

    this.lastRenderState = JSON.parse(JSON.stringify(this.state));
  }

  private updateLEDs(container: Element): void {
    // External reference LED
    const extRefLed = container.querySelector('.equipment-case-status-indicator .led');
    if (extRefLed) {
      extRefLed.className = `led ${this.state.isExtRefPresent && this.state.buc.isExtRefLocked
        ? 'led-green'
        : 'led-amber'
        }`;
    }

    // BUC lock LED
    const bucLockLed = container.querySelector('.buc-module .led-indicator .led');
    if (bucLockLed) {
      bucLockLed.className = `led ${this.state.buc.isExtRefLocked ? 'led-green' : 'led-red'}`;
    }

    // LNB lock LED
    const lnbLockLed = container.querySelector('.lnb-module .led-indicator .led');
    if (lnbLockLed) {
      lnbLockLed.className = `led ${this.state.lnb.isExtRefLocked ? 'led-green' : 'led-red'}`;
    }

    // HPA IMD LED (if in advanced mode)
    const hpaImdLed = container.querySelector('.hpa-module .led-indicator .led');
    if (hpaImdLed) {
      hpaImdLed.className = `led ${this.state.hpa.isOverdriven ? 'led-orange' : 'led-off'}`;
    }

    // OMT cross-pol LED (if in advanced mode)
    const omtXpolLed = container.querySelector('.omt-module .led-indicator .led');
    if (omtXpolLed) {
      omtXpolLed.className = `led ${this.state.omt.isFaulted ? 'led-red' : 'led-off'}`;
    }
  }

  /**
   * Public API Methods
   */

  public setPower(isPowered: boolean): void {
    this.state.isPowered = isPowered;
    if (!isPowered) {
      this.state.buc.isPowered = false;
      this.state.hpa.isEnabled = false;
      this.state.lnb.isPowered = false;
    }
    this.syncDomWithState();
  }

  public setExternalReference(isPresent: boolean): void {
    this.state.isExtRefPresent = isPresent;
    if (!isPresent) {
      this.state.buc.isExtRefLocked = false;
      this.state.lnb.isExtRefLocked = false;
    } else {
      // Simulate lock acquisition after reference restored
      setTimeout(() => {
        if (this.state.buc.isPowered) {
          this.state.buc.isExtRefLocked = true;
        }
        if (this.state.lnb.isPowered) {
          this.state.lnb.isExtRefLocked = true;
        }
        this.syncDomWithState();
      }, 2000);
    }
    this.syncDomWithState();
  }

  public setSignalFlowDirection(direction: 'TX' | 'RX' | 'IDLE'): void {
    this.state.signalFlowDirection = direction;
    this.syncDomWithState();
  }

  public getBUCOutputFrequency(): RfFrequency {
    return (this.state.signalPath.txPath.ifFrequency + this.state.buc.loFrequency * 1e6) as RfFrequency;
  }

  public getLNBOutputFrequency(): IfFrequency {
    return Math.abs(this.state.signalPath.rxPath.rfFrequency - this.state.lnb.loFrequency * 1e6) as IfFrequency;
  }

  public getTotalTxGain(): number {
    let gain = this.state.buc.gain;
    if (this.state.hpa.isEnabled) {
      gain += this.state.hpa.outputPower;
    }
    gain -= this.state.filter.insertionLoss;
    return gain;
  }

  public getTotalRxGain(): number {
    return this.state.lnb.gain - this.state.filter.insertionLoss;
  }

  public getSystemNoiseFigure(): number {
    // Friis formula for cascaded noise figure
    // F_total = F1 + (F2-1)/G1 + (F3-1)/(G1*G2) + ...
    // For RX: Filter → LNB
    const filterNfLinear = Math.pow(10, (this.state.filter.insertionLoss / 10));
    const lnbNfLinear = Math.pow(10, (this.state.lnb.noiseFigure / 10));
    // const lnbGainLinear = Math.pow(10, (this.state.lnb.gain / 10));

    const totalNfLinear = filterNfLinear + (lnbNfLinear - 1) / filterNfLinear;
    return 10 * Math.log10(totalNfLinear);
  }

  public getCouplerOutput(): { frequency: RfFrequency | IfFrequency; power: number } {
    switch (this.state.coupler.tapPoint) {
      case 'RF_PRE_FILTER':
        return {
          frequency: this.state.signalPath.txPath.rfFrequency,
          power: this.state.signalPath.txPath.rfPower + this.state.coupler.couplingFactor,
        };
      case 'RF_POST_FILTER':
        return {
          frequency: this.state.signalPath.txPath.rfFrequency,
          power: (this.state.signalPath.txPath.rfPower - this.state.filter.insertionLoss) + this.state.coupler.couplingFactor,
        };
      case 'IF_AFTER_LNB':
        return {
          frequency: this.state.signalPath.rxPath.ifFrequency,
          power: this.state.signalPath.rxPath.ifPower + this.state.coupler.couplingFactor,
        };
    }
  }
}