import { EventBus } from "@app/events/event-bus";
import { html } from "../../engine/utils/development/formatter";
import { qs } from "../../engine/utils/query-selector";
import { Events } from "../../events/events";
import { SignalPathManager } from '../../simulation/signal-path-manager';
import { dBm, IfFrequency, RfFrequency } from "../../types";
import { Antenna } from '../antenna/antenna';
import { AlarmStatus, BaseEquipment } from "../base-equipment";
import { Transmitter } from '../transmitter/transmitter';
import { BUCModule, BUCState } from './buc-module/buc-module';
import { CouplerModule, CouplerState, TapPoint } from './coupler-module/coupler-module';
import { IfFilterBankModule, IfFilterBankState } from './filter-module/filter-module';
import { GPSDOModule, GPSDOState } from './gpsdo-module/gpsdo-module';
import { HPAModule, HPAState } from './hpa-module/hpa-module';
import { LNBModule, LNBState } from './lnb/lnb-module';
import { OMTModule, OMTState } from './omt-module/omt-module';
import './rf-front-end.css';

/**
 * Complete RF Front-End state
 */
export interface RFFrontEndState {
  uuid: string;
  teamId: number;
  serverId: number;

  omt: OMTState;
  buc: BUCState;
  hpa: HPAState;
  filter: IfFilterBankState;
  lnb: LNBState;
  coupler: CouplerState;
  gpsdo: GPSDOState;
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

  // Signal path manager for aggregated calculations
  signalPathManager: SignalPathManager;

  // References to connected equipment
  antenna: Antenna | null = null;
  transmitters: Transmitter[] = [];

  constructor(parentId: string, state?: Partial<RFFrontEndState>, teamId: number = 1, serverId: number = 1) {
    super(parentId, teamId);

    // Initialize state with default values from modules
    this.state = {
      uuid: this.uuid,
      teamId: this.teamId,
      serverId: serverId,

      // Module states managed by their respective classes
      omt: OMTModule.getDefaultState(),
      buc: BUCModule.getDefaultState(),
      hpa: HPAModule.getDefaultState(),
      filter: IfFilterBankModule.getDefaultState(),
      lnb: LNBModule.getDefaultState(),
      coupler: CouplerModule.getDefaultState(),
      gpsdo: GPSDOModule.getDefaultState()
      , ...state
    };

    // Instantiate module classes
    this.omtModule = new OMTModule(this.state.omt, this);
    this.bucModule = new BUCModule(this.state.buc, this);
    this.hpaModule = new HPAModule(this.state.hpa, this);
    this.filterModule = new IfFilterBankModule(this.state.filter, this);
    this.lnbModule = new LNBModule(this.state.lnb, this);
    this.couplerModule = new CouplerModule(this.state.coupler, this);
    this.gpsdoModule = new GPSDOModule(this.state.gpsdo, this);

    // Instantiate signal path manager for aggregated calculations
    this.signalPathManager = new SignalPathManager(this);

    this.build(parentId);

    EventBus.getInstance().on(Events.UPDATE, this.update.bind(this));
    EventBus.getInstance().on(Events.SYNC, this.syncDomWithState.bind(this));
  }

