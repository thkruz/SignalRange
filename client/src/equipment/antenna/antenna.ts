import { bandInformation, defaultSignalData, FrequencyBand } from "../../constants";
import { Events } from "../../events/events";
import { RfFrequency, RfSignal } from "../../types";
import { html, qs } from '../../utils';
import { Equipment } from '../equipment';
import './antenna.css';

export interface AntennaState {
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
export class Antenna extends Equipment {
  /** Current antenna state */
  protected state_: AntennaState;
  get state(): AntennaState {
    return this.state_;
  }
  /** Input state being edited in the UI before applying changes */
  private inputState: AntennaState;
  private lastRenderState: AntennaState;

  constructor(parentId: string, unit: number, teamId: number = 1, serverId: number = 1) {
    super(parentId, unit, teamId);

    // Initialize status with defaults
    this.state_ = {
      id: this.unit,
      teamId: this.teamId,
      serverId: serverId,
      targetId: 1,
      freqBand: FrequencyBand.C,
      offset: 0,
      isHpaEnabled: false,
      isLoopbackEnabled: false,
      isLocked: false,
      isAutoTrackEnabled: false,
      isOperational: true,
      signals: []
    };

    // Input state starts as a copy of current state
    this.inputState = structuredClone(this.state_);
    const parentDom = this.initializeDom(parentId);
    this.lastRenderState = structuredClone(this.state_);
    this.addListeners(parentDom);
  }

