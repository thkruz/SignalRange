import { PowerSwitch } from "@app/components/power-switch/power-switch";
import { EventBus } from "@app/events/event-bus";
import { html } from "../../engine/utils/development/formatter";
import { qs } from "../../engine/utils/query-selector";
import { Events } from "../../events/events";
import { dBm, FECType, Hertz, IfSignal, MHz, ModulationType } from "../../types";
import { AntennaCore } from "../antenna";
import { AlarmStatus, BaseEquipment } from "../base-equipment";
import { TapPoint } from "../rf-front-end/coupler-module/tap-points";
import { RFFrontEndCore } from "../rf-front-end/rf-front-end-core";
import { ADCDegradationResult, calculateADCDegradation } from './adc-degradation';
import './receiver.css';

export interface ReceiverModemState {
  antenna_id: number;
  modemNumber: number; // 1-4
  frequency: MHz; // MHz
  bandwidth: MHz; // MHz
  modulation: ModulationType;
  fec: FECType;
  isPowered: boolean;
}

export interface ReceiverState {
  uuid: string;
  team_id: number;
  server_id: number;
  modems: ReceiverModemState[];
  activeModem: number;
  availableSignals: {
    id: string;
    feed: string;
    isDegraded: boolean;
  }[];
}

/**
 * Signal information for IQ constellation display.
 * Uses relaxed filtering to show signals even when modem config doesn't match.
 */
export interface IQSignalInfo {
  hasCarrier: boolean;              // Any RF signal in bandwidth
  hasLock: boolean;                 // Modem can demodulate (mod + FEC match)
  actualModulation: ModulationType | null;
  configuredModulation: ModulationType;
  cnRatio_dB: number;               // Carrier-to-noise ratio (raw, before ADC effects)
  frequencyOffset_Hz: number;       // Offset from center frequency
  modulationMismatch: boolean;
  fecMismatch: boolean;
  /** ADC degradation result (clipping/quantization effects) */
  adcDegradation?: ADCDegradationResult;
  /** Effective C/N ratio after ADC penalty applied */
  effectiveCnRatio_dB?: number;
  /** Noise floor in dBm (for debugging/teaching) */
  noiseFloor_dBm?: number;
  /** Signal level in dBm (for debugging/teaching) */
  signalLevel_dBm?: number;
  /** Expected bandwidth from modem configuration (Hz) */
  expectedBandwidth_Hz?: number;
  /** Usable bandwidth after IF filter clipping (Hz) */
  usableBandwidth_Hz?: number;
  /** True if bandwidth was significantly clipped by IF filter */
  isBandwidthClipped?: boolean;
  /** Thermal noise floor in dBm (before adding interference) */
  thermalNoiseFloor_dBm?: number;
  /** Total interference power in modem bandwidth (dBm), undefined if no interference */
  interferencePower_dBm?: number;
  /** Number of interfering signals in modem bandwidth */
  interferenceCount?: number;
}

/**
 * Receiver - Single receiver case containing 4 modems
 * Manages modem configuration and signal reception state
 * Extends Equipment base class for standard lifecycle
 */
export class Receiver extends BaseEquipment {
  state: ReceiverState;
  private inputData: Partial<ReceiverModemState> = {};
  private readonly antennas_: AntennaCore[];
  private lastRenderState: ReceiverState | null = null;
  private mediaCache: { [url: string]: HTMLImageElement | HTMLVideoElement | HTMLIFrameElement } = {};
  private videoPlayTime: { [url: string]: number } = {};
  powerSwitch: PowerSwitch;
  rfFrontEnd_: RFFrontEndCore | null = null;

  constructor(parentId: string, antennas: AntennaCore[], state?: Partial<ReceiverState>, teamId: number = 1, serverId: number = 1) {
    super(teamId);

    this.antennas_ = antennas;

    const defaults = Receiver.getDefaultState();

    const uuid = state?.uuid ?? this.uuid;
    const team_id = state?.team_id ?? this.teamId;
    const server_id = state?.server_id ?? serverId;

    // Merge modem overrides by modemNumber (so callers don't have to provide a full ordered array)
    const overridesByModemNumber = new Map<number, Partial<ReceiverModemState>>(
      (state?.modems ?? []).map(m => [m.modemNumber, m])
    );

    const modems: ReceiverModemState[] = defaults.modems.map((def) => {
      const override = overridesByModemNumber.get(def.modemNumber);
      return {
        ...def,
        ...override,
        // Ensure identity field remains correct unless explicitly overridden
        modemNumber: override?.modemNumber ?? def.modemNumber,
      };
    });

    this.state = {
      ...defaults,
      ...state,
      uuid,
      team_id,
      server_id,
      modems,
      activeModem: state?.activeModem ?? defaults.activeModem,
      availableSignals: state?.availableSignals ?? defaults.availableSignals,
    };

    this.build(parentId);

    EventBus.getInstance().on(Events.UPDATE, this.update.bind(this));
    EventBus.getInstance().on(Events.SYNC, this.syncDomWithState.bind(this));
    EventBus.getInstance().once(Events.SYNC, this.initialSync.bind(this));
  }

