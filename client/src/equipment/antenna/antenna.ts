import { PowerSwitch } from "@app/components/power-switch/power-switch";
import { RotaryKnob } from "@app/components/rotary-knob/rotary-knob";
import { ToggleSwitch } from "@app/components/toggle-switch/toggle-switch";
import { Degrees } from "@app/engine/ootk/src/main";
import { EventBus } from "@app/events/event-bus";
import { Sfx } from "@app/sound/sfx-enum";
import SoundManager from "@app/sound/sound-manager";
import { html } from "../../engine/utils/development/formatter";
import { qs } from "../../engine/utils/query-selector";
import { Events } from "../../events/events";
import { SimulationManager } from "../../simulation/simulation-manager";
import { dBm, Hertz, RfSignal } from "../../types";
import { BaseEquipment } from '../base-equipment';
import { RFFrontEnd } from "../rf-front-end/rf-front-end";
import { Transmitter } from "../transmitter/transmitter";
import './antenna.css';

/**
 * RF Propagation constants for GEO satellite communications
 */
const GEO_SATELLITE_DISTANCE_KM = 38000; // Approximate slant range to GEO satellite (km)
// const SPEED_OF_LIGHT = 299792458; // m/s

export interface AntennaState {
  noiseFloor: number;
  isPowered: boolean;
  /** Which antenna is this */
  uuid: string;
  /** If there are multiple teams, which team is this antenna part of */
  teamId: number;
  /** Which server is this antenna connected to */
  serverId: number;
  /** Which satellite is this antenna targeting */
  noradId: number;
  /** Antenna skew between -90 and 90 degrees */
  skew: Degrees;
  /** is loopback enabled */
  isLoopback: boolean;
  /** is antenna locked on a satellite */
  isLocked: boolean;
  /** is auto-tracking enabled */
  isAutoTrackEnabled: boolean;
  /** is antenna operational */
  isOperational: boolean;
  /** signals currently received */
  rxSignalsIn: RfSignal[];
}

/**
 * Antenna - Single antenna unit
 * Manages antenna state, loopback switch, and satellite tracking
 * Extends Equipment base class for standard lifecycle
 */
export class Antenna extends BaseEquipment {
  /** Current antenna state */
  state: AntennaState;
  private readonly powerSwitch_: PowerSwitch;
  private readonly skewKnob_: RotaryKnob;
  private readonly loopbackSwitch_: ToggleSwitch;
  /** Input state being edited in the UI before applying changes */
  private inputState: AntennaState;
  private lastRenderState: AntennaState;
  private rfFrontEnd_: RFFrontEnd | null = null;

  transmitters: Transmitter[] = [];

  /** Waveguide loss (dB) */
  private readonly WAVEGUIDE_LOSS = 1;

  constructor(parentId: string, teamId: number = 1, serverId: number = 1) {
    super(parentId, teamId);

    // Initialize status with defaults
    this.state = {
      uuid: this.uuid,
      teamId: this.teamId,
      serverId: serverId,
      noradId: 1,
      skew: 0 as Degrees,
      isLoopback: false,
      isLocked: false,
      isAutoTrackEnabled: false,
      isOperational: true,
      isPowered: true,
      rxSignalsIn: [],
      noiseFloor: -130,
    };

    this.powerSwitch_ = PowerSwitch.create(`antenna-power-switch-${this.state.uuid}`, this.state.isPowered);
    this.skewKnob_ = RotaryKnob.create(
      `antenna-skew-knob-${this.state.uuid}`,
      this.state.skew,
      -90,
      90,
      1,
      (value) => this.handleSkewChange_(value)
    );

    this.loopbackSwitch_ = ToggleSwitch.create(
      `antenna-loopback-${this.state.uuid}`,
      this.state.isLoopback,
      false
    );

    // Input state starts as a copy of current state
    this.inputState = structuredClone(this.state);
    const parentDom = this.initializeDom(parentId);
    this.lastRenderState = structuredClone(this.state);
    this.addListeners_(parentDom);

    EventBus.getInstance().on(Events.UPDATE, this.update.bind(this));
    EventBus.getInstance().on(Events.SYNC, this.syncDomWithState_.bind(this));
  }

