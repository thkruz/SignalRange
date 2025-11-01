import { defaultSignalData } from "../../constants";
import { Events } from "../../events/events";
import { RfFrequency, RfSignal } from "../../types";
import { html, qs } from '../../utils';
import { Equipment } from '../equipment';
import './antenna.css';

export interface AntennaConfig {
  /** Which antenna is this */
  id: number;
  /** If there are multiple teams, which team is this antenna part of */
  teamId: number;
  /** Which server is this antenna connected to */
  serverId: number;
  /** Which satellite is this antenna targeting */
  targetId: number;
  /** Frequency band */
  freqBand: number; // 0 = C, 1 = Ku
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
}

// Antenna Event specific interfaces
export interface AntennaLoopbackChangedData {
  loopback: boolean;
}

export interface AntennaHpaChangedData {
  hpa: boolean;
}

export interface AntennaTrackChangedData {
  track: boolean;
}

export interface AntennaLockedData {
  locked: boolean;
}

export interface AntennaPowerChangedData {
  operational: boolean;
}

export interface AntennaErrorData {
  message: string;
}

/**
 * Antenna - Single antenna unit
 * Manages antenna state, loopback switch, and satellite tracking
 * Extends Equipment base class for standard lifecycle
 */
export class Antenna extends Equipment {
  /** Current antenna configuration */
  config: AntennaConfig;
  /** Input data being edited in the UI before applying changes */
  private inputData: Partial<AntennaConfig> = {};
  /** Currently received signals based on antenna config */
  signals: RfSignal[] = [];

  // Band information
  private readonly bands = {
    c: { name: 'C Band', upconvert: 3350e6, downconvert: 3500e6 },
    ku: { name: 'Ku Band', upconvert: 12750e6, downconvert: 10950e6 }
  };

  constructor(parentId: string, unit: number, teamId: number = 1, serverId: number = 1) {
    super(parentId, unit, teamId);

    // Initialize status with defaults
    this.config = {
      id: this.unit,
      teamId: this.teamId,
      serverId: serverId,
      targetId: 1,
      freqBand: 0, // C Band
      offset: 0,
      isHpaEnabled: false,
      isLoopbackEnabled: false,
      isLocked: false,
      isAutoTrackEnabled: false,
      isOperational: true
    };

    this.inputData = { ...this.config };
    this.build();
  }