  static getDefaultState(): ReceiverState {
    const modems: ReceiverModemState[] = Array.from({ length: 4 }, (_, idx) => {
      const modemNumber = idx + 1;

      return {
        modemNumber,
        antenna_id: modemNumber <= 2 ? 1 : 2,
        frequency: 4700 as MHz, // IF Band after downconversion
        bandwidth: 50 as MHz,
        modulation: 'QPSK' as ModulationType,
        fec: '3/4' as FECType,
        isPowered: false,
      };
    });

    return {
      uuid: 'default',
      team_id: 1,
      server_id: 1,
      modems,
      activeModem: 1,
      availableSignals: [],
    };
  }

  update(): void {
    this.checkForAlarms_();
    this.syncDomWithState();
  }

  initialSync(): void {
    this.inputData = { ...this.activeModem };
  }

  initializeDom(parentId: string): HTMLElement {
    const parentDom = super.initializeDom(parentId);
    const ledColor = this.getLedColor();
    const feedUrl = this.getVisibleSignals()[0]?.feed || '';

    this.powerSwitch = PowerSwitch.create(`rx-power-switch-${this.state.uuid}${this.activeModem.modemNumber}`, this.activeModem.isPowered);

    parentDom.innerHTML = html`
      <div class="equipment-case receiver-box">
        <div class="equipment-case-header">
          <div class="equipment-case-title">Receiver Case ${this.uuidShort}</div>
          <div class="equipment-case-power-controls">
            <div class="equipment-case-main-power"></div>
            <div class="equipment-case-status-indicator">
              <span class="equipment-case-status-label">Status</span>
              <div class="led ${ledColor}"></div>
            </div>
          </div>
        </div>

        <div class="receiver-controls">
          <!-- Modem Selection Buttons -->
          <div class="modem-buttons">
            ${this.state.modems.map(modem => html`
              <button id="modem-${modem.modemNumber}"
                class="btn-modem ${modem.modemNumber === this.state.activeModem ? 'active' : ''} ${this.getModemStatusClass(modem)}"
                data-modem="${modem.modemNumber}">
                ${modem.modemNumber}
              </button>
            `).join('')}
          </div>

          <!-- Main content area with config and video side by side -->
          <div class="receiver-main-content">
            <!-- Active Modem Configuration -->
            <div class="rx-modem-config">
              <div class="config-row">
                <label>Antenna</label>
                <select class="input-rx-antenna" data-param="antenna_id">
                  <option value="1" ${this.inputData.antenna_id === 1 ? 'selected' : ''}>1</option>
                  <option value="2" ${this.inputData.antenna_id === 2 ? 'selected' : ''}>2</option>
                </select>
                <span class="current-value">${this.inputData.antenna_id ?? 1}</span>
              </div>

              <div class="config-row">
                <label>Freq (MHz)</label>
                <input
                  type="text"
                  class="input-rx-frequency"
                  data-param="frequency"
                  value="${this.inputData.frequency ?? this.activeModem?.frequency}"
                />
                <span class="current-value">${this.activeModem?.frequency} MHz</span>
              </div>

              <div class="config-row">
                <label>BW (MHz)</label>
                <input
                  type="text"
                  class="input-rx-bandwidth"
                  data-param="bandwidth"
                  value="${this.inputData.bandwidth ?? this.activeModem?.bandwidth}"
                />
                <span class="current-value">${this.activeModem?.bandwidth} MHz</span>
              </div>

              <div class="config-row">
                <label>Modulation</label>
                <select class="input-rx-modulation" data-param="modulation">
                  <option value="BPSK" ${this.inputData.modulation === 'BPSK' ? 'selected' : ''}>BPSK</option>
                  <option value="QPSK" ${this.inputData.modulation === 'QPSK' ? 'selected' : ''}>QPSK</option>
                  <option value="8QAM" ${this.inputData.modulation === '8QAM' ? 'selected' : ''}>8QAM</option>
                  <option value="16QAM" ${this.inputData.modulation === '16QAM' ? 'selected' : ''}>16QAM</option>
                </select>
                <span class="current-value">${this.activeModem?.modulation}</span>
              </div>

              <div class="config-row">
                <label>FEC</label>
                <select class="input-rx-fec" data-param="fec">
                  <option value="1/2" ${this.inputData.fec === '1/2' ? 'selected' : ''}>1/2</option>
                  <option value="2/3" ${this.inputData.fec === '2/3' ? 'selected' : ''}>2/3</option>
                  <option value="3/4" ${this.inputData.fec === '3/4' ? 'selected' : ''}>3/4</option>
                  <option value="5/6" ${this.inputData.fec === '5/6' ? 'selected' : ''}>5/6</option>
                  <option value="7/8" ${this.inputData.fec === '7/8' ? 'selected' : ''}>7/8</option>
                </select>
                <span class="current-value">${this.activeModem?.fec}</span>
              </div>

              <div class="config-actions">
                <button class="btn-apply" data-action="apply">Apply</button>
              </div>
            </div>

            <!-- Video Monitor -->
            <div class="video-monitor">
              <div class="monitor-screen ${feedUrl.length > 0 ? 'signal-found' : 'no-signal'}">
                ${feedUrl.length > 0
        ? html`<div class="signal-indicator">
                      <video class="video-feed" src="/videos/${feedUrl}" alt="Video Feed" autoplay muted loop />
                    </div>`
        : html`<span class="no-signal-text">NO SIGNAL</span>`
      }
              </div>
            </div>

            <!-- Power Switch -->
            <div class="status-indicator online">
              <span id="rx-active-power-light" class="indicator-light ${this.activeModem.isPowered ? 'on' : 'off'}"></span>
              <span class="indicator-label">Online</span>
              ${this.powerSwitch.html}
            </div>

          </div>
        </div>
        <!-- Bottom Status Bar -->
        <div class="equipment-case-footer">
          <div class="bottom-status-bar">
            SYSTEM NORMAL
          </div>
          <div>
        </div>
      </div>
    </div>
    `;

    // Cache frequently used DOM nodes for efficient updates
    this.domCache['parent'] = parentDom;
    this.domCache['led'] = qs('.led', parentDom);
    this.state.modems.forEach(modem => {
      this.domCache[`modemButton${modem.modemNumber}`] = qs(`#modem-${modem.modemNumber}`, parentDom);
    });
    this.domCache['inputAntenna'] = qs('.input-rx-antenna', parentDom);
    this.domCache['inputFrequency'] = qs('.input-rx-frequency', parentDom);
    this.domCache['inputBandwidth'] = qs('.input-rx-bandwidth', parentDom);
    this.domCache['inputModulation'] = qs('.input-rx-modulation', parentDom);
    this.domCache['inputFec'] = qs('.input-rx-fec', parentDom);
    this.domCache['btnApply'] = qs('.btn-apply', parentDom);
    this.domCache['monitorScreen'] = qs('.monitor-screen', parentDom);
    this.domCache['rxActivePowerLight'] = qs('#rx-active-power-light', parentDom);
    this.domCache['bottom-status-bar'] = qs('.bottom-status-bar', parentDom);

    const currentValueEls = parentDom.querySelectorAll('.current-value');
    this.domCache['currentValueAntenna'] = currentValueEls[0] as HTMLElement;
    this.domCache['currentValueFrequency'] = currentValueEls[1] as HTMLElement;
    this.domCache['currentValueBandwidth'] = currentValueEls[2] as HTMLElement;
    this.domCache['currentValueModulation'] = currentValueEls[3] as HTMLElement;
    this.domCache['currentValueFec'] = currentValueEls[4] as HTMLElement;

    // Initialize lastRenderState so first render always updates
    this.lastRenderState = structuredClone(this.state);

    return parentDom;
  }