  initializeDom(parentId: string): HTMLElement {
    const parentDom = super.initializeDom(parentId);

    parentDom.innerHTML = html`
      <div class="equipment-box">
        <div class="equipment-case-header">
          <div class="equipment-case-title">Antenna ${this.uuidShort}</div>
          <div class="equipment-case-power-controls">
            <div class="equipment-case-main-power"></div>
            <div class="equipment-case-status-indicator">
              <span class="equipment-case-status-label">Status</span>
              <div class="led ${this.state.isPowered ? 'led-green' : 'led-amber'}"></div>
            </div>
          </div>
        </div>

        <div class="antenna-controls">
          <!-- Loopback Switch Section -->
          <div class="loopback-section">
            <div class="status-indicator loopback">
              <span id="ant-loopback-light" class="indicator-light ${this.state.isLoopback ? 'on' : 'off'}"></span>
              <span class="indicator-label">Loopback to<br />OMT</span>
            </div>
            ${this.loopbackSwitch_.html}
          </div>

          <!-- Antenna Configuration -->
          <div class="antenna-config">
            <div class="config-row">
              <label>Satellite</label>
              <select class="input-target" data-param="noradId">
                <option value="28912" ${this.inputState.noradId === 28912 ? 'selected' : ''}>METEOSAT-9 (MSG-2)</option>
                <option value="1" ${this.inputState.noradId === 1 ? 'selected' : ''}>ARKE 3G</option>
                <option value="2" ${this.inputState.noradId === 2 ? 'selected' : ''}>AURORA 2B</option>
                <option value="3" ${this.inputState.noradId === 3 ? 'selected' : ''}>AUXO STAR</option>
                <option value="4" ${this.inputState.noradId === 4 ? 'selected' : ''}>ENYO</option>
              </select>
              <span id="labelTarget" class="current-value">${this.state.noradId}</span>
            </div>

            <div class="config-row">
              <label>Skew</label>
              ${this.skewKnob_.html}
              <span id="labelSkew" class="current-value">${this.state.skew}°</span>
            </div>

            <div class="config-row">
              <label>Auto-Track</label>
              <div class="switch-container">
                <label class="switch">
                  <input
                    type="checkbox"
                    class="input-track"
                    data-param="track"
                    ${this.state.isAutoTrackEnabled ? 'checked' : ''}
                  />
                  <span class="slider"></span>
                </label>
              </div>
              <span id="labelLockStatus" class="lock-status ${this.state.isLocked ? 'locked' : 'unlocked'}">
                ${this.state.isLocked ? 'LOCKED' : this.state.isAutoTrackEnabled ? 'TRACKING' : 'UNLOCKED'}
              </span>
            </div>

            <div class="config-actions">
              <button class="btn-apply" data-action="apply">Apply</button>
              ${this.powerSwitch_.html}
            </div>
          </div>
        </div>

        <!-- Bottom Status Bar -->
        <div class="equipment-case-footer">
          <div class="bottom-status-bar">
            SYSTEM NORMAL
          </div>
          <div class="mode-toggle">
            <button class="btn-mode-toggle" data-action="toggle-advanced-mode">
              Placeholder
            </button>
          </div>
        </div>
      </div>
    `;

    this.domCache['parent'] = parentDom;
    this.domCache['status'] = qs('.equipment-case-status-label', parentDom);
    this.domCache['led'] = qs('.led', parentDom);
    this.domCache['inputTarget'] = qs('.input-target', parentDom);
    this.domCache['inputTrack'] = qs('.input-track', parentDom);
    this.domCache['lockStatus'] = qs('.lock-status', parentDom);
    this.domCache['btnApply'] = qs('.btn-apply', parentDom);
    this.domCache['labelTarget'] = qs('#labelTarget', parentDom);
    this.domCache['labelLockStatus'] = qs('#labelLockStatus', parentDom);
    this.domCache['labelSkew'] = qs('#labelSkew', parentDom);
    this.domCache['antLoopbackLight'] = qs('#ant-loopback-light', parentDom);
    this.domCache['bottomStatusBar'] = qs('.bottom-status-bar', parentDom);

    return parentDom;
  }

