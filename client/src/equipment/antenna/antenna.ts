import { PowerSwitch } from "@app/components/power-switch/power-switch";
import { SecureToggleSwitch } from "@app/components/secure-toggle-switch/secure-toggle-switch";
import { SecureToggleSwitch2 } from "@app/components/secure-toggle-switch2/secure-toggle-switch2";
import { EventBus } from "@app/events/event-bus";
import { bandInformation, FrequencyBand } from "../../constants";
import { html } from "../../engine/utils/development/formatter";
import { qs } from "../../engine/utils/query-selector";
import { Events } from "../../events/events";
import { SimulationManager } from "../../simulation/simulation-manager";
import { RfFrequency, RfSignal } from "../../types";
import { BaseEquipment } from '../base-equipment';
import { Transmitter } from "../transmitter/transmitter";
import './antenna.css';

export interface AntennaState {
  isPowered: boolean;
  /** Which antenna is this */
  id: number;
  /** If there are multiple teams, which team is this antenna part of */
  teamId: number;
  /** Which server is this antenna connected to */
  serverId: number;
  /** Which satellite is this antenna targeting */
  targetId: number;
  /** Frequency band */
  freqBand: FrequencyBand;
  /** Frequency offset */
  offset: number; // MHz
  /** is the High Powered Amplifier (HPA) enabled */
  isHpaEnabled: boolean;
  /** is the HPA switch enabled */
  isHpaSwitchEnabled: boolean;
  /** is loopback enabled */
  isLoopbackEnabled: boolean;
  /** is antenna locked on a satellite */
  isLocked: boolean;
  /** is auto-tracking enabled */
  isAutoTrackEnabled: boolean;
  /** is antenna operational */
  isOperational: boolean;
  /** signals currently received */
  signals: RfSignal[];
}

/**
 * Antenna - Single antenna unit
 * Manages antenna state, loopback switch, and satellite tracking
 * Extends Equipment base class for standard lifecycle
 */
export class Antenna extends BaseEquipment {
  /** Current antenna state */
  state: AntennaState;
  /** Input state being edited in the UI before applying changes */
  private inputState: AntennaState;
  private lastRenderState: AntennaState;
  transmitters: Transmitter[] = [];
  powerSwitch: PowerSwitch;
  hpaSwitch: SecureToggleSwitch | SecureToggleSwitch2;

  constructor(parentId: string, unit: number, teamId: number = 1, serverId: number = 1) {
    super(parentId, unit, teamId);

    // Initialize status with defaults
    this.state = {
      id: this.id,
      teamId: this.teamId,
      serverId: serverId,
      targetId: 1,
      freqBand: FrequencyBand.C,
      offset: 0,
      isHpaEnabled: false,
      isHpaSwitchEnabled: false,
      isLoopbackEnabled: false,
      isLocked: false,
      isAutoTrackEnabled: false,
      isOperational: true,
      isPowered: true,
      signals: []
    };

    // Input state starts as a copy of current state
    this.inputState = structuredClone(this.state);
    const parentDom = this.initializeDom(parentId);
    this.lastRenderState = structuredClone(this.state);
    this.addListeners(parentDom);

    EventBus.getInstance().on(Events.UPDATE, this.update.bind(this));
    EventBus.getInstance().on(Events.SYNC, this.syncDomWithState.bind(this));
  }