  protected addListeners_(parentDom: HTMLElement): void {
    // Modem selection buttons
    const modemButtons = parentDom.querySelectorAll('.btn-modem');
    modemButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const modemNum = Number.parseInt((e.target as HTMLElement).dataset.modem || '1');
        this.setActiveModem(modemNum);
      });
    });

    // Input changes
    const inputs = parentDom.querySelectorAll('input, select');
    inputs.forEach(input => {
      input.addEventListener('change', (e) => this.handleInputChange(e));
    });

    // Apply button
    const btnApply = qs('.btn-apply', parentDom);
    btnApply?.addEventListener('click', () => this.applyChanges());

    this.powerSwitch.addEventListeners(this.togglePower.bind(this));
  }

  protected checkForAlarms_(): void {
    this.updateStatusBar(this.domCache['bottom-status-bar'], this.getStatusAlarms());
  }

  public getStatusAlarms(): AlarmStatus[] {
    const alarms: AlarmStatus[] = [];

    if (this.state.availableSignals.length > 0) {
      alarms.push({
        message: `Signal(s) Detected`,
        severity: 'info'
      });
    }

    return alarms;
  }

  private togglePower(isOn: boolean): void {
    setTimeout(() => {
      this.activeModem.isPowered = isOn;

      this.emit(Events.RX_CONFIG_CHANGED, {
        uuid: this.uuid,
        modem: this.state.activeModem,
        config: this.state.modems.find(m => m.modemNumber === this.state.activeModem)
      });
      this.syncDomWithState();
    }, isOn ? 4000 : 250);
  }

  protected initialize_(): void {
    this.syncDomWithState();

    // Listen for antenna changes
    this.subscribeToAntennaEvents();
  }

  connectRfFrontEnd(rfFrontEnd: RFFrontEndCore) {
    this.rfFrontEnd_ = rfFrontEnd;
  }

  private subscribeToAntennaEvents() {
    this.on(Events.ANTENNA_STATE_CHANGED, () => {
      this.syncDomWithState();
    });

    this.on(Events.TX_CONFIG_CHANGED, () => {
      this.syncDomWithState();
    });

    this.on(Events.TX_TRANSMIT_CHANGED, () => {
      this.syncDomWithState();
    });
  }

  public sync(data: Partial<ReceiverState>): void {
    if (data.modems) {
      this.state.modems = data.modems;
    }
    this.state.activeModem = data.activeModem ?? this.state.activeModem;
    this.syncDomWithState();
  }

  /**
   * Private Methods
   */

  get activeModem(): ReceiverModemState {
    return this.state.modems.find(m => m.modemNumber === this.state.activeModem) ?? this.state.modems[0];
  }

  get antennas(): AntennaCore[] {
    return this.antennas_;
  }

  /**
   * Public API Methods - For Adapter Pattern
   */

  public setActiveModem(modemNumber: number): void {
    this.state.activeModem = modemNumber;
    this.inputData = { ...this.activeModem };
    this.syncDomWithState();

    // Emit event for modem change
    this.emit(Events.RX_ACTIVE_MODEM_CHANGED, {
      uuid: this.uuid,
      activeModem: modemNumber
    });
  }

  public handleAntennaChange(antennaId: number): void {
    this.inputData.antenna_id = antennaId;
  }

  public handleFrequencyChange(frequencyMHz: number): void {
    this.inputData.frequency = frequencyMHz as MHz;
  }

  public handleBandwidthChange(bandwidthMHz: number): void {
    this.inputData.bandwidth = bandwidthMHz as MHz;
  }

  public handleModulationChange(modulation: ModulationType): void {
    this.inputData.modulation = modulation;
  }

  public handleFecChange(fec: FECType): void {
    this.inputData.fec = fec;
  }

  public handlePowerToggle(isEnabled: boolean): void {
    this.togglePower(isEnabled);
  }

  public hasSignalForModem(modem: ReceiverModemState): boolean {
    const visibleSignals = this.getVisibleSignals(modem);
    return visibleSignals.length > 0;
  }

  public isSignalDegraded(modem: ReceiverModemState): boolean {
    const visibleSignals = this.getVisibleSignals(modem);
    if (visibleSignals.length === 0) return false;

    // Check if any signal is degraded
    return visibleSignals.some(s => s.isDegraded);
  }

  /**
   * Get SNR (C/N ratio) for a modem in dB
   * Returns null if no signal present
   */
  public getSnrForModem(modem: ReceiverModemState): number | null {
    if (!modem.isPowered) return null;

    const signalInfo = this.getSignalsInBandwidth(modem);
    if (!signalInfo.hasCarrier) return null;

    return signalInfo.cnRatio_dB;
  }

  /**
   * Get received signal power for a modem in dBm
   * Returns null if no signal present
   */
  public getPowerForModem(modem: ReceiverModemState): number | null {
    if (!modem.isPowered) return null;

    const visibleSignals = this.getVisibleSignals(modem);
    if (visibleSignals.length === 0) return null;

    // Target signal is the one with the largest bandwidth that fits the modem
    // This distinguishes the actual signal from narrowband interference
    const targetSignal = visibleSignals.reduce((a, b) => a.bandwidth > b.bandwidth ? a : b, visibleSignals[0]);
    return targetSignal.power;
  }

  /**
   * Get signal info for IQ constellation display.
   * Uses relaxed filtering - only checks frequency overlap, not modulation/FEC.
   * This allows the IQ display to show signals for troubleshooting even when
   * the modem configuration doesn't match the incoming signal.
   */
  public getSignalsInBandwidth(modem: ReceiverModemState = this.activeModem): IQSignalInfo {
    const noSignalResult: IQSignalInfo = {
      hasCarrier: false,
      hasLock: false,
      actualModulation: null,
      configuredModulation: modem.modulation,
      cnRatio_dB: -Infinity,
      frequencyOffset_Hz: 0,
      modulationMismatch: false,
      fecMismatch: false,
    };

    if (!this.rfFrontEnd_) return noSignalResult;

    const externalNoise = this.rfFrontEnd_.externalNoise ?? 0;
    const totalGain = this.rfFrontEnd_.couplerModule.signalPathManager.getTotalRxGain();

    // Get ALL signals in the receiver bandwidth (relaxed filtering - no mod/FEC check)
    const signalsInBand = (this.rfFrontEnd_.agcModule.outputSignals ?? []).filter((s) => {
      // Power must exceed noise floor
      if (s.power + totalGain < externalNoise) {
        return false;
      }

      // Bandwidth must fit
      if (s.bandwidth > (modem.bandwidth * 1e6 as Hertz)) {
        return false;
      }

      // Frequency must overlap with modem bandwidth
      const signalLower = s.frequency - s.bandwidth / 2;
      const signalUpper = s.frequency + s.bandwidth / 2;
      const modemLower = (modem.frequency - modem.bandwidth / 2) * 1e6;
      const modemUpper = (modem.frequency + modem.bandwidth / 2) * 1e6;

      if (signalUpper < modemLower || signalLower > modemUpper) {
        return false;
      }

      return true;
    });

    if (signalsInBand.length === 0) return noSignalResult;

    // Find the target signal - the one with the largest bandwidth that fits
    // This distinguishes the actual signal from narrowband interference
    // Among signals with matching modulation/FEC, pick the one with largest bandwidth
    const modFecMatches = signalsInBand.filter(s =>
      s.modulation === modem.modulation && s.fec === modem.fec
    );

    // Use mod/FEC matches if available, otherwise all signals in band
    const candidates = modFecMatches.length > 0 ? modFecMatches : signalsInBand;

    // Target is the signal with the largest bandwidth
    const targetSignal = candidates.reduce((a, b) => a.bandwidth > b.bandwidth ? a : b, candidates[0]);

    // Calculate thermal noise floor
    // Noise floor needs totalGain added to match the reference point
    const thermalNoiseFloor = this.rfFrontEnd_.getNoiseFloor(TapPoint.RX_IF).noiseFloor + totalGain;

    // Calculate interference power within modem bandwidth
    const modemBandwidthHz = modem.bandwidth * 1e6;
    const modemCenterHz = modem.frequency * 1e6;
    const interferencePower = this.calculateInterferencePower_(
      targetSignal,
      signalsInBand,
      modemBandwidthHz,
      modemCenterHz
    );

    // Combine thermal noise and interference (linear power addition)
    const thermalNoiseMw = Math.pow(10, thermalNoiseFloor / 10);
    const interferenceMw = interferencePower > -Infinity ? Math.pow(10, interferencePower / 10) : 0;
    const effectiveNoiseFloor = 10 * Math.log10(thermalNoiseMw + interferenceMw);

    // C/N ratio now includes interference
    // Signal from AGC output already includes all chain gains, so don't add totalGain again
    const signalLevel = targetSignal.power;  // Already includes all chain gains
    const cnRatio = signalLevel - effectiveNoiseFloor;

    // Calculate ADC degradation based on AGC output level
    // AGC output is the signal level entering the ADC
    const agcOutputLevel = this.rfFrontEnd_?.agcModule?.state.outputPower ?? signalLevel;
    const adcDegradation = calculateADCDegradation(agcOutputLevel as dBm);

    // Effective C/N includes ADC penalty only (bandwidth clipping is handled separately)
    const effectiveCnRatio = cnRatio - adcDegradation.totalPenalty_dB;

    // Calculate bandwidth clipping info
    // The modem expects a certain bandwidth, but the IF filter may have clipped it
    const expectedBandwidth_Hz = modem.bandwidth * 1e6;
    const usableBandwidth_Hz = targetSignal.bandwidth;
    const bandwidthRatio = usableBandwidth_Hz / expectedBandwidth_Hz;
    // Use FEC-based threshold for consistency with getVisibleSignals()
    const minBandwidthRatio = this.getMinBandwidthRatioForFec_(targetSignal.fec);
    const isBandwidthClipped = bandwidthRatio < minBandwidthRatio;

    // Calculate frequency offset in Hz
    const signalFreqHz = targetSignal.frequency;
    const modemFreqHz = modem.frequency * 1e6;
    const frequencyOffset = signalFreqHz - modemFreqHz;

    // Check for modulation/FEC match and bandwidth (determines lock state)
    const modulationMismatch = targetSignal.modulation !== modem.modulation;
    const fecMismatch = targetSignal.fec !== modem.fec;
    const hasLock = !modulationMismatch && !fecMismatch && !isBandwidthClipped;

    return {
      hasCarrier: true,
      hasLock,
      actualModulation: targetSignal.modulation,
      configuredModulation: modem.modulation,
      cnRatio_dB: cnRatio,
      frequencyOffset_Hz: frequencyOffset,
      modulationMismatch,
      fecMismatch,
      adcDegradation,
      effectiveCnRatio_dB: effectiveCnRatio,
      noiseFloor_dBm: effectiveNoiseFloor,  // Now includes interference
      signalLevel_dBm: signalLevel,
      expectedBandwidth_Hz,
      usableBandwidth_Hz,
      isBandwidthClipped,
      // Interference diagnostics
      thermalNoiseFloor_dBm: thermalNoiseFloor,
      interferencePower_dBm: interferencePower > -Infinity ? interferencePower : undefined,
      interferenceCount: signalsInBand.length - 1,
    };
  }

  /**
   * Private Methods
   */

  /**
   * Calculate total interference power within the modem's demodulation bandwidth.
   * Uses proportional overlap for partial frequency overlaps.
   *
   * @param targetSignal - The wanted signal
   * @param allSignals - All signals in band (including target)
   * @param modemBandwidthHz - Modem's demodulation bandwidth in Hz
   * @param modemCenterHz - Modem's center frequency in Hz
   * @returns Total interference power in dBm, or -Infinity if no interference
   */
  private calculateInterferencePower_(
    targetSignal: IfSignal,
    allSignals: IfSignal[],
    modemBandwidthHz: number,
    modemCenterHz: number
  ): dBm {
    const modemLow = modemCenterHz - modemBandwidthHz / 2;
    const modemHigh = modemCenterHz + modemBandwidthHz / 2;

    let totalInterferenceMw = 0;

    for (const signal of allSignals) {
      // Skip the target signal
      if (signal.signalId === targetSignal.signalId) continue;

      // Calculate signal frequency bounds (bandwidth is already in Hz)
      const sigLow = signal.frequency - signal.bandwidth / 2;
      const sigHigh = signal.frequency + signal.bandwidth / 2;

      // Calculate overlap with modem bandwidth
      const overlapLow = Math.max(modemLow, sigLow);
      const overlapHigh = Math.min(modemHigh, sigHigh);
      const overlapWidth = Math.max(0, overlapHigh - overlapLow);

      if (overlapWidth === 0) continue;

      // Proportional power contribution based on overlap
      const overlapFraction = overlapWidth / signal.bandwidth;
      const signalPowerMw = Math.pow(10, signal.power / 10);
      totalInterferenceMw += signalPowerMw * overlapFraction;
    }

    return (totalInterferenceMw > 0
      ? 10 * Math.log10(totalInterferenceMw)
      : -Infinity) as dBm;
  }

  private handleInputChange(e: Event): void {
    const target = e.target as HTMLInputElement | HTMLSelectElement;
    const param = target.dataset.param;
    if (!param) return;

    const inputValue = target.value;

    // Parse based on parameter type
    switch (param) {
      case 'frequency':
        this.inputData.frequency = Number.parseFloat(inputValue) as MHz || 0 as MHz;
        break;
      case 'bandwidth':
        this.inputData.bandwidth = (Number.parseFloat(inputValue) as MHz) || 0 as MHz;
        break;
      case 'antenna_id':
        this.inputData.antenna_id = Number.parseInt(inputValue);
        break;
      case 'modulation':
        this.inputData.modulation = inputValue as ModulationType;
        break;
      case 'fec':
        this.inputData.fec = inputValue as FECType;
        break;
    }
  }

  public applyChanges(): void {
    const activeModem = this.activeModem;
    const modemIndex = this.state.modems.findIndex(m => m.modemNumber === this.state.activeModem);

    if (!activeModem || modemIndex === -1) return;

    // Update the modem configuration, preserving the current power state
    // (isPowered is controlled by the power toggle, not the Apply button)
    this.state.modems[modemIndex] = {
      ...activeModem,
      ...this.inputData,
      isPowered: activeModem.isPowered,
    };

    this.emit(Events.RX_CONFIG_CHANGED, {
      uuid: this.uuid,
      modem: this.state.activeModem,
      config: this.state.modems[modemIndex]
    });

    this.syncDomWithState();
  }

  private getLedColor(): string {
    const visibleSignals = this.getVisibleSignals();

    if (this.activeModem.isPowered === false) {
      return 'led-gray';
    }

    // If 1 then good signal
    if (visibleSignals.length === 1 && visibleSignals[0].isDegraded === false) {
      return 'led-green';
    }

    // If 2 then degraded
    if (visibleSignals.length === 2 || (visibleSignals.length === 1 && visibleSignals[0].isDegraded === true)) {
      return 'led-amber';
    }

    // If more than 2 then denied
    if (visibleSignals.length > 2) {
      return 'led-red';
    }

    return 'led-green';
  }

  public getVisibleSignals(activeModemData = this.activeModem) {
    if (!activeModemData) return [];

    const externalNoise = this.rfFrontEnd_?.externalNoise ?? 0;

    // Figure out which signals match the receiver settings
    // Note: Signals from agcModule.outputSignals already include all chain gains
    const expectedBandwidth_Hz = activeModemData.bandwidth * 1e6;

    const visibleSignals = (this.rfFrontEnd_?.agcModule.outputSignals ?? []).filter((s) => {
      if (s.power < externalNoise) {
        return false;
      }

      if (s.bandwidth > (expectedBandwidth_Hz as Hertz)) {
        return false;
      }

      // Filter out signals where bandwidth was severely clipped by IF filter
      // Minimum usable bandwidth depends on FEC rate - higher redundancy tolerates more loss
      // FEC tolerance: 1/2 (excellent) → 7/8 (fragile)
      const bandwidthRatio = s.bandwidth / expectedBandwidth_Hz;
      const minBandwidthRatio = this.getMinBandwidthRatioForFec_(s.fec);
      if (bandwidthRatio < minBandwidthRatio) {
        return false;
      }

      if (s.frequency + (s.bandwidth * 1e6 as Hertz) / 2 < activeModemData.frequency - activeModemData.bandwidth / 2) {
        return false;
      }
      if (s.frequency - (s.bandwidth * 1e6 as Hertz) / 2 > activeModemData.frequency + activeModemData.bandwidth / 2) {
        return false;
      }

      if (s.modulation !== activeModemData.modulation) {
        return false;
      }
      if (s.fec !== activeModemData.fec) {
        return false;
      }
      return true;
    });

    // Only include signals within 50% bandwidth of center frequency
    const signalsInBand = visibleSignals
      .filter((s) => {
        const frequencyMhz = s.frequency / 1e6 as MHz;
        const freqTolerance50 = activeModemData.bandwidth * 0.5;
        const lowerBound50 = activeModemData.frequency - freqTolerance50;
        const upperBound50 = activeModemData.frequency + freqTolerance50;
        return frequencyMhz >= lowerBound50 && frequencyMhz <= upperBound50;
      });

    // Find the strongest signal - signals significantly weaker (>20dB) are considered
    // suppressed (e.g., by notch filter) and shouldn't count as interference
    const maxPower = Math.max(...signalsInBand.map(s => s.power));
    const suppressionThreshold = 20; // dB - notch filters typically provide 20-60dB attenuation

    return signalsInBand
      .filter((s) => {
        // Filter out signals that are too weak (suppressed)
        if (s.power < maxPower - suppressionThreshold) return false;

        // Also filter out signals that were intentionally notched
        const notchState = this.rfFrontEnd_?.notchFilterModule?.state;
        if (notchState?.isPowered) {
          for (const notch of notchState.notches) {
            if (!notch.enabled) continue;

            // Check if signal frequency falls within notch bandwidth
            const signalFreqMHz = s.frequency / 1e6;
            const notchLow = notch.centerFrequency - notch.bandwidth / 2;
            const notchHigh = notch.centerFrequency + notch.bandwidth / 2;

            if (signalFreqMHz >= notchLow && signalFreqMHz <= notchHigh) {
              return false;  // Signal was intentionally notched, don't count as interference
            }
          }
        }

        return true;
      })
      .map((s) => {
        // Reset isDegraded flag before checking conditions
        // (signal objects are shared, so we must reset each time)
        s.isDegraded = false;

        const frequencyMhz = s.frequency / 1e6 as MHz;
        const freqTolerance10 = activeModemData.bandwidth * 0.1;
        const lowerBound10 = activeModemData.frequency - freqTolerance10;
        const upperBound10 = activeModemData.frequency + freqTolerance10;
        // Outside 10% frequency tolerance: mark as degraded
        if (!(frequencyMhz >= lowerBound10 && frequencyMhz <= upperBound10)) {
          s.isDegraded = true;
        }

        // Calculate C/N for each signal and mark as degraded if below threshold
        // Noise floor needs totalGain added to match the reference point
        // Signal from AGC output already includes all chain gains
        const noiseFloor = this.rfFrontEnd_.getNoiseFloor(TapPoint.RX_IF).noiseFloor + this.rfFrontEnd_.couplerModule.signalPathManager.getTotalRxGain();
        const signalLevel = s.power;  // Already includes all chain gains

        const cn = signalLevel - noiseFloor;

        // Typical C/N requirements:
        // BPSK: 6-8 dB
        // QPSK: 9-11 dB
        // 8QAM: 12-15 dB
        // 16QAM: 15-18 dB

        let requiredCN: number;

        switch (s.modulation) {
          case 'BPSK':
            requiredCN = 7;
            break;
          case 'QPSK':
            requiredCN = 10;
            break;
          case '8QAM':
            requiredCN = 13;
            break;
          case '16QAM':
            requiredCN = 16;
            break;
          default:
            requiredCN = 10;
            break;
        }

        if (cn < requiredCN) {
          s.isDegraded = true;
        }

        return s;
      });
  }

  /**
   * Get minimum bandwidth ratio required for a given FEC rate.
   * Higher redundancy FEC codes can tolerate more bandwidth loss.
   *
   * FEC Rate | Redundancy   | Min BW Ratio
   * 1/2      | Very high    | 40% (excellent tolerance)
   * 2/3      | High         | 50% (very good)
   * 3/4      | Solid        | 60% (good)
   * 5/6      | Moderate     | 75% (moderate)
   * 7/8      | Low          | 85% (fragile)
   */
  private getMinBandwidthRatioForFec_(fec: FECType): number {
    switch (fec) {
      case '1/2': return 0.40;
      case '2/3': return 0.50;
      case '3/4': return 0.60;
      case '5/6': return 0.75;
      case '7/8': return 0.85;
      default: return 0.60;
    }
  }

  private getModemStatusClass(modem: ReceiverModemState): string {
    const signals = this.getVisibleSignals(modem);
    const denied = signals.find(signal => signal.feed.includes('DENIED'));
    if (denied) return 'modem-denied';

    const degraded = signals.find(signal => signal.feed.includes('DEGRADED'));
    if (degraded) return 'modem-degraded';

    if (signals.length > 0) return 'modem-found';

    return '';
  }

  syncDomWithState(): void {
    const visibleSignals = this.getVisibleSignals().map(s => {
      // Return signal with degraded feed if applicable
      if (s.isDegraded && !s.isImage) {
        return {
          ...s,
          feed: `degraded-${s.feed.replace(/^degraded-/, '')}`
        };
      }
      return s;
    });
    const feedUrl = visibleSignals[0]?.feed || '';
    this.state.availableSignals = visibleSignals.map(s => ({ id: s.signalId, feed: s.feed, isDegraded: s.isDegraded || false }));

    // Avoid unnecessary DOM updates by shallow comparing serialized state
    if (JSON.stringify(this.state) === JSON.stringify(this.lastRenderState)) {
      return; // No changes, skip update
    }
    // Save render snapshot
    this.lastRenderState = structuredClone(this.state);

    const parentDom = this.domCache['parent'];

    // Update status banner
    const ledColor = this.getLedColor();
    (this.domCache['led']).className = `led ${ledColor}`;

    // Update modem buttons active & status classes
    const modemButtons = parentDom.querySelectorAll('.btn-modem');
    modemButtons.forEach((btn) => {
      const modemNum = Number((btn as HTMLElement).dataset.modem);
      const modem = this.state.modems.find(m => m.modemNumber === modemNum);
      const isActive = modemNum === this.state.activeModem;
      const statusClass = modem ? this.getModemStatusClass(modem) : '';
      btn.className = `btn-modem ${isActive ? 'active' : ''} ${statusClass}`.trim();
    });

    // Sync active modem display and inputs
    const activeModem = this.activeModem;

    if (this.domCache['inputAntenna']) {
      const sel = this.domCache['inputAntenna'] as HTMLSelectElement;
      // Try to select the option matching antenna id
      for (const option of sel.options) {
        option.selected = Number(option.value) === (this.inputData.antenna_id ?? activeModem?.antenna_id);
      }
    }

    (this.domCache['inputFrequency'] as HTMLInputElement).value = String(this.inputData.frequency ?? activeModem?.frequency ?? '');
    (this.domCache['inputBandwidth'] as HTMLInputElement).value = String(this.inputData.bandwidth ?? activeModem?.bandwidth ?? '');
    (this.domCache['inputModulation'] as HTMLSelectElement).value = String(this.inputData.modulation ?? activeModem?.modulation ?? '');
    (this.domCache['inputFec'] as HTMLSelectElement).value = String(this.inputData.fec ?? activeModem?.fec ?? '');

    (this.domCache['currentValueAntenna']).textContent = String(activeModem.antenna_id);
    (this.domCache['currentValueFrequency']).textContent = `${activeModem.frequency} MHz`;
    (this.domCache['currentValueBandwidth']).textContent = `${activeModem.bandwidth} MHz`;
    (this.domCache['currentValueModulation']).textContent = String(activeModem.modulation);
    (this.domCache['currentValueFec']).textContent = String(activeModem.fec);

    // Update power indicator light
    this.domCache['rxActivePowerLight'].className = `indicator-light ${activeModem.isPowered ? 'on' : 'off'}`;

    // Update monitor / video feed | KEEP AT BOTTOM
    const monitor = this.domCache['monitorScreen'];
    if (monitor) {
      if (!this.activeModem.isPowered) {
        // Remove no-signal-text
        monitor.innerHTML = `<span></span>`;
        monitor.className = 'monitor-screen no-power';
        return;
      }

      monitor.className = `monitor-screen ${feedUrl.length > 0 ? 'signal-found' : 'no-signal'}`;
      if (feedUrl.length > 0) {
        const media = this.mediaCache[feedUrl];
        if (media) {
          // Use cached media element
          monitor.innerHTML = '';
          monitor.appendChild(media);

          // If it is degraded, then add a css effect to make the image pixelated
          if (visibleSignals[0].isDegraded) {
            monitor.classList.add('glitch');
            monitor.innerHTML += `<div class="block-glitch"></div>`;
          }

          // Load previous play time if exists
          if (media instanceof HTMLVideoElement) {
            const savedTime = this.videoPlayTime[feedUrl] || 0;
            media.currentTime = savedTime;

            media.play().catch(() => {
              // flickering signal will cause failures to play, ignore
            });
          }
        } else {
          // If not in cache, create new media element
          const signal = visibleSignals[0];
          if (signal.isImage && !signal.isExternal) { // internal image
            const img = document.createElement('img');
            img.className = 'image-feed';
            img.src = `/images/${feedUrl}`;
            img.alt = 'Image Feed';
            monitor.innerHTML = `<div class="signal-indicator"></div>`;
            monitor.querySelector('.signal-indicator')?.appendChild(img);
            this.mediaCache[feedUrl] = img;

            // If it is degraded, then add a css effect to make the image pixelated
            if (signal.isDegraded) {
              monitor.classList.add('glitch');
              monitor.innerHTML += `<div class="block-glitch"></div>`;
            }

          } else if (signal.isImage && signal.isExternal) { // external image
            const img = document.createElement('img');
            img.className = 'external-image-feed';
            img.src = feedUrl;
            img.alt = 'External Image Feed';
            monitor.innerHTML = `<div class="signal-indicator"></div>`;
            monitor.querySelector('.signal-indicator')?.appendChild(img);
            this.mediaCache[feedUrl] = img;

            // If it is degraded, then add a css effect to make the image pixelated
            if (signal.isDegraded) {
              monitor.classList.add('glitch');
              monitor.innerHTML += `<div class="block-glitch"></div>`;
            }

          } else if (signal.isExternal) { // external video
            const iframe = document.createElement('iframe');
            iframe.className = 'external-feed';
            iframe.src = feedUrl;
            iframe.title = 'External Feed';
            monitor.innerHTML = `<div class="signal-indicator"></div>`;
            monitor.querySelector('.signal-indicator')?.appendChild(iframe);
            this.mediaCache[feedUrl] = iframe;
          } else { // internal video
            const video = document.createElement('video');
            video.className = 'video-feed';
            video.src = `/videos/${feedUrl}`;
            video.autoplay = true;
            video.muted = true;
            video.loop = true;
            monitor.innerHTML = `<div class="signal-indicator"></div>`;
            monitor.querySelector('.signal-indicator')?.appendChild(video);
            this.mediaCache[feedUrl] = video;

            // Track video play time
            video.addEventListener('timeupdate', () => {
              this.videoPlayTime[feedUrl] = video.currentTime;
            });
          }
        }
      } else {
        monitor.innerHTML = `<span class="no-signal-text">NO SIGNAL</span>`;
      }
    }
  }
}