  protected addListeners_(parentDom: HTMLElement): void {
    // Input changes
    const inputs = parentDom.querySelectorAll('input, select');
    inputs.forEach(input => {
      input.addEventListener('change', (e) => this.handleInputChange_(e));
    });

    this.skewKnob_?.attachListeners();

    // Loopback switch handler
    this.loopbackSwitch_?.addEventListeners(this.toggleLoopback_.bind(this));

    // Apply button
    const btnApply = qs('.btn-apply', parentDom);
    btnApply?.addEventListener('click', () => this.applyChanges_());

    // Power switch
    this.powerSwitch_.addEventListeners(this.togglePower_.bind(this));

    // Track switch special handling
    const trackSwitch = qs('.input-track', parentDom) as HTMLInputElement;
    trackSwitch?.addEventListener('change', () => this.handleTrackChange_(parentDom));

    this.on(Events.ANTENNA_LOCKED, () => (data: { locked: boolean; uuid: string }) => {
      if (data.uuid === this.uuid) {
        this.state.isLocked = data.locked;
        this.updateSignalStatus_();
        this.syncDomWithState_();
      }
    });
  }

  private updateBottomStatusBar_(): void {
    const statusBarElement = this.domCache['bottomStatusBar'];
    if (!this.state.isOperational) {
      statusBarElement.innerText = `ANTENNA NOT OPERATIONAL`;
      statusBarElement.className = 'bottom-status-bar red';
      return;
    }

    if (this.state.isLoopback) {
      statusBarElement.innerText = `LOOPBACK ENABLED`;
      statusBarElement.className = 'bottom-status-bar blue';
      return;
    }

    if (this.state.isAutoTrackEnabled && !this.state.isLocked) {
      statusBarElement.innerText = `ACQUIRING LOCK...`;
      statusBarElement.className = 'bottom-status-bar amber';
      return;
    }

    if (this.state.isLocked && !this.state.isLoopback) {
      statusBarElement.innerText = `LOCKED ON SATELLITE ${this.state.noradId}`;
      statusBarElement.className = 'bottom-status-bar green';
      return;
    }

    statusBarElement.innerText = `DISCONNECTED`;
    statusBarElement.className = 'bottom-status-bar amber';
  }

  protected initialize_(): void {
    // Start in operational state_
    this.updateSignalStatus_();
    this.syncDomWithState_();
  }

  update(): void {
    this.updateSignalStatus_();
    this.syncDomWithState_();
  }

  sync(data: Partial<AntennaState>): void {
    this.state = { ...this.state, ...data };
    this.inputState = { ...this.state };
    this.updateSignalStatus_();
    this.syncDomWithState_();
  }

  get txSignalsIn(): RfSignal[] {
    return this.rfFrontEnd_.omtModule.txSignalsOut;
  }

  get txSignalsOut(): RfSignal[] {
    return this.rfFrontEnd_.omtModule.txSignalsOut.map((sig: RfSignal) => {
      // Adjust polarization based on antenna skew (H and V only for now)
      let adjustedPolarization = sig.polarization;
      // Our skew is limited to -90 to 90 degrees
      if (sig.polarization === 'H' || sig.polarization === 'V') {
        if (this.state.skew > 45 || this.state.skew < -45) {
          adjustedPolarization = 'V';
        } else {
          adjustedPolarization = 'H';
        }
      }

      // Our effective power is reduced by misalignment
      const skewAbs = Math.abs(this.state.skew);
      let powerReduction: number;
      if (skewAbs <= 15) {
        powerReduction = 0;
      } else if (skewAbs <= 30) {
        powerReduction = 3;
      } else if (skewAbs <= 45) {
        powerReduction = 6;
      } else if (skewAbs <= 60) {
        powerReduction = 12;
      }

      return {
        ...sig,
        polarization: adjustedPolarization,
        power: (sig.power - powerReduction - this.WAVEGUIDE_LOSS + this.antennaGain_dBi(sig.frequency)) as dBm,
      };
    });
  }

