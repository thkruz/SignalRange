import { EventBus } from "@app/events/event-bus";
import { Events } from "../../events/events";
import { SignalPathManager } from '../../simulation/signal-path-manager';
import { dBm, IfFrequency, RfFrequency } from "../../types";
import { AntennaCore } from "../antenna";
import { AlarmStatus, BaseEquipment } from "../base-equipment";
import { Transmitter } from '../transmitter/transmitter';
import { BUCModuleCore, BUCState } from './buc-module/buc-module-core';
import { CouplerModule, CouplerState, TapPoint } from './coupler-module/coupler-module';
import { IfFilterBankModuleCore, IfFilterBankState } from './filter-module/filter-module-core';
import { GPSDOModuleCore } from './gpsdo-module/gpsdo-module-core';
import { defaultGpsdoState, GPSDOState } from "./gpsdo-module/gpsdo-state";
import { HPAModuleCore, HPAState } from './hpa-module/hpa-module-core';
import { LNBModuleCore, LNBState } from './lnb-module/lnb-module-core';
import { OMTModule, OMTState } from './omt-module/omt-module';

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
 * RFFrontEndCore - Abstract core business logic class
 * Contains signal routing, state management, alarm aggregation
 * No UI components, no HTML generation
 * Subclasses decide what type of modules to instantiate
 */
export abstract class RFFrontEndCore extends BaseEquipment {
  // State
  private readonly state_: RFFrontEndState;
  private lastRenderState: string = '';

  // Module references (typed as Core for polymorphism)
  omtModule!: OMTModule;
  bucModule!: BUCModuleCore;
  hpaModule!: HPAModuleCore;
  filterModule!: IfFilterBankModuleCore;
  lnbModule!: LNBModuleCore;
  couplerModule!: CouplerModule;
  gpsdoModule!: GPSDOModuleCore;

  // Signal path manager for aggregated calculations
  signalPathManager!: SignalPathManager;

  // References to connected equipment
  antenna: AntennaCore | null = null;
  transmitters: Transmitter[] = [];

  constructor(state?: Partial<RFFrontEndState>, teamId: number = 1, serverId: number = 1, parentId: string = '') {
    // Note: parentId is required for BaseEquipment but may not be used in core
    super(parentId, teamId);

    // Initialize state with default values from modules
    this.state_ = {
      uuid: this.uuid,
      teamId: this.teamId,
      serverId: serverId,

      // Module states managed by their respective classes
      omt: OMTModule.getDefaultState(),
      buc: {} as BUCState, // Will be set by getDefaultState from module factories
      hpa: {} as HPAState,
      filter: {} as IfFilterBankState,
      lnb: {} as LNBState,
      coupler: CouplerModule.getDefaultState(),
      gpsdo: defaultGpsdoState,
      ...state
    };

    // Subclass creates appropriate module types
    this.createModules();

    // Instantiate signal path manager for aggregated calculations
    this.signalPathManager = new SignalPathManager(this);

    // Register event handlers
    EventBus.getInstance().on(Events.UPDATE, this.update.bind(this));
    EventBus.getInstance().on(Events.SYNC, this.syncDomWithState.bind(this));
  }

  get state(): RFFrontEndState {
    return {
      uuid: this.uuid,
      teamId: this.teamId,
      serverId: this.state_.serverId,

      // Module states managed by their respective classes
      omt: this.omtModule?.state ?? this.state_.omt,
      buc: this.bucModule?.state ?? this.state_.buc,
      hpa: this.hpaModule?.state ?? this.state_.hpa,
      filter: this.filterModule?.state ?? this.state_.filter,
      lnb: this.lnbModule?.state ?? this.state_.lnb,
      coupler: this.couplerModule?.state ?? this.state_.coupler,
      gpsdo: this.gpsdoModule?.state ?? this.state_.gpsdo,
    }
  }

  /**
   * Abstract method - subclasses decide module type
   * UI subclass will create standard modules, headless subclass will create headless modules
   */
  protected abstract createModules(): void;

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
  connectAntenna(antenna: AntennaCore): void {
    this.antenna = antenna;
  }

  /**
   * RF Frontend Modules need a reference to connected Transmitters to simulate
   * loopback mode. Use this to wire the transmitters after they are created.
   */
  connectTransmitter(transmitter: Transmitter): void {
    this.transmitters.push(transmitter);
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
   * Protected/Private Methods
   */

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

  /**
   * Get status alarms for status bar display
   * Collects alarms from all modules and returns as AlarmStatus array
   */
  protected getStatusAlarms(rfcase: number): AlarmStatus[] {
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

  protected abstract checkForAlarms_(): void;

  syncDomWithState(): void {
    // Prevent unnecessary re-renders
    if (JSON.stringify(this.state) === this.lastRenderState) {
      return;
    }

    this.lastRenderState = JSON.stringify(this.state);
  }

  private updateSystemNoiseFigure_(): number {
    // Friis formula for cascaded noise figure
    // F_total = F1 + (F2-1)/G1 + (F3-1)/(G1*G2) + ...\n    // For RX: Filter → LNB
    const filterNfLinear = Math.pow(10, (this.state.filter.insertionLoss / 10));
    const lnbNfLinear = Math.pow(10, (this.state.lnb.lnaNoiseFigure / 10));
    // const lnbGainLinear = Math.pow(10, (this.state.lnb.gain / 10));

    const totalNfLinear = filterNfLinear + (lnbNfLinear - 1) / filterNfLinear;
    return 10 * Math.log10(totalNfLinear);
  }

  /**
   * Get noise floor for RX IF tap point.
   * This method delegates to SignalPathManager for centralized calculation.
   */
  private getNoiseFloorIfRx_() {
    return this.signalPathManager.getNoiseFloorIfRx();
  }
}