  initializeDom(parentId: string): HTMLElement {
    const parentDom = super.initializeDom(parentId);

    const band = this.state.freqBand === FrequencyBand.C ? 'c' : 'ku';
    const bandInfo = bandInformation[band];

    this.hpaSwitch = SecureToggleSwitch.create(`antenna-hpa-switch-${this.state.id}`, this.state.isHpaSwitchEnabled);
    this.powerSwitch = PowerSwitch.create(`antenna-power-switch-${this.state.id}`, this.state.isPowered);

    parentDom.innerHTML = html`
      <div class="antenna-box">
        <div class="antenna-header">
          <div class="antenna-title">Antenna ${this.id}</div>
          <div class="antenna-status ${this.getStatusClass()}">
            ${this.getStatusText()}
          </div>
        </div>

        <div class="antenna-controls">
          <!-- Loopback Switch Section -->
          <div class="loopback-section">
            <div class="loopback-switch">
              <div class="loopback-label">Loopback</div>
              <button
                class="btn-loopback ${this.state.isLoopbackEnabled ? 'active' : ''}"
                data-action="loopback">
                <img
                  src="/assets/baseball_switch_${this.state.isLoopbackEnabled ? '2' : '1'}.png"
                  alt="Loopback Switch"
                  class="switch-image"
                />
              </button>
              <div class="loopback-label">Antenna</div>
            </div>

             ${this.hpaSwitch.html}
          </div>

          <!-- Antenna Configuration -->
          <div class="antenna-config">
            <div class="config-row">
              <label>Satellite</label>
              <select class="input-target" data-param="targetId">
                <option value="1" ${this.inputState.targetId === 1 ? 'selected' : ''}>ARKE 3G</option>
                <option value="2" ${this.inputState.targetId === 2 ? 'selected' : ''}>AURORA 2B</option>
                <option value="3" ${this.inputState.targetId === 3 ? 'selected' : ''}>AUXO STAR</option>
                <option value="4" ${this.inputState.targetId === 4 ? 'selected' : ''}>ENYO</option>
              </select>
              <span id="labelTarget" class="current-value">${this.state.targetId}</span>
            </div>

            <div class="config-row">
              <label>Band</label>
              <select class="input-band" data-param="freqBand">
                <option value="0" ${this.inputState.freqBand === 0 ? 'selected' : ''}>C Band</option>
                <option value="1" ${this.inputState.freqBand === 1 ? 'selected' : ''}>Ku Band</option>
              </select>
              <span id="labelBand" class="current-value">${bandInfo.name}</span>
            </div>

            <div class="config-row">
              <label>Offset</label>
              <input
                type="text"
                class="input-offset"
                data-param="offset"
                value="${this.inputState.offset ?? this.state.offset}"
                placeholder="0"
              />
              <span id="labelOffset" class="current-value">${this.state.offset} MHz</span>
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
              ${this.powerSwitch.html}
            </div>
          </div>
        </div>
      </div>
    `;

    this.domCache['parent'] = parentDom;
    this.domCache['status'] = qs('.antenna-status', parentDom);
    this.domCache['btnLoopback'] = qs('.btn-loopback', parentDom);
    this.domCache['inputTarget'] = qs('.input-target', parentDom);
    this.domCache['inputBand'] = qs('.input-band', parentDom);
    this.domCache['inputOffset'] = qs('.input-offset', parentDom);
    this.domCache['inputTrack'] = qs('.input-track', parentDom);
    this.domCache['lockStatus'] = qs('.lock-status', parentDom);
    this.domCache['btnApply'] = qs('.btn-apply', parentDom);
    this.domCache['labelTarget'] = qs('#labelTarget', parentDom);
    this.domCache['labelOffset'] = qs('#labelOffset', parentDom);
    this.domCache['labelBand'] = qs('#labelBand', parentDom);
    this.domCache['labelLockStatus'] = qs('#labelLockStatus', parentDom);

    return parentDom;
  }

  protected addListeners(parentDom: HTMLElement): void {
    // Loopback switch
    const btnLoopback = qs('.btn-loopback', parentDom);
    btnLoopback?.addEventListener('click', () => this.toggleLoopback());

    // HPA switch
    this.hpaSwitch.addEventListeners(this.toggleHpa.bind(this));

    // Input changes
    const inputs = parentDom.querySelectorAll('input, select');
    inputs.forEach(input => {
      input.addEventListener('change', (e) => this.handleInputChange(e));
    });

    // Apply button
    const btnApply = qs('.btn-apply', parentDom);
    btnApply?.addEventListener('click', () => this.applyChanges());

    // Power switch
    this.powerSwitch.addEventListeners(this.togglePower.bind(this));

    // Track switch special handling
    const trackSwitch = qs('.input-track', parentDom) as HTMLInputElement;
    trackSwitch?.addEventListener('change', () => this.handleTrackChange(parentDom));

    this.on(Events.ANTENNA_LOCKED, () => (data: { locked: boolean; antennaId: number }) => {
      if (data.antennaId === this.id) {
        this.state.isLocked = data.locked;
        this.updateSignalStatus();
        this.syncDomWithState();
      }
    });
  }

  protected initialize(): void {
    // Start in operational state_
    this.updateSignalStatus();
    this.syncDomWithState();
  }

  public update(): void {
    this.updateSignalStatus();
    this.syncDomWithState();
  }

  public sync(data: Partial<AntennaState>): void {
    this.state = { ...this.state, ...data };
    this.inputState = { ...this.state };
    this.updateSignalStatus();
    this.syncDomWithState();
  }

  /**
   * Private Methods
   */