  /**
   * Private Methods
   */

  private handleSkewChange_(value: number): void {
    this.state.skew = value as Degrees;
    if (this.domCache['labelSkew']) {
      this.domCache['labelSkew'].textContent = `${value}°`;
    }
  }

  private handleInputChange_(e: Event): void {
    const target = e.target as HTMLInputElement | HTMLSelectElement;
    const param = target.dataset.param ?? null;
    if (!param) return;

    let value: any = target.value;

    // Parse based on parameter type
    if (param === 'noradId') {
      value = Number.parseInt(value);
    } else if (param === 'track') {
      value = (target as HTMLInputElement).checked;
    }

    this.inputState = { ...this.inputState, [param]: value };
  }

  private applyChanges_(): void {
    // Validate operational state_
    if (!this.state.isOperational) {
      this.emit(Events.ANTENNA_ERROR, { message: 'Antenna is not operational' });
      return;
    }

    if (this.inputState.noradId !== this.state.noradId) {
      // Reset lock and tracking on target change
      this.state.isLocked = false;
      this.state.isAutoTrackEnabled = false;
      this.emit(Events.ANTENNA_LOCKED, { locked: false });
    }

    // Update config with input data
    this.inputState.isAutoTrackEnabled = this.state.isAutoTrackEnabled;
    this.inputState.isLocked = this.state.isLocked;
    this.state = { ...this.state, ...this.inputState };

    // Emit configuration change event
    this.emit(Events.ANTENNA_CONFIG_CHANGED, this.state);

    this.updateSignalStatus_();
    this.syncDomWithState_();
  }

  private toggleLoopback_(isSwitchUp: boolean): void {
    if (!this.state.isOperational) {
      this.emit(Events.ANTENNA_ERROR, { message: 'Antenna is not operational' });
      return;
    }

    this.state.isLoopback = isSwitchUp;

    this.emit(Events.ANTENNA_LOOPBACK_CHANGED, {
      loopback: this.state.isLoopback
    });

    this.updateSignalStatus_();
    this.syncDomWithState_();
  }

  private togglePower_(): void {
    this.state.isPowered = !this.state.isPowered;

    // If turning off, also turn off track and locked
    if (!this.state.isPowered) {
      this.state.isLocked = false;
      this.state.isAutoTrackEnabled = false;
    }

    this.emit(Events.ANTENNA_POWER_CHANGED, {
      operational: this.state.isOperational
    });

    this.updateSignalStatus_();
    this.syncDomWithState_();
  }

  private handleTrackChange_(parentDom: HTMLElement): void {
    if (!this.state.isOperational) {
      this.state.rxSignalsIn = [];
      this.emit(Events.ANTENNA_ERROR, { message: 'Antenna is not operational' });
      // Reset the switch
      const trackSwitch = qs('.input-track', parentDom) as HTMLInputElement;
      if (trackSwitch) trackSwitch.checked = false;
      return;
    }

    const newTrackValue = !this.state.isAutoTrackEnabled;
    this.state.isAutoTrackEnabled = newTrackValue;

    // Simulate lock acquisition delay
    if (newTrackValue) {
      SoundManager.getInstance().play(Sfx.SMALL_MOTOR);
      setTimeout(() => {
        this.state.isLocked = true;
        this.updateSignalStatus_();
        this.syncDomWithState_();
        this.emit(Events.ANTENNA_LOCKED, { locked: true });
      }, 7000); // 7 second delay to acquire lock
    } else {
      this.state.isLocked = false;
      this.state.rxSignalsIn = [];
      this.emit(Events.ANTENNA_LOCKED, { locked: false });
    }

    this.emit(Events.ANTENNA_TRACK_CHANGED, {
      track: this.state.isAutoTrackEnabled
    });

    this.updateSignalStatus_();
    this.syncDomWithState_();
  }