  update(): void {
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

  /**
   * RF Frontend Modules need a reference to connected Antennas to simulate
   * signal paths. Use this to wire the antenna after it is created.
   */
  connectAntenna(antenna: Antenna): void {
    this.antenna = antenna;
  }

  /**
   * RF Frontend Modules need a reference to connected Transmitters to simulate
   * loopback mode. Use this to wire the transmitters after they are created.
   */
  connectTransmitter(transmitter: Transmitter): void {
    this.transmitters.push(transmitter);
  }

  initializeDom(parentId: string): HTMLElement {
    const parentDom = super.initializeDom(parentId);

    parentDom.innerHTML = html`
      <div
      id="rf-fe-box-${this.state.uuid}-a"
      class="equipment-case rf-front-end-box" data-unit="${this.state.uuid}"
      >

      <!-- Top Status Bar -->
      <div class="equipment-case-header">
        <div class="equipment-case-title">
          <span>RF FRONT END 1 of 2 | ${this.uuidShort}</span>
        </div>
        <div class="equipment-case-power-controls">
          <div id="rf-fe-power-${this.state.uuid}" class="equipment-case-main-power"></div>
          <div class="equipment-case-status-indicator">
            <span class="equipment-case-status-label">Status</span>
            <div id="rf-fe-led-${this.state.uuid}-1" class="led led-green"></div>
          </div>
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
      </div>

      <!-- Bottom Status Bar -->
      <div class="equipment-case-footer">
        <div id="rf-fe-status-${this.state.uuid}-1" class="bottom-status-bar">
          SYSTEM NORMAL
        </div>
      </div>

      </div>
      <div
      id="rf-fe-box-${this.state.uuid}-b"
      class="equipment-case rf-front-end-box" data-unit="${this.state.uuid}"
      >

      <!-- Top Status Bar -->
      <div class="equipment-case-header">
        <div class="equipment-case-title">
          <span>RF FRONT END 2 of 2 | ${this.uuidShort}</span>
        </div>
        <div class="equipment-case-power-controls">
          <div id="rf-fe-power-${this.state.uuid}" class="equipment-case-main-power"></div>
          <div class="equipment-case-status-indicator">
            <span class="equipment-case-status-label">Status</span>
            <div id="rf-fe-led-${this.state.uuid}-2" class="led led-green"></div>
          </div>
        </div>
      </div>

      <!-- Main Module Container -->
      <div class="rf-fe-modules">
        ${this.gpsdoModule.html}
        <div class="stacked-modules">
        ${this.lnbModule.html}
        ${this.filterModule.html}
        </div>
      </div>

      <!-- Bottom Status Bar -->
      <div class="equipment-case-footer">
        <div id="rf-fe-status-${this.state.uuid}-2" class="bottom-status-bar">
          SYSTEM NORMAL
        </div>
      </div>

      </div>
    `;

    return parentDom;
  }

  protected addListeners_(): void {
    // Add module event listeners
    this.omtModule.addEventListeners((state: OMTState) => {
      this.state.omt = state;
      this.syncDomWithState();
      EventBus.getInstance().emit(Events.RF_FE_OMT_CHANGED, state);
    });
    this.bucModule.addEventListeners((state: BUCState) => {
      this.state.buc = state;
      this.syncDomWithState();
      EventBus.getInstance().emit(Events.RF_FE_BUC_CHANGED, state);
    });
    this.hpaModule.addEventListeners((state: HPAState) => {
      this.state.hpa = state;
      this.syncDomWithState();
      EventBus.getInstance().emit(Events.RF_FE_HPA_CHANGED, state);
    });
    this.filterModule.addEventListeners((state: IfFilterBankState) => {
      this.state.filter = state;
      this.syncDomWithState();
      EventBus.getInstance().emit(Events.RF_FE_FILTER_CHANGED, state);
    });
    this.lnbModule.addEventListeners((state: LNBState) => {
      this.state.lnb = state;
      this.syncDomWithState();
      EventBus.getInstance().emit(Events.RF_FE_LNB_CHANGED, state);
    });
    this.couplerModule.addEventListeners((state: CouplerState) => {
      this.state.coupler = state;
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

  /**
   * Get status alarms for status bar display
   * Collects alarms from all modules and returns as AlarmStatus array
   */
  private getStatusAlarms(rfcase: number): AlarmStatus[] {
    const alarms: AlarmStatus[] = [];

    // HPA overdrive check (back-off < 3 dB is typically considered overdrive)
    this.state.hpa.isOverdriven = this.state.hpa.backOff < 3;

    // Collect alarm messages from all modules
    let moduleAlarms = []

    if (rfcase === 1) {
      moduleAlarms = [
        ...this.omtModule.getAlarms(),
        ...this.bucModule.getAlarms(),
        ...this.hpaModule.getAlarms(),
      ];
    } else if (rfcase === 2) {
      moduleAlarms = [
        ...this.filterModule.getAlarms(),
        ...this.lnbModule.getAlarms(),
        ...this.gpsdoModule.getAlarms(),
      ];
    }

    // Convert module alarm strings to AlarmStatus objects
    // Classify severity based on alarm content
    for (const alarm of moduleAlarms) {
      let severity: AlarmStatus['severity'] = 'warning';

      // Upgrade to error for critical conditions
      if (alarm.toLowerCase().includes('over-temperature') ||
        alarm.toLowerCase().includes('high current') ||
        alarm.toLowerCase().includes('not operational')) {
        severity = 'error';
      }

      alarms.push({ severity, message: alarm });
    }

    // If no alarms, system is normal (success state will be handled by base class default)
    return alarms;
  }

  protected checkForAlarms_(): void {
    const statusBarElement1 = qs(`#rf-fe-status-${this.state.uuid}-1`);
    const ledElement1 = qs(`#rf-fe-led-${this.state.uuid}-1`);

    const alarmStatus1 = this.getStatusAlarms(1);
    this.updateStatusBar(statusBarElement1, alarmStatus1);
    this.updateStatusLed(ledElement1, alarmStatus1);

    const statusBarElement2 = qs(`#rf-fe-status-${this.state.uuid}-2`);
    const ledElement2 = qs(`#rf-fe-led-${this.state.uuid}-2`);

    const alarmStatus2 = this.getStatusAlarms(2);
    this.updateStatusBar(statusBarElement2, alarmStatus2);
    this.updateStatusLed(ledElement2, alarmStatus2);
  }

  protected attachEventListeners(): void {
    const container = qs(`.equipment-case[data-unit="${this.state.uuid}"]`);
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

    this.syncDomWithState();
  }

  /**
   * Get external noise floor at the spectrum analyzer input.
   * This method delegates to SignalPathManager for centralized calculation.
   */
  get externalNoise() {
    return this.signalPathManager.getExternalNoise();
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

  private updateComponentStates(): void {
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
      const inputPower = -10 as dBm; // dBm typical IF input
      this.state.buc.outputPower = inputPower + this.state.buc.gain as dBm;
    } else {
      this.state.buc.outputPower = -120 as dBm; // Effectively off
    }

    // HPA output power and IMD calculation
    if (this.state.hpa.isPowered) {
      const p1db = 50 as dBm; // dBm (100W) typical P1dB
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


  private syncDomWithState(): void {
    // Prevent unnecessary re-renders
    if (JSON.stringify(this.state) === this.lastRenderState) {
      return;
    }

    // Update UI based on state changes
    const container = qs(`.equipment-case[data-unit="${this.state.uuid}"]`);
    if (!container) return;

    this.lastRenderState = JSON.stringify(this.state);
  }

  /**
   * API Methods
   */

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
    switch (_tapPoint) {
      case TapPoint.TX_IF:
      case TapPoint.RX_IF:
      default:
        return this.getNoiseFloorIfRx_();
    }
  }

  /**
   * Get noise floor for RX IF tap point.
   * This method delegates to SignalPathManager for centralized calculation.
   */
  private getNoiseFloorIfRx_() {
    return this.signalPathManager.getNoiseFloorIfRx();
  }
}