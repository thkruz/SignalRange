import { PowerSwitch } from '@app/components/power-switch/power-switch';
import { html } from '@app/engine/utils/development/formatter';
import { qs } from '@app/engine/utils/query-selector';
import { AntennaCore } from '@app/equipment/antenna';
import { AlarmStatus, BaseEquipment } from '@app/equipment/base-equipment';
import { TapPoint } from '@app/equipment/rf-front-end/coupler-module/tap-points';
import { RFFrontEndCore } from '@app/equipment/rf-front-end/rf-front-end-core';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { Rng } from '@app/simulation/rng';
import { SimClock } from '@app/simulation/sim-clock';
import { dBm, FECType, Hertz, IfSignal, MHz, ModulationType } from '@app/types';
import { ADCDegradationResult, calculateADCDegradation } from './adc-degradation';
import {
  acquisitionTimeS,
  DEGRADED_MARGIN_DB,
  DEGRADED_RECOVERY_MARGIN_DB,
  DVB_S2_ROLL_OFF,
  LOCK_HYSTERESIS_DB,
  Modcod,
  modcodFor,
  requiredCnDb as requiredCnForModcod,
  symbolRateHz,
} from './modcod';
import './receiver.css';

/** Per-modem demodulator lock tracker (phase 19.5) */
interface LockTrack {
  signalId: string;
  locked: boolean;
  /** Run time (ms) spent above the acquisition threshold while unlocked */
  heldMs: number;
  /** Acquisition time drawn for this attempt, ms */
  acquireMs: number;
  /** Run time of the last evaluation, ms */
  lastMs: number;
  lowMargin: boolean;
  attempt: number;
}

export interface ReceiverModemState {
  antenna_id: number;
  modemNumber: number; // 1-4
  frequency: MHz; // MHz
  bandwidth: MHz; // MHz
  modulation: ModulationType;
  fec: FECType;
  isPowered: boolean;
  /**
   * Automatic frequency control: when enabled the modem center frequency slews
   * toward the received carrier (rate-limited), tracking Doppler drift.
   * Opt-in: when omitted/false tuning is fully manual (legacy behavior).
   */
  isAfcEnabled?: boolean;
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
  hasCarrier: boolean; // Any RF signal in bandwidth
  hasLock: boolean; // Modem can demodulate (mod + FEC match)
  actualModulation: ModulationType | null;
  configuredModulation: ModulationType;
  cnRatio_dB: number; // Carrier-to-noise ratio (raw, before ADC effects)
  frequencyOffset_Hz: number; // Offset from center frequency
  modulationMismatch: boolean;
  fecMismatch: boolean;
  /** ADC degradation result (clipping/quantization effects) */
  adcDegradation?: ADCDegradationResult;
  /** Effective C/N ratio after ADC penalty applied */
  effectiveCnRatio_dB?: number;
  /** Carrier label pair (modulation/FEC) differs from the modem's: no lock whatever the C/N */
  formatMismatch?: boolean;
  /** Signal ID of the carrier the modem is measuring */
  targetSignalId?: string;
  /** Symbol rate of the target carrier (occupied bandwidth / (1 + roll-off)), Hz */
  symbolRate_Hz?: number;
  /** Es/N0 before the ADC: C / (k T Rs + interference in the carrier's band), dB */
  esN0_dB?: number;
  /** Es/N0 after the ADC's quantization and clipping noise, dB; this is what locks */
  effectiveEsN0_dB?: number;
  /** Carrier to thermal noise density, dB-Hz */
  cn0_dBHz?: number;
  /** The modem's MODCOD (its configured labels); null for labels no demodulator locks to */
  modcod?: Modcod | null;
  /** Es/N0 the modem's MODCOD needs (DVB-S2 QEF + implementation loss), dB */
  requiredEsN0_dB?: number;
  /** Effective Es/N0 minus the required Es/N0, dB */
  lockMargin_dB?: number;
  /** Lock tracker state: acquiring = above threshold, waiting out the acquisition time */
  lockState?: 'locked' | 'acquiring' | 'unlocked';
  /** Locked with less than 1 dB of margin (with 0.5 dB recovery hysteresis) */
  isLowMargin?: boolean;
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
    const overridesByModemNumber = new Map<number, Partial<ReceiverModemState>>((state?.modems ?? []).map((m) => [m.modemNumber, m]));

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