  /**
   * Calculate Free-Space Path Loss (FSPL) in dB
   * FSPL = 20*log10(d) + 20*log10(f) + 20*log10(4π/c)
   * where d = distance (m), f = frequency (Hz), c = speed of light (m/s)
   *
   * Simplified: FSPL (dB) = 32.45 + 20*log10(d_km) + 20*log10(f_MHz)
   */
  private calculateFreeSpacePathLoss_(frequencyHz: number, distanceKm: number): number {
    const frequencyMhz = frequencyHz / 1e6;
    const fspl = 32.45 + 20 * Math.log10(distanceKm) + 20 * Math.log10(frequencyMhz);
    return fspl;
  }

  /**
   * Calculate atmospheric loss in dB
   * Accounts for atmospheric absorption, primarily from oxygen and water vapor
   * Frequency dependent - higher at higher frequencies
   * Elevation angle dependent - more atmosphere at low angles
   *
   * Simplified model for clear sky conditions
   */
  private calculateAtmosphericLoss_(frequencyHz: number, elevationAngleDeg: number = 45): number {
    const frequencyGhz = frequencyHz / 1e9;

    // Zenith attenuation (overhead path) varies by frequency
    let zenithAttenuation = 0;

    if (frequencyGhz < 1) {
      zenithAttenuation = 0.01; // Very low at low frequencies
    } else if (frequencyGhz < 10) {
      // L-band to X-band: minimal atmospheric loss
      zenithAttenuation = 0.02 + (frequencyGhz - 1) * 0.005;
    } else if (frequencyGhz < 20) {
      // Ku-band: moderate atmospheric loss
      zenithAttenuation = 0.1 + (frequencyGhz - 10) * 0.02;
    } else {
      // Ka-band and above: significant atmospheric loss
      zenithAttenuation = 0.3 + (frequencyGhz - 20) * 0.05;
    }

    // Elevation angle factor: lower elevation = more atmosphere
    // sec(θ) approximation for slant path through atmosphere
    const elevationRad = (elevationAngleDeg * Math.PI) / 180;
    const slantPathFactor = 1 / Math.sin(elevationRad);

    // Total atmospheric loss
    const atmosphericLoss = zenithAttenuation * Math.min(slantPathFactor, 3); // Cap at 3x for low angles

    return atmosphericLoss;
  }

  /**
   * Calculate polarization mismatch loss between transmit and receive polarizations
   */
  calculatePolarizationLoss_(txPolarization: string | null, rxPolarization: string | null, skewDeg: number): number {
    // If either polarization is null, assume matched (0 dB loss)
    if (!txPolarization || !rxPolarization) {
      return 0;
    }

    // Perfect match with no skew
    if (txPolarization === rxPolarization && skewDeg === 0) {
      return 0;
    }

    // Cross-polarization (H vs V, LHCP vs RHCP)
    const isCrossPolarized =
      (txPolarization === 'H' && rxPolarization === 'V') ||
      (txPolarization === 'V' && rxPolarization === 'H') ||
      (txPolarization === 'LHCP' && rxPolarization === 'RHCP') ||
      (txPolarization === 'RHCP' && rxPolarization === 'LHCP');

    if (isCrossPolarized) {
      return 20; // 20 dB loss for cross-polarization
    }

    // Polarization loss due to skew (linear polarizations only)
    if ((txPolarization === 'H' || txPolarization === 'V') &&
      (rxPolarization === 'H' || rxPolarization === 'V')) {
      const skewRad = (Math.abs(skewDeg) * Math.PI) / 180;
      const polarizationLoss = -20 * Math.log10(Math.cos(skewRad));
      return polarizationLoss;
    }

    return 0;
  }

