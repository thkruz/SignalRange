import { EventBus } from "@app/events/event-bus";
import { HelpManager } from '@app/help/help-manager';
import { html } from "../../engine/utils/development/formatter";
import { qs } from "../../engine/utils/query-selector";
import { Events } from "../../events/events";
import { dBm, IfFrequency, MHz, RfFrequency } from "../../types";
import { Antenna } from '../antenna/antenna';
import { BaseEquipment } from "../base-equipment";
import { Transmitter } from '../transmitter/transmitter';
import { BUCModule, BUCState } from './buc-module/buc-module';
import { CouplerModule, CouplerState, TapPoint } from './coupler-module/coupler-module';
import { IfFilterBankModule, IfFilterBankState } from './filter-module/filter-module';
import { GPSDOModule, GPSDOState } from './gpsdo-module/gpsdo-module';
import { HPAModule, HPAState } from './hpa-module/hpa-module';
import { LNBModule, LNBState } from './lnb/lnb-module';
import { OMTModule, OMTState } from './omt-module/omt-module';
import omtModuleHelp from './omt-module/omt-module-help';
import './rf-front-end.css';

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
  uuid: string;
  teamId: number;
  serverId: number;
  isPowered: boolean;
  signalFlowDirection: 'TX' | 'RX' | 'IDLE';

  omt: OMTState;
  buc: BUCState;
  hpa: HPAState;
  filter: IfFilterBankState;
  lnb: LNBState;
  coupler: CouplerState;
  gpsdo: GPSDOState;

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
  private lastRenderState: string = '';

  // Module classes
  omtModule: OMTModule;
  bucModule: BUCModule;
  hpaModule: HPAModule;
  filterModule: IfFilterBankModule;
  lnbModule: LNBModule;
  couplerModule: CouplerModule;
  gpsdoModule: GPSDOModule;

  // Antenna reference
  antenna: Antenna | null = null;

  // Transmitter reference
  transmitters: Transmitter[] = [];

  constructor(parentId: string, teamId: number = 1, serverId: number = 1) {
    super(parentId, teamId);

    // Initialize state with default values
    this.state = {
      uuid: this.uuid,
      teamId: this.teamId,
      serverId: serverId,
      isPowered: true,
      signalFlowDirection: 'IDLE',

      omt: {
        isPowered: true,
        txPolarization: 'H',
        rxPolarization: 'V',
        effectiveTxPol: 'H',
        effectiveRxPol: 'V',
        crossPolIsolation: 28.5, // dB
        isFaulted: false,
        noiseFloor: -140, // dBm/Hz
      },

      buc: {
        // Operational State
        isPowered: true,
        isMuted: false,
        isLoopback: false,
        temperature: 25, // °C (ambient)
        currentDraw: 0, // A

        // Frequency Translation
        loFrequency: 4200 as MHz, // MHz (C-band)
        isExtRefLocked: true,
        frequencyError: 0, // Hz (locked)
        phaseLockRange: 10000, // ±10 kHz tracking range

        // Gain & Power
        gain: 58, // dB
        outputPower: -10, // dBm
        saturationPower: 15, // dBm (P1dB compression point)
        gainFlatness: 0.5, // ±0.5 dB across bandwidth

        // Signal Quality
        groupDelay: 3, // ns
        phaseNoise: -100, // dBc/Hz @ 10kHz offset (locked)
        spuriousOutputs: [],
        noiseFloor: -140, // dBm/Hz
      },

      hpa: {
        isPowered: true,
        backOff: 6, // dB
        outputPower: 50 as dBm, // dBm (100W)
        isOverdriven: false,
        imdLevel: -30, // dBc
        temperature: 45, // Celsius
        isHpaEnabled: false,
        isHpaSwitchEnabled: false,
        noiseFloor: -140, // dBm/Hz
      },

      filter: {
        isPowered: true,
        bandwidthIndex: 9, // 20 MHz
        bandwidth: 20 as MHz, // MHz
        insertionLoss: 2.0, // dB
        centerFrequency: 5800 * 1e6 as RfFrequency, // 5.8 GHz
        noiseFloor: -101, // dBm
      },

      lnb: {
        isPowered: true,
        loFrequency: 4200 as MHz, // MHz
        gain: 55, // dB
        lnaNoiseFigure: 0.6, // dB
        mixerNoiseFigure: 16.0, // dB
        noiseTemperature: 45, // K
        isExtRefLocked: true,
        isSpectrumInverted: true,
        noiseFloor: -140, // dBm/Hz
      },

      coupler: {
        isPowered: true,
        tapPointA: 'TX IF',
        tapPointB: 'RX IF',
        couplingFactorA: -30, // dB
        couplingFactorB: -20, // dB
        isActiveA: true,
        isActiveB: true,
      },

      gpsdo: {
        isPowered: true,
        isLocked: true,
        warmupTimeRemaining: 0, // seconds
        temperature: 30, // °C
        gnssSignalPresent: true,
        isGnssSwitchUp: true,
        isGnssAcquiringLock: false,
        satelliteCount: 9,
        utcAccuracy: 0,
        constellation: 'GPS',
        lockDuration: 0,
        frequencyAccuracy: 0,
        allanDeviation: 0,
        phaseNoise: 0,
        isInHoldover: false,
        holdoverDuration: 0,
        holdoverError: 0,
        active10MHzOutputs: 2,
        max10MHzOutputs: 5,
        output10MHzLevel: 0,
        ppsOutputsEnabled: false,
        operatingHours: 6,
        selfTestPassed: true,
        agingRate: 0
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

    // Instantiate module classes
    this.omtModule = OMTModule.create(this.state.omt, this);
    this.bucModule = BUCModule.create(this.state.buc, this);
    this.hpaModule = HPAModule.create(this.state.hpa, this);
    this.filterModule = IfFilterBankModule.create(this.state.filter, this);
    this.lnbModule = LNBModule.create(this.state.lnb, this);
    this.couplerModule = CouplerModule.create(this.state.coupler, this);
    this.gpsdoModule = GPSDOModule.create(this.state.gpsdo, this);

    this.build(parentId);

    EventBus.getInstance().on(Events.UPDATE, this.update.bind(this));
    EventBus.getInstance().on(Events.SYNC, this.syncDomWithState.bind(this));
  }

  update(): void {
    // Update signal path calculations
    this.calculateSignalPath();

    // Update component states based on conditions
    this.updateComponentStates();

    // Update module states
    this.omtModule.update();
    this.bucModule.update();
    this.hpaModule.update();
    this.filterModule.update();
    this.lnbModule.update();
    this.couplerModule.update();
    this.gpsdoModule.update();

    this.updateSystemNoiseFigure_();

    // Check for alarms and faults
    this.checkForAlarms_();
  }

  connectAntenna(antenna: Antenna): void {
    this.antenna = antenna;
  }

  connectTransmitter(transmitter: Transmitter): void {
    this.transmitters.push(transmitter);
  }

  initializeDom(parentId: string): HTMLElement {
    const parentDom = super.initializeDom(parentId);

    parentDom.innerHTML = html`
      <div
      id="rf-fe-box-${this.state.uuid}"
      class="equipment-box rf-front-end-box" data-unit="${this.state.uuid}"
      >

      <!-- Top Status Bar -->
      <div class="equipment-case-header">
        <div class="equipment-case-title">RF FRONT END ${this.uuidShort}</div>
          <div class="equipment-case-power-controls">
          <div id="rf-fe-power-${this.state.uuid}" class="equipment-case-main-power"></div>
          <div class="equipment-case-status-indicator">
            <span class="equipment-case-status-label">EXT REF</span>
            <div class="led led-green"></div>
          </div>
          <button class="btn-help" title="Help" id="rf-fe-help-${this.state.uuid}">
            <span class="icon-help">&#x2753;</span>
          </button>
        </div>
      </div>

      <!-- Main Module Container -->
      <div class="rf-fe-modules">
        <div class="stacked-modules">
        ${this.omtModule.html}
        ${this.couplerModule.html}
        </div>
        <div class="stacked-modules">
        ${this.bucModule.html}
        ${this.hpaModule.html}
        </div>
        ${this.gpsdoModule.html}
        <div class="stacked-modules">
        ${this.lnbModule.html}
        ${this.filterModule.html}
        </div>
      </div>

      <!-- Bottom Status Bar -->
      <div class="equipment-case-footer">
        <div class="bottom-status-bar">
          SYSTEM NORMAL
        </div>
        <div class="mode-toggle">
        <button class="btn-mode-toggle" data-action="toggle-advanced-mode" title="Toggle Advanced Mode">
          <span class="icon-advanced">&#9881;</span>
        </button>
        </div>
      </div>

      </div>
    `;

    return parentDom;
  }

  protected addListeners_(): void {
    const helpBtn = qs(`#rf-fe-help-${this.state.uuid}`);
    if (helpBtn) {
      helpBtn.addEventListener('click', () => {
        HelpManager.getInstance().show("OMT / Duplexer", omtModuleHelp);
      });
    }


    // Add module event listeners
    this.omtModule.addEventListeners((state: OMTState) => {
      this.state.omt = state;
      this.calculateSignalPath();
      this.syncDomWithState();
      EventBus.getInstance().emit(Events.RF_FE_OMT_CHANGED, state);
    });
    this.bucModule.addEventListeners((state: BUCState) => {
      this.state.buc = state;
      this.calculateSignalPath();
      this.syncDomWithState();
      EventBus.getInstance().emit(Events.RF_FE_BUC_CHANGED, state);
    });
    this.hpaModule.addEventListeners((state: HPAState) => {
      this.state.hpa = state;
      this.calculateSignalPath();
      this.syncDomWithState();
      EventBus.getInstance().emit(Events.RF_FE_HPA_CHANGED, state);
    });
    this.filterModule.addEventListeners((state: IfFilterBankState) => {
      this.state.filter = state;
      this.calculateSignalPath();
      this.syncDomWithState();
      EventBus.getInstance().emit(Events.RF_FE_FILTER_CHANGED, state);
    });
    this.lnbModule.addEventListeners((state: LNBState) => {
      this.state.lnb = state;
      this.calculateSignalPath();
      this.syncDomWithState();
      EventBus.getInstance().emit(Events.RF_FE_LNB_CHANGED, state);
    });
    this.couplerModule.addEventListeners((state: CouplerState) => {
      this.state.coupler = state;
      this.calculateSignalPath();
      this.syncDomWithState();
      EventBus.getInstance().emit(Events.RF_FE_COUPLER_CHANGED, state);
    });
    this.gpsdoModule.addEventListeners((state: GPSDOState) => {
      this.state.gpsdo = state;
      this.syncDomWithState();
      EventBus.getInstance().emit(Events.RF_FE_GPSDO_CHANGED, state);
    });

    // Attach event listeners after DOM is created
    this.attachEventListeners();
  }

  protected checkForAlarms_(): void {
    const alarms = this.checkAlarms();
    const statusBarElement = qs(`.rf-front-end-box .bottom-status-bar`);

    if (!statusBarElement) return;

    if (alarms.length > 0) {
      statusBarElement.innerText = `ALARMS: ${alarms.join(', ')}`;
      statusBarElement.classList.add('has-alarms');
    } else {
      statusBarElement.innerText = `SYSTEM NORMAL`;
      statusBarElement.classList.remove('has-alarms');
    }
  }

  protected attachEventListeners(): void {
    const container = qs(`.equipment-box[data-unit="${this.state.uuid}"]`);
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
  }

  protected initialize_(): void {
    this.syncDomWithState();
  }

  sync(data: Partial<RFFrontEndState>): void {
    // Deep merge state
    if (data.omt) {
      this.state.omt = { ...this.state.omt, ...data.omt };
      this.omtModule.sync(data.omt);
    }
    if (data.buc) {
      this.state.buc = { ...this.state.buc, ...data.buc };
      this.bucModule.sync(data.buc);
    }
    if (data.hpa) {
      this.state.hpa = { ...this.state.hpa, ...data.hpa };
      this.hpaModule.sync(data.hpa);
    }
    if (data.filter) {
      this.state.filter = { ...this.state.filter, ...data.filter };
      this.filterModule.sync(data.filter);
    }
    if (data.lnb) {
      this.state.lnb = { ...this.state.lnb, ...data.lnb };
      this.lnbModule.sync(data.lnb);
    }
    if (data.coupler) {
      this.state.coupler = { ...this.state.coupler, ...data.coupler };
      this.couplerModule.sync(data.coupler);
    }
    if (data.gpsdo) {
      this.state.gpsdo = { ...this.state.gpsdo, ...data.gpsdo };
      this.gpsdoModule.sync(data.gpsdo);
    }

    // Update scalar properties
    if (data.isPowered !== undefined) this.state.isPowered = data.isPowered;
    if (data.signalFlowDirection !== undefined) this.state.signalFlowDirection = data.signalFlowDirection;

    this.syncDomWithState();
  }

  get externalNoise() {
    return this.filterModule.state.noiseFloor + this.getTotalRxGain();
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
      case 'toggle-advanced-mode':
        // Not sure what this does yet
        break;
    }

    this.syncDomWithState();
  }

  calculateSignalPath(): void {
    if (!this.state.isPowered) {
      // Zero out all values when powered off
      this.state.signalPath.txPath = {
        ifFrequency: 0 as IfFrequency,
        ifPower: -120,
        rfFrequency: 0 as RfFrequency,
        rfPower: -120,
        totalGain: 0
      };
      this.state.signalPath.rxPath = {
        rfFrequency: 0 as RfFrequency,
        rfPower: -120,
        ifFrequency: 0 as IfFrequency,
        ifPower: -120,
        totalGain: 0,
        noiseFigure: 99
      };
      return;
    }

    // TX Path: IF → BUC (upconvert) → HPA → Filter → Antenna
    if (this.state.buc.isPowered && this.state.signalFlowDirection === 'TX') {
      const txIfFreq = 1600; // MHz (example IF input)
      const txIfPower = -10; // dBm input to BUC

      // BUC upconversion
      const txRfFreq = txIfFreq + this.state.buc.loFrequency;
      let txRfPower = this.state.buc.isMuted ? -120 : txIfPower + this.state.buc.gain;

      // HPA amplification
      if (this.state.hpa.isPowered) {
        const p1db = 50; // dBm (100W) typical P1dB
        const hpaGain = p1db - this.state.hpa.backOff - txRfPower;
        txRfPower += hpaGain;
      }

      // Filter insertion loss
      const txFilteredPower = txRfPower - this.state.filter.insertionLoss;

      this.state.signalPath.txPath = {
        ifFrequency: txIfFreq * 1e6 as IfFrequency,
        ifPower: txIfPower,
        rfFrequency: txRfFreq * 1e6 as RfFrequency,
        rfPower: txFilteredPower,
        totalGain: txFilteredPower - txIfPower,
      };
    }

    // RX Path: Antenna → Filter → LNB (downconvert) → Receiver
    if (this.state.lnb.isPowered && this.state.signalFlowDirection === 'RX') {
      const rxRfFreq = 5800; // MHz (example RF input)
      const rxRfPower = -80; // dBm at antenna feed

      // Filter insertion loss
      const rxFilteredPower = rxRfPower - this.state.filter.insertionLoss;

      // LNB downconversion
      const rxIfFreq = Math.abs(rxRfFreq - this.state.lnb.loFrequency);
      const rxIfPower = rxFilteredPower + this.state.lnb.gain;

      // Spectrum inversion check (high-side LO injection inverts spectrum)
      this.state.lnb.isSpectrumInverted = this.state.lnb.loFrequency > rxRfFreq;

      // Calculate cascade noise figure
      const cascadeNF = this.calculateRxNoiseFigure();

      this.state.signalPath.rxPath = {
        rfFrequency: rxRfFreq * 1e6 as RfFrequency,
        rfPower: rxRfPower,
        ifFrequency: rxIfFreq * 1e6 as IfFrequency,
        ifPower: rxIfPower,
        totalGain: rxIfPower - rxRfPower,
        noiseFigure: cascadeNF,
      };
    }
  }

  private calculateRxNoiseFigure(): number {
    // Friis formula for cascaded noise figure
    // F_total = F1 + (F2-1)/G1
    // For RX: Filter → LNB
    const filterLossDb = this.state.filter.insertionLoss;
    const filterNfLinear = Math.pow(10, filterLossDb / 10); // Loss = NF for passive device
    const filterGainLinear = Math.pow(10, -filterLossDb / 10); // Negative gain

    const lnbNfLinear = Math.pow(10, this.state.lnb.lnaNoiseFigure / 10);

    const totalNfLinear = filterNfLinear + (lnbNfLinear - 1) / filterGainLinear;
    return 10 * Math.log10(totalNfLinear);
  }

  private updateComponentStates(): void {
    // Power sequencing
    if (!this.state.isPowered) {
      this.state.buc.isPowered = false;
      this.state.hpa.isPowered = false;
      this.state.lnb.isPowered = false;
      return;
    }

    // HPA can only be enabled if BUC is powered
    if (this.state.hpa.isPowered && !this.state.buc.isPowered) {
      this.state.hpa.isPowered = false;
    }

    // HPA temperature calculation based on output power
    if (this.state.hpa.isPowered) {
      const powerWatts = Math.pow(10, this.state.hpa.outputPower / 10);
      const efficiency = 0.5; // 50% typical for SSPA
      const dissipatedPower = powerWatts * (1 - efficiency);
      this.state.hpa.temperature = 25 + (dissipatedPower * 10); // Rough thermal model
    } else {
      this.state.hpa.temperature = 25; // Ambient
    }

    // LNB noise temperature calculation
    const nfLinear = Math.pow(10, this.state.lnb.lnaNoiseFigure / 10);
    this.state.lnb.noiseTemperature = 290 * (nfLinear - 1);

    // BUC output power calculation
    if (this.state.buc.isPowered && !this.state.buc.isMuted) {
      const inputPower = -10; // dBm typical IF input
      this.state.buc.outputPower = inputPower + this.state.buc.gain;
    } else {
      this.state.buc.outputPower = -120; // Effectively off
    }

    // HPA output power and IMD calculation
    if (this.state.hpa.isPowered) {
      const p1db = 50; // dBm (100W) typical P1dB
      this.state.hpa.outputPower = (p1db - this.state.hpa.backOff) / 10 as dBm;

      // IMD increases as back-off decreases
      this.state.hpa.imdLevel = -30 - (this.state.hpa.backOff * 2); // dBc
    } else {
      this.state.hpa.outputPower = -90 as dBm; // dBm (effectively off)
      this.state.hpa.imdLevel = -60; // dBc (very clean when off)
    }

    // Update HPA overdrive status
    this.state.hpa.isOverdriven = this.state.hpa.backOff < 3;
  }

  private checkAlarms(): string[] {
    // HPA overdrive check (back-off < 3 dB is typically considered overdrive)
    this.state.hpa.isOverdriven = this.state.hpa.backOff < 3;

    // Collect alarm messages
    const alarms: string[] = [
      ...this.omtModule.getAlarms(),
      ...this.bucModule.getAlarms(),
      ...this.hpaModule.getAlarms(),
      ...this.filterModule.getAlarms(),
      ...this.lnbModule.getAlarms(),
      ...this.gpsdoModule.getAlarms(),
    ];

    if (alarms.length > 0) {
      // this.emit(Events.RF_FE_ALARM, { unit: this.id, alarms });
    }

    return alarms;
  }

  private syncDomWithState(): void {
    // Prevent unnecessary re-renders
    if (JSON.stringify(this.state) === this.lastRenderState) {
      return;
    }

    // Update UI based on state changes
    const container = qs(`.equipment-box[data-unit="${this.state.uuid}"]`);
    if (!container) return;

    this.lastRenderState = JSON.stringify(this.state);
  }

  /**
   * API Methods
   */

  setPower(isPowered: boolean): void {
    this.state.isPowered = isPowered;
    if (!isPowered) {
      this.state.buc.isPowered = false;
      this.state.hpa.isPowered = false;
      this.state.lnb.isPowered = false;
    }
    this.syncDomWithState();
  }

  setSignalFlowDirection(direction: 'TX' | 'RX' | 'IDLE'): void {
    this.state.signalFlowDirection = direction;
    this.syncDomWithState();
  }

  getBUCOutputFrequency(): RfFrequency {
    return (this.state.signalPath.txPath.ifFrequency + this.state.buc.loFrequency * 1e6) as RfFrequency;
  }

  getTotalTxGain(): number {
    let gain = this.state.buc.gain;
    if (this.state.hpa.isPowered) {
      gain += this.state.hpa.outputPower;
    }
    gain -= this.state.filter.insertionLoss;
    return gain;
  }

  getTotalRxGain(): number {
    return this.state.lnb.gain - this.state.filter.insertionLoss;
  }

  private updateSystemNoiseFigure_(): number {
    // Friis formula for cascaded noise figure
    // F_total = F1 + (F2-1)/G1 + (F3-1)/(G1*G2) + ...
    // For RX: Filter → LNB
    const filterNfLinear = Math.pow(10, (this.state.filter.insertionLoss / 10));
    const lnbNfLinear = Math.pow(10, (this.state.lnb.lnaNoiseFigure / 10));
    // const lnbGainLinear = Math.pow(10, (this.state.lnb.gain / 10));

    const totalNfLinear = filterNfLinear + (lnbNfLinear - 1) / filterNfLinear;
    return 10 * Math.log10(totalNfLinear);
  }

  getCouplerOutputA(): { frequency: RfFrequency | IfFrequency; power: number } {
    return this.couplerModule.getCouplerOutputA();
  }

  getCouplerOutputB(): { frequency: RfFrequency | IfFrequency; power: number } {
    return this.couplerModule.getCouplerOutputB();
  }

  /**
   * @deprecated Use getCouplerOutputA() or getCouplerOutputB() instead
   */
  getCouplerOutput(): { frequency: RfFrequency | IfFrequency; power: number } {
    // Backwards compatibility - returns tap point A output
    return this.getCouplerOutputA();
  }

  getNoiseFloor(_tapPoint: TapPoint): { isInternalNoiseGreater: boolean; noiseFloor: number } {
    const NF = 0.5;
    const externalNoiseFloor = this.filterModule.state.noiseFloor + this.getTotalRxGain();
    const internalNoiseFloor = -174 + 10 * Math.log10(this.filterModule.state.bandwidth * 1e6) + NF;
    const isInternalNoiseGreater = internalNoiseFloor > externalNoiseFloor;

    return {
      isInternalNoiseGreater: isInternalNoiseGreater,
      noiseFloor: isInternalNoiseGreater ? internalNoiseFloor : (externalNoiseFloor - this.getTotalRxGain())
    };
  }
}