  private handleInputChange(e: Event): void {
    const target = e.target as HTMLInputElement | HTMLSelectElement;
    const param = target.dataset.param ?? null;
    if (!param) return;

    let value: any = target.value;

    // Parse based on parameter type
    if (param === 'offset') {
      // Allow negative numbers
      if (value.match(/[^0-9-]/g)) return;
      value = Number.parseInt(value) || 0;
    } else if (param === 'targetId' || param === 'freqBand') {
      value = Number.parseInt(value);
    } else if (param === 'track') {
      value = (target as HTMLInputElement).checked;
    }

    this.inputState = { ...this.inputState, [param]: value };
  }

  private applyChanges(): void {
    // Validate operational state_
    if (!this.state.isOperational) {
      this.emit(Events.ANTENNA_ERROR, { message: 'Antenna is not operational' });
      return;
    }

    if (this.inputState.targetId !== this.state.targetId) {
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

    this.updateSignalStatus();
    this.syncDomWithState();
  }

  private toggleLoopback(): void {
    if (!this.state.isOperational) {
      this.emit(Events.ANTENNA_ERROR, { message: 'Antenna is not operational' });
      return;
    }

    this.state.isLoopbackEnabled = !this.state.isLoopbackEnabled;

    // If switching to antenna mode, disable HPA if it was on
    if (!this.state.isLoopbackEnabled && this.state.isHpaSwitchEnabled) {
      // Keep HPA on when going to antenna mode
    }

    this.emit(Events.ANTENNA_LOOPBACK_CHANGED, {
      loopback: this.state.isLoopbackEnabled
    });

    this.updateSignalStatus();
    this.syncDomWithState();
  }

  private toggleHpa(): void {
    if (!this.state.isOperational) {
      this.emit(Events.ANTENNA_ERROR, { message: 'Antenna is not operational' });
      return;
    }

    // Can only enable HPA when not in loopback mode
    if (this.state.isLoopbackEnabled && !this.state.isHpaSwitchEnabled) {
      this.emit(Events.ANTENNA_ERROR, { message: 'Cannot enable HPA in loopback mode' });
      return;
    }

    this.state.isHpaSwitchEnabled = !this.state.isHpaSwitchEnabled;

    if (this.state.isPowered) {
      this.state.isHpaEnabled = this.state.isHpaSwitchEnabled;
    }

    this.emit(Events.ANTENNA_CONFIG_CHANGED, this.state);

    this.updateSignalStatus();
    this.syncDomWithState();
  }

  private togglePower(): void {
    this.state.isOperational = !this.state.isOperational;

    // If turning off, also turn off track and locked
    if (!this.state.isOperational) {
      this.state.isLocked = false;
      this.state.isAutoTrackEnabled = false;
    }

    this.emit(Events.ANTENNA_POWER_CHANGED, {
      operational: this.state.isOperational
    });

    this.updateSignalStatus();
    this.syncDomWithState();
  }

  private handleTrackChange(parentDom: HTMLElement): void {
    if (!this.state.isOperational) {
      this.state.signals = [];
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
      setTimeout(() => {
        this.state.isLocked = true;
        this.updateSignalStatus();
        this.syncDomWithState();
        this.emit(Events.ANTENNA_LOCKED, { locked: true });
      }, 3000); // 3 second delay to acquire lock
    } else {
      this.state.isLocked = false;
      this.state.signals = [];
      this.emit(Events.ANTENNA_LOCKED, { locked: false });
    }

    this.emit(Events.ANTENNA_TRACK_CHANGED, {
      track: this.state.isAutoTrackEnabled
    });

    this.updateSignalStatus();
    this.syncDomWithState();
  }

  private updateSignalStatus(): void {
    // Can't receive signals if Not locked or Not operational
    if (!this.state.isLocked || !this.state.isOperational) {
      this.state.signals = [];
      return;
    }

    for (const tx of this.transmitters) {
      for (const modem of tx.state.modems) {
        if (modem.antenna_id === this.state.id) {
          const rfSignal = {
            id: `tx${tx.state.unit}-modem${modem.modem_number}`,
            serverId: this.state.serverId,
            targetId: this.state.targetId,
            frequency: modem.ifSignal.frequency,
            bandwidth: modem.ifSignal.bandwidth,
            power: modem.ifSignal.power,
            modulation: modem.ifSignal.modulation,
            fec: modem.ifSignal.fec,
            feed: modem.ifSignal.feed,
            isDegraded: modem.ifSignal.isDegraded,
          }
          if (modem.isTransmitting && !modem.isFaulted && !this.state.isLoopbackEnabled && this.state.isHpaEnabled) {
            // Pass the signal to the SimulationManager
            SimulationManager.getInstance().addSignal(rfSignal);
          } else {
            // Remove any old version of this signal
            SimulationManager.getInstance().removeSignal(rfSignal);
          }
        }
      }
    }

    // Update signal active status based on antenna config
    this.state.signals = SimulationManager.getInstance().getVisibleSignals(
      this.state.serverId,
      this.state.targetId
    ).filter((signal) => {
      // Get the frequency bounds of this signal
      const halfBandwidth = signal.bandwidth * 0.5;
      const lowerBound = signal.frequency - halfBandwidth;
      const upperBound = signal.frequency + halfBandwidth;

      // Find any other signal with higher strength
      const stronger = this.state.signals.some(
        (other) => {
          if (other.id === signal.id) return false;

          const otherHalfBandwidth = other.bandwidth * 0.5;
          const otherLowerBound = other.frequency - otherHalfBandwidth;
          const otherUpperBound = other.frequency + otherHalfBandwidth;

          // Calculate how much of the main signal's bandwidth overlaps with the other signal
          const overlapLower = Math.max(lowerBound, otherLowerBound);
          const overlapUpper = Math.min(upperBound, otherUpperBound);
          const overlapBandwidth = Math.max(0, overlapUpper - overlapLower);
          const overlapPercent = (overlapBandwidth / signal.bandwidth) * 100;

          if (overlapPercent === 0) {
            return false;
          }

          if (other.power >= signal.power && overlapPercent >= 50) {
            // Stronger signal present with significant overlap
            return true;
          }

          if (other.power >= signal.power && overlapPercent < 50) {
            signal.isDegraded = true;
            return false;
          }

          return false;
        });
      return !stronger;
    });
  }

  getDownlinkFrequency(): RfFrequency {
    const band = this.state.freqBand === FrequencyBand.C ? 'c' : 'ku';
    const bandInfo = bandInformation[band];
    const downlinkFreq = bandInfo.downconvert + (this.state.offset * 1e6); // MHz to Hz
    return downlinkFreq as RfFrequency;
  }

  syncDomWithState(): void {
    if (JSON.stringify(this.state) === JSON.stringify(this.lastRenderState)) {
      return; // No changes, skip update
    }

    // Update status
    this.domCache['status'].className = `antenna-status ${this.getStatusClass()}`;
    this.domCache['status'].textContent = this.getStatusText();

    // Update buttons
    this.domCache['btnLoopback'].className = `btn-loopback ${this.state.isLoopbackEnabled ? 'active' : ''}`;

    this.hpaSwitch.sync(this.state.isHpaSwitchEnabled);
    this.powerSwitch.sync(this.state.isPowered);

    // Update inputs
    (this.domCache['inputTarget'] as HTMLSelectElement).value = this.inputState.targetId.toString();
    (this.domCache['inputBand'] as HTMLSelectElement).value = this.inputState.freqBand.toString();
    (this.domCache['inputOffset'] as HTMLInputElement).value = this.inputState.offset.toString();
    (this.domCache['inputTrack'] as HTMLInputElement).checked = this.state.isAutoTrackEnabled;

    // Update lock status
    this.domCache['lockStatus'].className = `lock-status ${this.state.isLocked ? 'locked' : 'unlocked'}`;
    this.domCache['lockStatus'].textContent = this.state.isLocked ? 'LOCKED' : this.state.isAutoTrackEnabled ? 'TRACKING' : 'UNLOCKED';

    // Update current value labels
    this.domCache['labelTarget'].textContent = `Satellite ${this.state.targetId}`;
    const band = this.state.freqBand === FrequencyBand.C ? 'c' : 'ku';
    const bandInfo = bandInformation[band];
    this.domCache['labelBand'].textContent = bandInfo.name;
    this.domCache['labelOffset'].textContent = `${this.state.offset} MHz`;

    // Save last render state
    this.lastRenderState = structuredClone(this.state);
  }

  private getStatusClass(): string {
    if (!this.state.isOperational) return 'status-disabled';
    if (this.state.isLoopbackEnabled || (!this.state.isLoopbackEnabled && this.state.isHpaEnabled)) {
      return 'status-active';
    }
    return 'status-error';
  }

  private getStatusText(): string {
    if (!this.state.isOperational) return 'Not Operational';
    if (this.state.isLoopbackEnabled) return 'Loopback';
    if (!this.state.isLoopbackEnabled && this.state.isHpaEnabled) return 'Transmitting';
    return 'Rx Only';
  }
}