  /**
   * Apply propagation effects to a received signal
   */
  private applyPropagationEffects_(signal: RfSignal): RfSignal {
    // Calculate free-space path loss (downlink from GEO satellite to ground)
    const fspl = this.calculateFreeSpacePathLoss_(signal.frequency, GEO_SATELLITE_DISTANCE_KM);

    // Calculate atmospheric loss (assume 45° elevation for GEO satellite)
    const atmosphericLoss = this.calculateAtmosphericLoss_(signal.frequency, 45);

    // Calculate polarization mismatch loss
    // For now, assume antenna has same polarization as signal (perfect match)
    const polarizationLoss = 0; // this.calculatePolarizationLoss_(signal.polarization, signal.polarization, this.state.skew);

    const Grx_dBi = this.antennaGain_dBi(signal.frequency); // implement or read from state

    // Assume perfect alignment for now
    const L_misc_dB = 0 // this.rxFeederAndPointingLoss_dB();      // e.g., 0.5–2 dB

    // Apply all losses to signal power
    let receivedPower = signal.power - fspl - atmosphericLoss - polarizationLoss - L_misc_dB + Grx_dBi;

    return {
      ...signal,
      power: receivedPower as dBm
    };
  }

  /**
   * Calculate antenna gain in dBi
   */
  private antennaGain_dBi(frequencyHz: Hertz): number {
    // Ground antenna gain (receive) (η≈0.6):
    // 1.2 m @ 12 GHz (Ku): ~41 dBi
    // 2.4 m @ 4 GHz (C): ~37–38 dBi
    // 0.6 m @ 20 GHz (Ka): ~41–42 dBi

    if (frequencyHz >= 18e9) {
      return 42; // Ka-band
    } else if (frequencyHz >= 12e9) {
      return 41; // Ku-band
    } else if (frequencyHz >= 4e9) {
      return 38; // C-band
    } else {
      return 35; // L-band and below
    }
  }

  /**
   * Check if signal is above the antenna's noise floor
   */
  private isSignalAboveNoiseFloor_(signalPower: number): boolean {
    return signalPower > this.state.noiseFloor;
  }

  /**
   * Calculate carrier-to-noise ratio for a signal
   */
  private calculateCarrierToNoise_(signal: RfSignal): number {
    // Noise power in bandwidth: N = kTB (in dBm)
    // k = Boltzmann constant = -228.6 dBW/K/Hz = -198.6 dBm/K/Hz
    // T = System temperature (assume 290K for now, ~17°C)
    // B = Bandwidth (Hz)

    const k_dBm_per_K_per_Hz = -198.6;
    const systemTemp_K = 290;
    const noisePower_dBm = k_dBm_per_K_per_Hz + 10 * Math.log10(systemTemp_K) + 10 * Math.log10(signal.bandwidth);

    const cn = signal.power - noisePower_dBm;
    return cn;
  }