  render(): HTMLElement {
    const band = this.config.freqBand === 0 ? 'c' : 'ku';
    const bandInfo = this.bands[band];

    this.element.innerHTML = html`
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
                class="btn-loopback ${this.config.isLoopbackEnabled ? 'active' : ''}"
                data-action="loopback">
                <img
                  src="/assets/baseball_switch_${this.config.isLoopbackEnabled ? '2' : '1'}.png"
                  alt="Loopback Switch"
                  class="switch-image"
                />
              </button>
              <div class="loopback-label">Antenna</div>
            </div>

            <button
              class="btn-hpa ${this.config.isHpaEnabled ? 'active' : ''}"
              data-action="hpa">
              HPA
            </button>
          </div>

          <!-- Antenna Configuration -->
          <div class="antenna-config">
            <div class="config-row">
              <label>Satellite</label>
              <select class="input-target" data-param="target_id">
                <option value="1" ${this.inputData.targetId === 1 ? 'selected' : ''}>ARKE 3G</option>
                <option value="2" ${this.inputData.targetId === 2 ? 'selected' : ''}>AURORA 2B</option>
                <option value="3" ${this.inputData.targetId === 3 ? 'selected' : ''}>AUXO STAR</option>
                <option value="4" ${this.inputData.targetId === 4 ? 'selected' : ''}>ENYO</option>
              </select>
              <span class="current-value">${this.config.targetId}</span>
            </div>

            <div class="config-row">
              <label>Band</label>
              <select class="input-band" data-param="freqBand">
                <option value="0" ${this.inputData.freqBand === 0 ? 'selected' : ''}>C Band</option>
                <option value="1" ${this.inputData.freqBand === 1 ? 'selected' : ''}>Ku Band</option>
              </select>
              <span class="current-value">${bandInfo.name}</span>
            </div>

            <div class="config-row">
              <label>Offset</label>
              <input
                type="text"
                class="input-offset"
                data-param="offset"
                value="${this.inputData.offset ?? this.config.offset}"
                placeholder="0"
              />
              <span class="current-value">${this.config.offset} MHz</span>
            </div>

            <div class="config-row">
              <label>Auto-Track</label>
              <div class="switch-container">
                <label class="switch">
                  <input
                    type="checkbox"
                    class="input-track"
                    data-param="track"
                    ${this.config.isAutoTrackEnabled ? 'checked' : ''}
                  />
                  <span class="slider"></span>
                </label>
              </div>
              <span class="lock-status ${this.config.isLocked ? 'locked' : 'unlocked'}">
                ${this.config.isLocked ? 'LOCKED' : this.config.isAutoTrackEnabled ? 'TRACKING' : 'UNLOCKED'}
              </span>
            </div>

            <div class="config-actions">
              <button class="btn-apply" data-action="apply">Apply</button>
              <button
                class="btn-power ${this.config.isOperational ? 'active' : ''}"
                data-action="power">
                Power
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    return this.element;
  }

  protected addListeners(): void {
    // Loopback switch
    const btnLoopback = qs('.btn-loopback', this.element);
    btnLoopback?.addEventListener('click', () => this.toggleLoopback());

    // HPA button
    const btnHpa = qs('.btn-hpa', this.element);
    btnHpa?.addEventListener('click', () => this.toggleHpa());

    // Input changes
    const inputs = this.element.querySelectorAll('input, select');
    inputs.forEach(input => {
      input.addEventListener('change', (e) => this.handleInputChange(e));
    });

    // Apply button
    const btnApply = qs('.btn-apply', this.element);
    btnApply?.addEventListener('click', () => this.applyChanges());

    // Power button
    const btnPower = qs('.btn-power', this.element);
    btnPower?.addEventListener('click', () => this.togglePower());

    // Track switch special handling
    const trackSwitch = qs('.input-track', this.element) as HTMLInputElement;
    trackSwitch?.addEventListener('change', () => this.handleTrackChange());

    this.on(Events.ANTENNA_LOCKED, () => (data: { locked: boolean; antennaId: number }) => {
      if (data.antennaId === this.unit) {
        this.config.isLocked = data.locked;
        this.updateSignalStatus();
        this.updateDisplay();
      }
    });
  }

  protected initialize(): void {
    // Start in operational state
    this.updateSignalStatus();
    this.updateDisplay();
  }

  public update(): void {
    this.updateSignalStatus();
    this.updateDisplay();
  }

  public sync(data: Partial<AntennaConfig>): void {
    this.config = { ...this.config, ...data };
    this.inputData = { ...this.config };
    this.updateSignalStatus();
    this.updateDisplay();
  }

  public getConfig(): AntennaConfig {
    return { ...this.config };
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
    } else if (param === 'target_id' || param === 'freqBand') {
      value = Number.parseInt(value);
    } else if (param === 'track') {
      value = (target as HTMLInputElement).checked;
    }

    this.inputData[param as keyof AntennaConfig] = value;
  }

  private applyChanges(): void {
    // Validate operational state
    if (!this.config.isOperational) {
      this.emit(Events.ANTENNA_ERROR, { message: 'Antenna is not operational' });
      return;
    }

    // Update config with input data
    this.config = { ...this.config, ...this.inputData };

    // Emit configuration change event
    this.emit(Events.ANTENNA_CONFIG_CHANGED, this.config);

    this.updateSignalStatus();
    this.updateDisplay();
  }

  private toggleLoopback(): void {
    if (!this.config.isOperational) {
      this.emit(Events.ANTENNA_ERROR, { message: 'Antenna is not operational' });
      return;
    }

    this.config.isLoopbackEnabled = !this.config.isLoopbackEnabled;

    // If switching to antenna mode, disable HPA if it was on
    if (!this.config.isLoopbackEnabled && this.config.isHpaEnabled) {
      // Keep HPA on when going to antenna mode
    }

    this.emit(Events.ANTENNA_LOOPBACK_CHANGED, {
      loopback: this.config.isLoopbackEnabled
    });

    this.updateSignalStatus();
    this.updateDisplay();
  }

  private toggleHpa(): void {
    if (!this.config.isOperational) {
      this.emit(Events.ANTENNA_ERROR, { message: 'Antenna is not operational' });
      return;
    }

    // Can only enable HPA when not in loopback mode
    if (this.config.isLoopbackEnabled && !this.config.isHpaEnabled) {
      this.emit(Events.ANTENNA_ERROR, { message: 'Cannot enable HPA in loopback mode' });
      return;
    }

    this.config.isHpaEnabled = !this.config.isHpaEnabled;

    this.emit(Events.ANTENNA_HPA_CHANGED, {
      hpa: this.config.isHpaEnabled
    });

    this.updateSignalStatus();
    this.updateDisplay();
  }

  private togglePower(): void {
    this.config.isOperational = !this.config.isOperational;

    // If turning off, also turn off track and locked
    if (!this.config.isOperational) {
      this.config.isLocked = false;
      this.config.isAutoTrackEnabled = false;
    }

    this.emit(Events.ANTENNA_POWER_CHANGED, {
      operational: this.config.isOperational
    });

    this.updateSignalStatus();
    this.updateDisplay();
  }

  private handleTrackChange(): void {
    if (!this.config.isOperational) {
      this.signals = [];
      this.emit(Events.ANTENNA_ERROR, { message: 'Antenna is not operational' });
      // Reset the switch
      const trackSwitch = qs('.input-track', this.element) as HTMLInputElement;
      if (trackSwitch) trackSwitch.checked = false;
      return;
    }

    const newTrackValue = !this.config.isAutoTrackEnabled;
    this.config.isAutoTrackEnabled = newTrackValue;

    // Simulate lock acquisition delay
    if (newTrackValue) {
      setTimeout(() => {
        this.config.isLocked = true;
        this.updateSignalStatus();
        this.updateDisplay();
        this.emit(Events.ANTENNA_LOCKED, { locked: true });
      }, 3000); // 3 second delay to acquire lock
    } else {
      this.config.isLocked = false;
      this.signals = [];
      this.emit(Events.ANTENNA_LOCKED, { locked: false });
    }

    this.emit(Events.ANTENNA_TRACK_CHANGED, {
      track: this.config.isAutoTrackEnabled
    });

    this.updateSignalStatus();
    this.updateDisplay();
  }

  private updateSignalStatus(): void {
    // Update signal active status based on antenna config
    this.signals = defaultSignalData.filter((signal) => {
      // Can't receive signals if not locked
      if (!this.config.isLocked) {
        return false;
      }

      if (Math.random() < 0.8) {
        return false;
      }

      const downlinkFrequency = this.getDownlinkFrequency();
      const isCurrentServer = signal.serverId === this.config.serverId;
      const isCurrentSatellite = signal.targetId === this.config.targetId;
      const minAllowedFreq = downlinkFrequency - signal.bandwidth / 2;
      const maxAllowedFreq = downlinkFrequency + signal.bandwidth / 2;
      const isAboveMinFreq = signal.frequency >= minAllowedFreq;
      const isBelowMaxFreq = signal.frequency <= maxAllowedFreq;

      return isCurrentServer && isCurrentSatellite && isAboveMinFreq && isBelowMaxFreq;
    });
  }

  getDownlinkFrequency(): RfFrequency {
    const band = this.config.freqBand === 0 ? 'c' : 'ku';
    const bandInfo = this.bands[band];
    const downlinkFreq = bandInfo.downconvert + (this.config.offset * 1e6); // MHz to Hz
    return downlinkFreq as RfFrequency;
  }

  private updateDisplay(): void {
    this.render();

    // Re-attach listeners after render
    this.addListeners();
  }

  private getStatusClass(): string {
    if (!this.config.isOperational) return 'status-disabled';
    if (this.config.isLoopbackEnabled || (!this.config.isLoopbackEnabled && this.config.isHpaEnabled)) {
      return 'status-active';
    }
    return 'status-error';
  }

  private getStatusText(): string {
    if (!this.config.isOperational) return 'Not Operational';
    if (this.config.isLoopbackEnabled) return 'Loopback';
    if (!this.config.isLoopbackEnabled && this.config.isHpaEnabled) return 'Transmitting';
    return 'Rx Only';
  }
}