  /**
   * Lock threshold expressed as C/N (dB) in the carrier's occupied bandwidth
   * (= a modem tuned to the carrier's bandwidth): the MODCOD's Es/N0 threshold
   * (DVB-S2 QEF + 1 dB implementation loss) less 10 log(1 + roll-off).
   * QPSK 3/4: 5.03 dB Es/N0 = 4.24 dB C/N. Infinity for labels that never lock.
   */
  static requiredCnDb(modulation: string, fec = '3/4'): number {
    const modcod = modcodFor(modulation, fec);
    if (!modcod) return Number.POSITIVE_INFINITY;
    const rs = symbolRateHz(1);
    return requiredCnForModcod(modcod, 1, rs);
  }

  /** Lock trackers by modem number */
  private readonly lockTracks_ = new Map<number, LockTrack>();

  static getDefaultState(): ReceiverState {
    const modems: ReceiverModemState[] = Array.from({ length: 4 }, (_, idx) => {
      const modemNumber = idx + 1;

      return {
        modemNumber,
        antenna_id: modemNumber <= 2 ? 1 : 2,
        frequency: 1400 as MHz, // IF Band after downconversion
        bandwidth: 20 as MHz,
        modulation: 'QPSK' as ModulationType,
        fec: '1/2' as FECType,
        isPowered: true,
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
    this.updateAfc_();
    // Run every powered modem's lock tracker each step, so acquisition time
    // accrues whether or not anything is looking at that modem
    for (const modem of this.state.modems) {
      if (modem.isPowered) this.getSignalsInBandwidth(modem);
    }
    this.checkForAlarms_();
    this.syncDomWithState();
  }

  /** Max AFC retune per update tick (Hz) — slow enough to feel like a tracking loop */
  private static readonly AFC_MAX_STEP_HZ = 200;
  /** Offsets below this are considered centered; AFC holds (Hz) */
  private static readonly AFC_DEADBAND_HZ = 10;

  /**
   * Automatic frequency control: slew each AFC-enabled modem toward the
   * carrier it is receiving. Only acts when a carrier is present; opt-in per
   * modem via isAfcEnabled (absent on all legacy configs).
   */
  private updateAfc_(): void {
    for (const modem of this.state.modems) {
      if (!modem.isAfcEnabled || !modem.isPowered) continue;

      const info = this.getSignalsInBandwidth(modem);
      if (!info.hasCarrier) continue;

      const offsetHz = info.frequencyOffset_Hz;
      if (Math.abs(offsetHz) < Receiver.AFC_DEADBAND_HZ) continue;

      const stepHz = Math.max(-Receiver.AFC_MAX_STEP_HZ, Math.min(Receiver.AFC_MAX_STEP_HZ, offsetHz));
      modem.frequency = (modem.frequency + stepHz / 1e6) as MHz;
    }
  }

  public handleAfcToggle(modemNumber: number, isEnabled: boolean): void {
    const modem = this.state.modems.find((m) => m.modemNumber === modemNumber);
    if (modem) {
      modem.isAfcEnabled = isEnabled;
    }
  }

  public handleModemFrequencyChange(modemNumber: number, frequencyMHz: number): void {
    const modem = this.state.modems.find((m) => m.modemNumber === modemNumber);
    if (modem) {
      modem.frequency = frequencyMHz as MHz;
    }
  }

  public handleModemConfigChange(modemNumber: number, config: { modulation?: ModulationType; fec?: FECType; bandwidthMHz?: number }): void {
    const modem = this.state.modems.find((m) => m.modemNumber === modemNumber);
    if (!modem) return;

    if (config.modulation !== undefined) {
      modem.modulation = config.modulation;
    }
    if (config.fec !== undefined) {
      modem.fec = config.fec;
    }
    if (config.bandwidthMHz !== undefined && config.bandwidthMHz > 0) {
      modem.bandwidth = config.bandwidthMHz as MHz;
    }
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
            ${this.state.modems
              .map(
                (modem) => html`
              <button id="modem-${modem.modemNumber}"
                class="btn-modem ${modem.modemNumber === this.state.activeModem ? 'active' : ''} ${this.getModemStatusClass(modem)}"
                data-modem="${modem.modemNumber}">
                ${modem.modemNumber}
              </button>
            `
              )
              .join('')}
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
                ${
                  feedUrl.length > 0
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
    this.state.modems.forEach((modem) => {
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
    modemButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const modemNum = Number.parseInt((e.target as HTMLElement).dataset.modem || '1');
        this.setActiveModem(modemNum);
      });
    });

    // Input changes
    const inputs = parentDom.querySelectorAll('input, select');
    inputs.forEach((input) => {
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
        severity: 'info',
      });
    }

    return alarms;
  }

  private togglePower(isOn: boolean): void {
    SimClock.setTimeout(
      () => {
        this.activeModem.isPowered = isOn;

        this.emit(Events.RX_CONFIG_CHANGED, {
          uuid: this.uuid,
          modem: this.state.activeModem,
          config: this.state.modems.find((m) => m.modemNumber === this.state.activeModem),
        });
        this.syncDomWithState();
      },
      isOn ? 4000 : 250
    );
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
    return this.state.modems.find((m) => m.modemNumber === this.state.activeModem) ?? this.state.modems[0];
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
      activeModem: modemNumber,
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
    return visibleSignals.some((s) => s.feed !== '');
  }

  public isSignalDegraded(modem: ReceiverModemState): boolean {
    const visibleSignals = this.getVisibleSignals(modem);
    if (visibleSignals.length === 0) return false;

    // Check if any signal is degraded
    return visibleSignals.some((s) => s.isDegraded);
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

    const info = this.getSignalsInBandwidth(modem);
    return info.hasCarrier ? (info.signalLevel_dBm ?? null) : null;
  }

  /**
   * Measure the carrier a modem is tuned to and run its lock tracker.
   *
   * Carrier detection is relaxed (any carrier that clears the receive noise in
   * the IF filter and overlaps the modem passband), so the IQ display can show
   * a carrier the modem cannot demodulate. Lock (phase 19.5) needs the labels
   * to match, the carrier to fit the passband, and the effective Es/N0 (noise
   * in the symbol-rate bandwidth, co-channel interference in the carrier's
   * band, the ADC's quantization and clipping noise) to clear the MODCOD's
   * threshold + 0.5 dB for the seeded acquisition time; it drops below
   * threshold - 0.5 dB.
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
      formatMismatch: false,
      lockState: 'unlocked',
    };

    if (!this.rfFrontEnd_) return noSignalResult;

    const spm = this.rfFrontEnd_.couplerModule.signalPathManager;
    const totalGain = spm.getTotalRxGain();
    const modemLowHz = (modem.frequency - modem.bandwidth / 2) * 1e6;
    const modemHighHz = (modem.frequency + modem.bandwidth / 2) * 1e6;
    const modemBandwidthHz = (modem.bandwidth * 1e6) as Hertz;

    // Every carrier the modem could see: clears the noise in the IF filter,
    // fits the modem bandwidth and overlaps the passband (all in Hz)
    const signalsInBand = (this.rfFrontEnd_.agcModule.outputSignals ?? []).filter((s) => {
      if (!this.clearsReceiveNoise_(s)) return false;
      if (s.bandwidth > modemBandwidthHz) return false;
      const signalLower = s.frequency - s.bandwidth / 2;
      const signalUpper = s.frequency + s.bandwidth / 2;
      return !(signalUpper < modemLowHz || signalLower > modemHighHz);
    });

    if (signalsInBand.length === 0) {
      this.resetLock_(modem.modemNumber);
      return noSignalResult;
    }

    // Target: the widest carrier, preferring ones whose labels match the
    // modem (a narrowband interferer is never mistaken for the payload)
    const modFecMatches = signalsInBand.filter((s) => s.modulation === modem.modulation && s.fec === modem.fec);
    const candidates = modFecMatches.length > 0 ? modFecMatches : signalsInBand;
    const targetSignal = candidates.reduce((a, b) => (b.bandwidth > a.bandwidth || (b.bandwidth === a.bandwidth && b.power > a.power) ? b : a), candidates[0]);
    const signalLevel = targetSignal.power; // AGC output: already includes all chain gains

    // C/(N+I) in the modem's bandwidth: the operator's C/N readout
    const thermalNoiseFloor = spm.getNoiseFloorAt(TapPoint.RX_IF, modemBandwidthHz).noiseFloorNoGain + totalGain;
    const modemCenterHz = modem.frequency * 1e6;
    // Interference: every other carrier at the AGC output that overlaps, at
    // any level (a co-channel carrier under the noise still adds to N + I)
    const allSignals = this.rfFrontEnd_.agcModule.outputSignals ?? [];
    const interferencePower = this.calculateInterferencePower_(targetSignal, allSignals, modemBandwidthHz, modemCenterHz);
    const thermalNoiseMw = 10 ** (thermalNoiseFloor / 10);
    const interferenceMw = interferencePower > -Infinity ? 10 ** (interferencePower / 10) : 0;
    const effectiveNoiseFloor = 10 * Math.log10(thermalNoiseMw + interferenceMw);
    const cnRatio = signalLevel - effectiveNoiseFloor;

    // Es/N0: matched filter, noise bandwidth = symbol rate; co-channel
    // interference counted over the carrier's own occupied band
    const symbolRate = symbolRateHz(targetSignal.bandwidth, DVB_S2_ROLL_OFF);
    const noiseInRsDbm = spm.getNoiseFloorAt(TapPoint.RX_IF, symbolRate as Hertz).noiseFloorNoGain + totalGain;
    const n0DbmHz = spm.getNoiseFloorAt(TapPoint.RX_IF, 1 as Hertz).noiseFloorNoGain + totalGain;
    const inCarrierInterference = this.calculateInterferencePower_(targetSignal, allSignals, targetSignal.bandwidth, targetSignal.frequency);
    const inCarrierInterferenceMw = inCarrierInterference > -Infinity ? 10 ** (inCarrierInterference / 10) : 0;
    const esN0 = signalLevel - 10 * Math.log10(10 ** (noiseInRsDbm / 10) + inCarrierInterferenceMw);
    const cn0 = signalLevel - n0DbmHz;

    // ADC: the demodulator's tuner filters the modem's channel out of the AGC
    // output and its IF AGC lifts it toward the target level (up to 30 dB of
    // gain, never attenuating), then the ADC samples it. The in-channel
    // composite (every overlapping carrier + the noise in the modem bandwidth)
    // sets the drive; its quantization and clipping noise add to the
    // carrier's own. A channel driven hot by the station AGC still clips; one
    // more than 30 dB low still sinks into quantization noise.
    const inChannelMw = thermalNoiseMw + this.inChannelCarrierMw_(allSignals, modemLowHz, modemHighHz);
    const inChannelDbm = 10 * Math.log10(inChannelMw);
    const agcTarget = this.rfFrontEnd_.agcModule?.state.targetLevel ?? -30;
    const channelGainDb = Math.min(Receiver.TUNER_IF_AGC_RANGE_DB, Math.max(0, agcTarget - inChannelDbm));
    const adcDegradation = calculateADCDegradation((inChannelDbm + channelGainDb) as dBm, {
      power_dBm: signalLevel + channelGainDb,
      esN0_dB: esN0,
      symbolRate_Hz: symbolRate,
    });
    const effectiveEsN0 = esN0 - adcDegradation.totalPenalty_dB;
    const effectiveCnRatio = cnRatio - adcDegradation.totalPenalty_dB;

    // The IF filter may have clipped the carrier below what the FEC tolerates
    const expectedBandwidth_Hz = modem.bandwidth * 1e6;
    const usableBandwidth_Hz = targetSignal.bandwidth;
    const isBandwidthClipped = usableBandwidth_Hz / expectedBandwidth_Hz < this.getMinBandwidthRatioForFec_(targetSignal.fec);

    const frequencyOffset = targetSignal.frequency - modemCenterHz;
    const modulationMismatch = targetSignal.modulation !== modem.modulation;
    const fecMismatch = targetSignal.fec !== modem.fec;
    const formatMismatch = modulationMismatch || fecMismatch;

    // The demodulator acquires only a carrier centred inside its passband
    const isCentred = Math.abs(frequencyOffset) <= expectedBandwidth_Hz / 2;
    const modcod = modcodFor(modem.modulation, modem.fec);
    const requiredEsN0 = modcod?.thresholdEsN0Db ?? Number.POSITIVE_INFINITY;
    const lockMargin = effectiveEsN0 - requiredEsN0;
    const canAcquire = modem.isPowered && !formatMismatch && !isBandwidthClipped && isCentred && modcod !== null;
    const lock = this.trackLock_(modem.modemNumber, targetSignal.signalId, canAcquire, lockMargin, symbolRate);

    return {
      hasCarrier: true,
      hasLock: lock.locked,
      actualModulation: targetSignal.modulation,
      configuredModulation: modem.modulation,
      cnRatio_dB: cnRatio,
      frequencyOffset_Hz: frequencyOffset,
      modulationMismatch,
      fecMismatch,
      formatMismatch,
      adcDegradation,
      effectiveCnRatio_dB: effectiveCnRatio,
      noiseFloor_dBm: effectiveNoiseFloor, // includes interference
      signalLevel_dBm: signalLevel,
      expectedBandwidth_Hz,
      usableBandwidth_Hz,
      isBandwidthClipped,
      thermalNoiseFloor_dBm: thermalNoiseFloor,
      interferencePower_dBm: interferencePower > -Infinity ? interferencePower : undefined,
      interferenceCount: signalsInBand.length - 1,
      targetSignalId: targetSignal.signalId,
      symbolRate_Hz: symbolRate,
      esN0_dB: esN0,
      effectiveEsN0_dB: effectiveEsN0,
      cn0_dBHz: cn0,
      modcod,
      requiredEsN0_dB: requiredEsN0,
      lockMargin_dB: lockMargin,
      lockState: lock.locked ? 'locked' : lock.heldMs > 0 ? 'acquiring' : 'unlocked',
      isLowMargin: lock.locked && lock.lowMargin,
    };
  }

  /** A carrier below this C/N in its own bandwidth is not a carrier to the modem (dB; the antenna's carriage floor too, 19.4) */
  static readonly CARRIER_DETECT_CN_DB = -10;

  /**
   * One carrier-presence gate for every receive path (before 19.5 one path
   * compared against the noise in the whole IF filter and another added the
   * chain gain a second time): the carrier's C/N in its own occupied
   * bandwidth must reach -10 dB, the floor below which the antenna stops
   * carrying it at all. Weaker co-channel carriers still count as
   * interference.
   */
  private clearsReceiveNoise_(signal: IfSignal): boolean {
    const spm = this.rfFrontEnd_?.couplerModule.signalPathManager;
    if (!spm) return false;
    if (!(signal.bandwidth > 0)) return true;
    const noiseInCarrierBw = spm.getNoiseFloorAt(TapPoint.RX_IF, signal.bandwidth).noiseFloorNoGain + spm.getTotalRxGain();
    return signal.power - noiseInCarrierBw >= Receiver.CARRIER_DETECT_CN_DB;
  }

  /** Gain range of the demodulator tuner's IF AGC ahead of its ADC, dB */
  static readonly TUNER_IF_AGC_RANGE_DB = 30;

  /** Power (mW) of every carrier inside [lowHz, highHz], by bandwidth overlap */
  private inChannelCarrierMw_(signals: IfSignal[], lowHz: number, highHz: number): number {
    let total = 0;
    for (const s of signals) {
      const sigLow = s.frequency - s.bandwidth / 2;
      const sigHigh = s.frequency + s.bandwidth / 2;
      if (s.bandwidth <= 0) {
        if (s.frequency >= lowHz && s.frequency <= highHz) total += 10 ** (s.power / 10);
        continue;
      }
      const overlap = Math.max(0, Math.min(highHz, sigHigh) - Math.max(lowHz, sigLow));
      total += 10 ** (s.power / 10) * (overlap / s.bandwidth);
    }
    return total;
  }

  private resetLock_(modemNumber: number): void {
    const track = this.lockTracks_.get(modemNumber);
    if (track) {
      track.locked = false;
      track.heldMs = 0;
      track.lowMargin = false;
      track.signalId = '';
      track.lastMs = SimClock.runMs();
    }
  }

  /**
   * Advance a modem's lock tracker to the current run time. Idempotent within
   * a step (several readers per frame see the same state).
   */
  private trackLock_(modemNumber: number, signalId: string, canAcquire: boolean, marginDb: number, symbolRate: number): LockTrack {
    const now = SimClock.runMs();
    let track = this.lockTracks_.get(modemNumber);
    if (!track) {
      track = { signalId: '', locked: false, heldMs: 0, acquireMs: 0, lastMs: now, lowMargin: false, attempt: 0 };
      this.lockTracks_.set(modemNumber, track);
    }
    // Run time restarts at 0 each scenario
    const dt = Math.max(0, now - track.lastMs);
    track.lastMs = now;

    if (track.signalId !== signalId || !canAcquire) {
      track.locked = false;
      track.heldMs = 0;
      track.lowMargin = false;
      if (track.signalId !== signalId) {
        track.signalId = signalId;
        track.acquireMs = this.drawAcquisitionMs_(modemNumber, signalId, track.attempt++, symbolRate);
      }
      if (!canAcquire) return track;
    }

    if (track.locked) {
      if (marginDb < -LOCK_HYSTERESIS_DB) {
        track.locked = false;
        track.heldMs = 0;
        track.lowMargin = false;
        track.acquireMs = this.drawAcquisitionMs_(modemNumber, signalId, track.attempt++, symbolRate);
      }
    } else if (marginDb >= LOCK_HYSTERESIS_DB) {
      track.heldMs += dt;
      if (track.heldMs >= track.acquireMs) {
        track.locked = true;
        track.lowMargin = marginDb < DEGRADED_MARGIN_DB;
      }
    } else {
      track.heldMs = 0;
    }

    if (track.locked) {
      if (marginDb < DEGRADED_MARGIN_DB) {
        track.lowMargin = true;
      } else if (marginDb >= DEGRADED_RECOVERY_MARGIN_DB) {
        track.lowMargin = false;
      }
    }

    return track;
  }

  /** Seeded acquisition time for one attempt on one carrier, ms */
  private drawAcquisitionMs_(modemNumber: number, signalId: string, attempt: number, symbolRate: number): number {
    const u = Rng.hashUniform(`${Rng.getSeed()}:rx-acquire:${this.state.server_id}:${modemNumber}:${signalId}:${attempt}`);
    return acquisitionTimeS(symbolRate, u) * 1000;
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
  private calculateInterferencePower_(targetSignal: IfSignal, allSignals: IfSignal[], modemBandwidthHz: number, modemCenterHz: number): dBm {
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
      const signalPowerMw = 10 ** (signal.power / 10);
      totalInterferenceMw += signalPowerMw * overlapFraction;
    }

    return (totalInterferenceMw > 0 ? 10 * Math.log10(totalInterferenceMw) : -Infinity) as dBm;
  }

  private handleInputChange(e: Event): void {
    const target = e.target as HTMLInputElement | HTMLSelectElement;
    const param = target.dataset.param;
    if (!param) return;

    const inputValue = target.value;

    // Parse based on parameter type
    switch (param) {
      case 'frequency':
        this.inputData.frequency = (Number.parseFloat(inputValue) as MHz) || (0 as MHz);
        break;
      case 'bandwidth':
        this.inputData.bandwidth = (Number.parseFloat(inputValue) as MHz) || (0 as MHz);
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
    const modemIndex = this.state.modems.findIndex((m) => m.modemNumber === this.state.activeModem);

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
      config: this.state.modems[modemIndex],
    });

    this.syncDomWithState();
  }