  private updateSignalStatus_(): void {
    // Can't receive signals if Not locked or Not operational
    if (!this.state.isLocked || !this.state.isOperational) {
      this.state.rxSignalsIn = [];
      return;
    }

    SimulationManager.getInstance().clearUserSignals();

    // Check transmitters for signals being sent to this antenna
    for (const sig of this.txSignalsOut) {
      if (!this.state.isLoopback) {
        // Pass the signal to the SimulationManager
        SimulationManager.getInstance().addSignal(sig);
      }
    }

    // Get visible signals from the satellite and apply propagation effects
    let receivedSignals = SimulationManager.getInstance()
      .getVisibleSignals(this.state.serverId, this.state.noradId)
      .map(signal => this.applyPropagationEffects_(signal))
      .filter(signal => this.isSignalAboveNoiseFloor_(signal.power));

    // Apply interference and adjacency logic
    receivedSignals = receivedSignals.filter((signal) => {
      // Get the frequency bounds of this signal
      const halfBandwidth = signal.bandwidth * 0.5;
      const lowerBound = signal.frequency - halfBandwidth;
      const upperBound = signal.frequency + halfBandwidth;

      // Check for stronger interfering signals
      let isBlocked = false;

      for (const other of receivedSignals) {
        if (other.id === signal.id) continue;

        const otherHalfBandwidth = other.bandwidth * 0.5;
        const otherLowerBound = other.frequency - otherHalfBandwidth;
        const otherUpperBound = other.frequency + otherHalfBandwidth;

        // Calculate overlap
        const overlapLower = Math.max(lowerBound, otherLowerBound);
        const overlapUpper = Math.min(upperBound, otherUpperBound);
        const overlapBandwidth = Math.max(0, overlapUpper - overlapLower);
        const overlapPercent = (overlapBandwidth / signal.bandwidth) * 100;

        if (overlapPercent === 0) continue;

        // Calculate carrier-to-interference ratio
        const signalPowerLinear = Math.pow(10, signal.power / 10);
        const interferencePowerLinear = Math.pow(10, other.power / 10);
        const ci_ratio = 10 * Math.log10(signalPowerLinear / interferencePowerLinear);

        // If C/I is less than 10 dB and overlap is significant, signal is degraded or blocked
        if (ci_ratio < 10 && overlapPercent >= 50) {
          if (other.power > signal.power) {
            // Stronger signal blocks this one
            isBlocked = true;
            break;
          } else {
            // Similar strength causes degradation
            signal.isDegraded = true;
          }
        } else if (ci_ratio < 15 && overlapPercent >= 25) {
          // Partial overlap with marginal C/I causes degradation
          signal.isDegraded = true;
        }
      }

      return !isBlocked;
    });

    // Calculate C/N for each signal and mark as degraded if below threshold
    receivedSignals.forEach(signal => {
      const cn = this.calculateCarrierToNoise_(signal);

      // Typical C/N requirements:
      // BPSK: 6-8 dB
      // QPSK: 9-11 dB
      // 8QAM: 12-15 dB
      // 16QAM: 15-18 dB

      let requiredCN: number;

      switch (signal.modulation) {
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
        signal.isDegraded = true;
      }
    });

    this.state.rxSignalsIn = receivedSignals;
  }

  attachRfFrontEnd(rfFrontEnd: RFFrontEnd): void {
    this.rfFrontEnd_ = rfFrontEnd;
  }

  private syncDomWithState_(): void {
    if (JSON.stringify(this.state) === JSON.stringify(this.lastRenderState)) {
      return; // No changes, skip update
    }

    this.updateBottomStatusBar_();

    // Update status
    // this.domCache['status'].textContent = this.getStatusText();
    this.domCache['led'].className = `led ${this.getLedColor_()}`;

    this.powerSwitch_.sync(this.state.isPowered);
    this.loopbackSwitch_.sync(this.state.isLoopback);

    // Update inputs
    (this.domCache['inputTarget'] as HTMLSelectElement).value = this.inputState.noradId.toString();
    (this.domCache['inputTrack'] as HTMLInputElement).checked = this.state.isAutoTrackEnabled;

    // Update lock status
    this.domCache['lockStatus'].className = `lock-status ${this.state.isLocked ? 'locked' : 'unlocked'}`;
    this.domCache['lockStatus'].textContent = this.state.isLocked ? 'LOCKED' : this.state.isAutoTrackEnabled ? 'TRACKING' : 'UNLOCKED';

    // Update current value labels
    this.domCache['labelTarget'].textContent = `Satellite ${this.state.noradId}`;
    this.domCache['labelSkew'].textContent = `${this.state.skew}°`;

    this.domCache['antLoopbackLight'].className = `indicator-light ${this.state.isLoopback ? 'on' : 'off'}`;

    // Update skew knob
    this.skewKnob_.sync(this.state.skew);

    // Save last render state
    this.lastRenderState = structuredClone(this.state);
  }

  private getLedColor_(): string {
    if (!this.state.isPowered) return '';
    if (!this.state.isOperational) return 'led-amber';
    if (this.state.isLoopback) return 'led-amber';
    if (this.state.isLocked && !this.state.isLoopback && !this.rfFrontEnd_?.hpaModule.state.isHpaEnabled) return 'led-green';
    if (!this.state.isLoopback && this.rfFrontEnd_?.hpaModule.state.isHpaEnabled) return 'led-red';
    return 'led-amber';
  }
}