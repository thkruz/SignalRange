import { Events } from '../../events/event-bus';
import { html, qs } from '../../utils';
import { Equipment } from '../equipment';
import './antenna.css';

export interface AntennaConfig {
  unit: number;
  team_id: number;
  server_id: number;
  target_id: number;
  band: number; // 0 = C, 1 = Ku
  offset: number; // MHz
  hpa: boolean; // High Powered Amplifier
  loopback: boolean;
  locked: boolean;
  track: boolean;
  operational: boolean;
}

/**
 * Antenna - Single antenna unit
 * Manages antenna state, loopback switch, and satellite tracking
 * Extends Equipment base class for standard lifecycle
 */
export class Antenna extends Equipment {
  // State
  private config: AntennaConfig;
  private inputData: Partial<AntennaConfig> = {};

  // Band information
  private readonly bands = {
    c: { name: 'C Band', upconvert: 3350e6, downconvert: 3500e6 },
    ku: { name: 'Ku Band', upconvert: 12750e6, downconvert: 10950e6 }
  };

  constructor(parentId: string, unit: number, teamId: number = 1, serverId: number = 1) {
    super(parentId, unit, teamId);

    // Initialize config with defaults
    this.config = {
      unit: this.unit,
      team_id: this.teamId,
      server_id: serverId,
      target_id: 1,
      band: 0, // C Band
      offset: 0,
      hpa: false,
      loopback: false,
      locked: false,
      track: false,
      operational: true
    };

    this.inputData = { ...this.config };
    this.build();
  }

  protected loadCSS(): void {
    // CSS is imported at the top of the file
  }

  render(): HTMLElement {
    const band = this.config.band === 0 ? 'c' : 'ku';
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
                class="btn-loopback ${this.config.loopback ? 'active' : ''}"
                data-action="loopback">
                <img
                  src="/assets/baseball_switch_${this.config.loopback ? '2' : '1'}.png"
                  alt="Loopback Switch"
                  class="switch-image"
                />
              </button>
              <div class="loopback-label">Antenna</div>
            </div>

            <button
              class="btn-hpa ${this.config.hpa ? 'active' : ''}"
              data-action="hpa">
              HPA
            </button>
          </div>

          <!-- Antenna Configuration -->
          <div class="antenna-config">
            <div class="config-row">
              <label>Satellite</label>
              <select class="input-target" data-param="target_id">
                <option value="1" ${this.inputData.target_id === 1 ? 'selected' : ''}>Satellite 1</option>
                <option value="2" ${this.inputData.target_id === 2 ? 'selected' : ''}>Satellite 2</option>
                <option value="3" ${this.inputData.target_id === 3 ? 'selected' : ''}>Satellite 3</option>
                <option value="4" ${this.inputData.target_id === 4 ? 'selected' : ''}>Satellite 4</option>
              </select>
              <span class="current-value">${this.config.target_id}</span>
            </div>

            <div class="config-row">
              <label>Band</label>
              <select class="input-band" data-param="band">
                <option value="0" ${this.inputData.band === 0 ? 'selected' : ''}>C Band</option>
                <option value="1" ${this.inputData.band === 1 ? 'selected' : ''}>Ku Band</option>
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
                    ${this.config.track ? 'checked' : ''}
                  />
                  <span class="slider"></span>
                </label>
              </div>
              <span class="lock-status ${this.config.locked ? 'locked' : 'unlocked'}">
                ${this.config.locked ? 'LOCKED' : this.config.track ? 'TRACKING' : 'UNLOCKED'}
              </span>
            </div>

            <div class="config-actions">
              <button class="btn-apply" data-action="apply">Apply</button>
              <button
                class="btn-power ${this.config.operational ? 'active' : ''}"
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
  }

  protected initialize(): void {
    // Start in operational state
    this.updateDisplay();
  }