  initializeDom(parentId: string): HTMLElement {
    const parentDom = super.initializeDom(parentId);

    const band = this.state.freqBand === FrequencyBand.C ? 'c' : 'ku';
    const bandInfo = bandInformation[band];

    parentDom.innerHTML = html`
      <div class="antenna-box">
        <div class="antenna-header">
          <div class="antenna-title">Antenna ${this.unit}</div>
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

            <button
              class="btn-hpa ${this.state.isHpaEnabled ? 'active' : ''}"
              data-action="hpa">
              HPA
            </button>
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
              <button
                class="btn-power ${this.state.isOperational ? 'active' : ''}"
                data-action="power">
                Power
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    this.domCache['parent'] = parentDom;
    this.domCache['status'] = qs('.antenna-status', parentDom) as HTMLElement;
    this.domCache['btnLoopback'] = qs('.btn-loopback', parentDom) as HTMLElement;
    this.domCache['btnHpa'] = qs('.btn-hpa', parentDom) as HTMLElement;
    this.domCache['inputTarget'] = qs('.input-target', parentDom) as HTMLSelectElement;
    this.domCache['inputBand'] = qs('.input-band', parentDom) as HTMLSelectElement;
    this.domCache['inputOffset'] = qs('.input-offset', parentDom) as HTMLInputElement;
    this.domCache['inputTrack'] = qs('.input-track', parentDom) as HTMLInputElement;
    this.domCache['lockStatus'] = qs('.lock-status', parentDom) as HTMLElement;
    this.domCache['btnPower'] = qs('.btn-power', parentDom) as HTMLElement;
    this.domCache['btnApply'] = qs('.btn-apply', parentDom) as HTMLElement;
    this.domCache['labelTarget'] = qs('#labelTarget', parentDom) as HTMLElement;
    this.domCache['labelOffset'] = qs('#labelOffset', parentDom) as HTMLElement;
    this.domCache['labelBand'] = qs('#labelBand', parentDom) as HTMLElement;
    this.domCache['labelLockStatus'] = qs('#labelLockStatus', parentDom) as HTMLElement;

    return parentDom;
  }

  protected addListeners(parentDom: HTMLElement): void {
    // Loopback switch
    const btnLoopback = qs('.btn-loopback', parentDom);
    btnLoopback?.addEventListener('click', () => this.toggleLoopback());

    // HPA button
    const btnHpa = qs('.btn-hpa', parentDom);
    btnHpa?.addEventListener('click', () => this.toggleHpa());

    // Input changes
    const inputs = parentDom.querySelectorAll('input, select');
    inputs.forEach(input => {
      input.addEventListener('change', (e) => this.handleInputChange(e));
    });

    // Apply button
    const btnApply = qs('.btn-apply', parentDom);
    btnApply?.addEventListener('click', () => this.applyChanges());

    // Power button
    const btnPower = qs('.btn-power', parentDom);
    btnPower?.addEventListener('click', () => this.togglePower());

    // Track switch special handling
    const trackSwitch = qs('.input-track', parentDom) as HTMLInputElement;
    trackSwitch?.addEventListener('change', () => this.handleTrackChange(parentDom));

    this.on(Events.ANTENNA_LOCKED, () => (data: { locked: boolean; antennaId: number }) => {
      if (data.antennaId === this.unit) {
        this.state_.isLocked = data.locked;
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
    this.state_ = { ...this.state_, ...data };
    this.inputState = { ...this.state_ };
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
    if (!this.state_.isOperational) {
      this.emit(Events.ANTENNA_ERROR, { message: 'Antenna is not operational' });
      return;
    }

    if (this.inputState.targetId !== this.state_.targetId) {
      // Reset lock and tracking on target change
      this.state_.isLocked = false;
      this.state_.isAutoTrackEnabled = false;
      this.emit(Events.ANTENNA_LOCKED, { locked: false });
    }

    // Update config with input data
    this.inputState.isAutoTrackEnabled = this.state.isAutoTrackEnabled;
    this.inputState.isLocked = this.state.isLocked;
    this.state_ = { ...this.state_, ...this.inputState };

    // Emit configuration change event
    this.emit(Events.ANTENNA_CONFIG_CHANGED, this.state_);

    this.updateSignalStatus();
    this.syncDomWithState();
  }

  private toggleLoopback(): void {
    if (!this.state_.isOperational) {
      this.emit(Events.ANTENNA_ERROR, { message: 'Antenna is not operational' });
      return;
    }

    this.state_.isLoopbackEnabled = !this.state_.isLoopbackEnabled;

    // If switching to antenna mode, disable HPA if it was on
    if (!this.state_.isLoopbackEnabled && this.state_.isHpaEnabled) {
      // Keep HPA on when going to antenna mode
    }

    this.emit(Events.ANTENNA_LOOPBACK_CHANGED, {
      loopback: this.state_.isLoopbackEnabled
    });

    this.updateSignalStatus();
    this.syncDomWithState();
  }

  private toggleHpa(): void {
    if (!this.state_.isOperational) {
      this.emit(Events.ANTENNA_ERROR, { message: 'Antenna is not operational' });
      return;
    }

    // Can only enable HPA when not in loopback mode
    if (this.state_.isLoopbackEnabled && !this.state_.isHpaEnabled) {
      this.emit(Events.ANTENNA_ERROR, { message: 'Cannot enable HPA in loopback mode' });
      return;
    }

    this.state_.isHpaEnabled = !this.state_.isHpaEnabled;

    this.emit(Events.ANTENNA_HPA_CHANGED, {
      hpa: this.state_.isHpaEnabled
    });

    this.updateSignalStatus();
    this.syncDomWithState();
  }

  private togglePower(): void {
    this.state_.isOperational = !this.state_.isOperational;

    // If turning off, also turn off track and locked
    if (!this.state_.isOperational) {
      this.state_.isLocked = false;
      this.state_.isAutoTrackEnabled = false;
    }

    this.emit(Events.ANTENNA_POWER_CHANGED, {
      operational: this.state_.isOperational
    });

    this.updateSignalStatus();
    this.syncDomWithState();
  }

  private handleTrackChange(parentDom: HTMLElement): void {
    if (!this.state_.isOperational) {
      this.state_.signals = [];
      this.emit(Events.ANTENNA_ERROR, { message: 'Antenna is not operational' });
      // Reset the switch
      const trackSwitch = qs('.input-track', parentDom) as HTMLInputElement;
      if (trackSwitch) trackSwitch.checked = false;
      return;
    }

    const newTrackValue = !this.state_.isAutoTrackEnabled;
    this.state_.isAutoTrackEnabled = newTrackValue;

    // Simulate lock acquisition delay
    if (newTrackValue) {
      setTimeout(() => {
        this.state_.isLocked = true;
        this.updateSignalStatus();
        this.syncDomWithState();
        this.emit(Events.ANTENNA_LOCKED, { locked: true });
      }, 3000); // 3 second delay to acquire lock
    } else {
      this.state_.isLocked = false;
      this.state_.signals = [];
      this.emit(Events.ANTENNA_LOCKED, { locked: false });
    }

    this.emit(Events.ANTENNA_TRACK_CHANGED, {
      track: this.state_.isAutoTrackEnabled
    });

    this.updateSignalStatus();
    this.syncDomWithState();
  }

  private updateSignalStatus(): void {
    // Update signal active status based on antenna config
    this.state_.signals = defaultSignalData.filter((signal) => {
      // Can't receive signals if not locked
      if (!this.state_.isLocked) {
        return false;
      }

      // Make signals intermittent
      // if (Math.random() < 0.8) {
      //   return false;
      // }

      const downlinkFrequency = this.getDownlinkFrequency();
      const isCurrentServer = signal.serverId === this.state_.serverId;
      const isCurrentSatellite = signal.targetId === this.state_.targetId;
      const minAllowedFreq = downlinkFrequency - signal.bandwidth / 2;
      const maxAllowedFreq = downlinkFrequency + signal.bandwidth / 2;
      const isAboveMinFreq = signal.frequency >= minAllowedFreq;
      const isBelowMaxFreq = signal.frequency <= maxAllowedFreq;

      return isCurrentServer && isCurrentSatellite && isAboveMinFreq && isBelowMaxFreq;
    });
  }

  getDownlinkFrequency(): RfFrequency {
    const band = this.state_.freqBand === 0 ? 'c' : 'ku';
    const bandInfo = bandInformation[band];
    const downlinkFreq = bandInfo.downconvert + (this.state_.offset * 1e6); // MHz to Hz
    return downlinkFreq as RfFrequency;
  }

  private syncDomWithState(): void {
    if (JSON.stringify(this.state) === JSON.stringify(this.lastRenderState)) {
      return; // No changes, skip update
    }

    // Update status
    this.domCache['status'].className = `antenna-status ${this.getStatusClass()}`;
    this.domCache['status'].textContent = this.getStatusText();

    // Update buttons
    this.domCache['btnLoopback'].className = `btn-loopback ${this.state.isLoopbackEnabled ? 'active' : ''}`;
    this.domCache['btnHpa'].className = `btn-hpa ${this.state.isHpaEnabled ? 'active' : ''}`;
    this.domCache['btnPower'].className = `btn-power ${this.state.isOperational ? 'active' : ''}`;

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
    this.lastRenderState = structuredClone(this.state_);
  }

  private getStatusClass(): string {
    if (!this.state_.isOperational) return 'status-disabled';
    if (this.state_.isLoopbackEnabled || (!this.state_.isLoopbackEnabled && this.state_.isHpaEnabled)) {
      return 'status-active';
    }
    return 'status-error';
  }

  private getStatusText(): string {
    if (!this.state_.isOperational) return 'Not Operational';
    if (this.state_.isLoopbackEnabled) return 'Loopback';
    if (!this.state_.isLoopbackEnabled && this.state_.isHpaEnabled) return 'Transmitting';
    return 'Rx Only';
  }
}