  private getLedColor(): string {
    if (this.activeModem.isPowered === false) {
      return 'led-gray';
    }

    const visibleSignals = this.getVisibleSignals();
    if (visibleSignals.length === 0) {
      return 'led-green';
    }

    return visibleSignals[0].isDegraded ? 'led-amber' : 'led-green';
  }

  /**
   * The carrier the modem is decoding: the locked target of
   * `getSignalsInBandwidth` (one carrier, copied, so the shared signal object
   * is never mutated), or nothing. It reads degraded with less than 1 dB of
   * lock margin, or when the carrier sits more than 10 % of the modem
   * bandwidth off centre.
   */
  public getVisibleSignals(activeModemData = this.activeModem): IfSignal[] {
    if (!activeModemData || !this.rfFrontEnd_) return [];

    const info = this.getSignalsInBandwidth(activeModemData);
    if (!info.hasLock) return [];

    const target = (this.rfFrontEnd_.agcModule.outputSignals ?? []).find(
      (s) => s.signalId === info.targetSignalId && s.modulation === activeModemData.modulation && s.fec === activeModemData.fec
    );
    if (!target) return [];

    const isOffCentre = Math.abs(info.frequencyOffset_Hz) > activeModemData.bandwidth * 1e6 * 0.1;

    return [{ ...target, isDegraded: (info.isLowMargin ?? false) || isOffCentre }];
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
      case '1/2':
        return 0.4;
      case '2/3':
        return 0.5;
      case '3/4':
        return 0.6;
      case '5/6':
        return 0.75;
      case '7/8':
        return 0.85;
      default:
        return 0.6;
    }
  }

  private getModemStatusClass(modem: ReceiverModemState): string {
    const signals = this.getVisibleSignals(modem);
    const denied = signals.find((signal) => signal.feed.includes('DENIED'));
    if (denied) return 'modem-denied';

    const degraded = signals.find((signal) => signal.feed.includes('DEGRADED'));
    if (degraded) return 'modem-degraded';

    if (signals.length > 0) return 'modem-found';

    return '';
  }

  syncDomWithState(): void {
    const visibleSignals = this.getVisibleSignals().map((s) => {
      // Return signal with degraded feed if applicable
      if (s.isDegraded && !s.isImage) {
        return {
          ...s,
          feed: `degraded-${s.feed.replace(/^degraded-/, '')}`,
        };
      }
      return s;
    });
    const feedUrl = visibleSignals[0]?.feed || '';
    this.state.availableSignals = visibleSignals.map((s) => ({ id: s.signalId, feed: s.feed, isDegraded: s.isDegraded || false }));

    // Avoid unnecessary DOM updates by shallow comparing serialized state
    if (JSON.stringify(this.state) === JSON.stringify(this.lastRenderState)) {
      return; // No changes, skip update
    }
    // Save render snapshot
    this.lastRenderState = structuredClone(this.state);

    const parentDom = this.domCache['parent'];

    // Update status banner
    const ledColor = this.getLedColor();
    this.domCache['led'].className = `led ${ledColor}`;

    // Update modem buttons active & status classes
    const modemButtons = parentDom.querySelectorAll('.btn-modem');
    modemButtons.forEach((btn) => {
      const modemNum = Number((btn as HTMLElement).dataset.modem);
      const modem = this.state.modems.find((m) => m.modemNumber === modemNum);
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

    this.domCache['currentValueAntenna'].textContent = String(activeModem.antenna_id);
    this.domCache['currentValueFrequency'].textContent = `${activeModem.frequency} MHz`;
    this.domCache['currentValueBandwidth'].textContent = `${activeModem.bandwidth} MHz`;
    this.domCache['currentValueModulation'].textContent = String(activeModem.modulation);
    this.domCache['currentValueFec'].textContent = String(activeModem.fec);

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

            // play() returns undefined where media is not implemented (jsdom)
            media.play()?.catch(() => {
              // flickering signal will cause failures to play, ignore
            });
          }
        } else {
          // If not in cache, create new media element
          const signal = visibleSignals[0];
          if (signal.isImage && !signal.isExternal) {
            // internal image
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
          } else if (signal.isImage && signal.isExternal) {
            // external image
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
          } else if (signal.isExternal) {
            // external video
            const iframe = document.createElement('iframe');
            iframe.className = 'external-feed';
            iframe.src = feedUrl;
            iframe.title = 'External Feed';
            monitor.innerHTML = `<div class="signal-indicator"></div>`;
            monitor.querySelector('.signal-indicator')?.appendChild(iframe);
            this.mediaCache[feedUrl] = iframe;
          } else {
            // internal video
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