  public update(data: Partial<AntennaConfig>): void {
    this.config = { ...this.config, ...data };
    this.inputData = { ...this.config };
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
    const param = target.getAttribute('data-param');
    if (!param) return;

    let value: any = target.value;

    // Parse based on parameter type
    if (param === 'offset') {
      // Allow negative numbers
      if (value.match(/[^0-9-]/g)) return;
      value = parseInt(value) || 0;
    } else if (param === 'target_id' || param === 'band') {
      value = parseInt(value);
    } else if (param === 'track') {
      value = (target as HTMLInputElement).checked;
    }

    this.inputData[param as keyof AntennaConfig] = value;
  }

  private applyChanges(): void {
    // Validate operational state
    if (!this.config.operational) {
      this.emit(Events.ANTENNA_ERROR, { message: 'Antenna is not operational' });
      return;
    }

    // Update config with input data
    this.config = { ...this.config, ...this.inputData };

    // Emit configuration change event
    this.emit(Events.ANTENNA_CONFIG_CHANGED, this.config);

    this.updateDisplay();
  }

  private toggleLoopback(): void {
    if (!this.config.operational) {
      this.emit(Events.ANTENNA_ERROR, { message: 'Antenna is not operational' });
      return;
    }

    this.config.loopback = !this.config.loopback;

    // If switching to antenna mode, disable HPA if it was on
    if (!this.config.loopback && this.config.hpa) {
      // Keep HPA on when going to antenna mode
    }

    this.emit(Events.ANTENNA_LOOPBACK_CHANGED, {
      loopback: this.config.loopback
    });

    this.updateDisplay();
  }

  private toggleHpa(): void {
    if (!this.config.operational) {
      this.emit(Events.ANTENNA_ERROR, { message: 'Antenna is not operational' });
      return;
    }

    // Can only enable HPA when not in loopback mode
    if (this.config.loopback && !this.config.hpa) {
      this.emit(Events.ANTENNA_ERROR, { message: 'Cannot enable HPA in loopback mode' });
      return;
    }

    this.config.hpa = !this.config.hpa;

    this.emit(Events.ANTENNA_HPA_CHANGED, {
      hpa: this.config.hpa
    });

    this.updateDisplay();
  }

  private togglePower(): void {
    this.config.operational = !this.config.operational;

    // If turning off, also turn off track and locked
    if (!this.config.operational) {
      this.config.locked = false;
      this.config.track = false;
    }

    this.emit(Events.ANTENNA_POWER_CHANGED, {
      operational: this.config.operational
    });

    this.updateDisplay();
  }

  private handleTrackChange(): void {
    if (!this.config.operational) {
      this.emit(Events.ANTENNA_ERROR, { message: 'Antenna is not operational' });
      // Reset the switch
      const trackSwitch = qs('.input-track', this.element) as HTMLInputElement;
      if (trackSwitch) trackSwitch.checked = false;
      return;
    }

    const newTrackValue = !this.config.track;
    this.config.track = newTrackValue;

    // Simulate lock acquisition delay
    if (newTrackValue) {
      setTimeout(() => {
        this.config.locked = true;
        this.updateDisplay();
        this.emit(Events.ANTENNA_LOCKED, { locked: true });
      }, 3000); // 3 second delay to acquire lock
    } else {
      this.config.locked = false;
      this.emit(Events.ANTENNA_LOCKED, { locked: false });
    }

    this.emit(Events.ANTENNA_TRACK_CHANGED, {
      track: this.config.track
    });

    this.updateDisplay();
  }

  private updateDisplay(): void {
    this.render();

    // Re-attach listeners after render
    this.addListeners();
  }

  private getStatusClass(): string {
    if (!this.config.operational) return 'status-disabled';
    if (this.config.loopback || (!this.config.loopback && this.config.hpa)) {
      return 'status-active';
    }
    return 'status-error';
  }

  private getStatusText(): string {
    if (!this.config.operational) return 'Not Operational';
    if (this.config.loopback) return 'Loopback';
    if (!this.config.loopback && this.config.hpa) return 'Transmitting';
    return 'No Power';
  }
}