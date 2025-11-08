import { ToggleSwitch } from "@app/components/toggle-switch/toggle-switch";
import { EventBus } from "@app/events/event-bus";
import { Sfx } from "@app/sound/sfx-enum";
import SoundManager from "@app/sound/sound-manager";
import { PowerSwitch } from '../../components/power-switch/power-switch';
import { html } from "../../engine/utils/development/formatter";
import { qs } from "../../engine/utils/query-selector";
import { Events } from "../../events/events";
import { Hertz, IfFrequency, IfSignal, SignalOrigin } from "../../types";
import { BaseEquipment } from "../base-equipment";
import './transmitter.css';

export interface TransmitterModem {
  /** Index in modems array */
  id: number;
  /** Unit number */
  modem_number: number; // 1-4
  antenna_id: number;
  isPowered: boolean;
  isTestMode: boolean;
  isFaulted: boolean;
  isFaultSwitchUp: boolean;
  isTransmitting: boolean;
  isTransmittingSwitchUp: boolean;
  /** The active IF signal of this modem */
  ifSignal: IfSignal;
}

export interface TransmitterState {
  unit: number; // Case number 1-4
  team_id: number;
  server_id: number;
  modems: TransmitterModem[];
  activeModem: number;
}

/**
 * Transmitter - Single transmitter case containing 4 modems
 * Manages modem configuration and transmission state_
 * Extends Equipment base class for standard lifecycle
 */
export class Transmitter extends BaseEquipment {
  // State
  state: TransmitterState;
  private inputData: Partial<TransmitterModem> = {
    ifSignal: {} as IfSignal
  };
  private lastRenderState: TransmitterState | null = null;

  // Power management
  private readonly powerBudget = 23886;
  powerSwitch: PowerSwitch;
  txToggleSwitch: ToggleSwitch;
  testModeSwitch: ToggleSwitch;
  faultResetSwitch: ToggleSwitch;

  constructor(parentId: string, unit: number, teamId: number = 1, serverId: number = 1) {
    super(parentId, unit, teamId);

    // Initialize config with 4 modems
    const modems: TransmitterModem[] = [];
    for (let i = 1; i <= 4; i++) {
      modems.push({
        id: i - 1,
        modem_number: i,
        antenna_id: 1,
        ifSignal: {
          id: `${unit}-${i}-default`,
          serverId: serverId,
          noradId: 1,
          frequency: 1000 * 1e6 as IfFrequency, // MHz (L-Band)
          power: -97, // dBm
          bandwidth: 10 * 1e6 as Hertz, // MHz
          modulation: 'null',
          fec: 'null',
          feed: '',
          polarization: null,
          isDegraded: false,
          origin: SignalOrigin.TRANSMITTER
        },
        isTransmitting: false,
        isTransmittingSwitchUp: false,
        isPowered: true,
        isTestMode: false,
        isFaulted: false,
        isFaultSwitchUp: false,
      });
    }

    this.state = {
      unit: this.id,
      team_id: this.teamId,
      server_id: serverId,
      modems,
      activeModem: 1
    };

    this.build(parentId);

    EventBus.getInstance().on(Events.UPDATE, this.update.bind(this));
    EventBus.getInstance().on(Events.SYNC, this.syncDomWithState.bind(this));
    EventBus.getInstance().once(Events.SYNC, this.initialSync.bind(this));
  }

  public update(): void {
    // No periodic updates needed for transmitter at this time
  }

  initialSync(): void {
    this.inputData = structuredClone(this.activeModem);
  }

  initializeDom(parentId: string): HTMLElement {
    const parentDom = super.initializeDom(parentId);

    this.txToggleSwitch = ToggleSwitch.create(`tx-transmit-switch-${this.state.unit}${this.activeModem.modem_number}`, this.activeModem.isTransmittingSwitchUp);
    this.faultResetSwitch = ToggleSwitch.create(`tx-fault-reset-switch-${this.state.unit}${this.activeModem.modem_number}`, this.activeModem.isFaultSwitchUp);
    this.testModeSwitch = ToggleSwitch.create(`tx-test-mode-switch-${this.state.unit}${this.activeModem.modem_number}`, this.activeModem.isTestMode);
    this.powerSwitch = PowerSwitch.create(`tx-power-switch-${this.state.unit}${this.activeModem.modem_number}`, this.activeModem.isPowered);

    parentDom.innerHTML = html`
      <div class="equipment-box transmitter-box">
        <div class="equipment-case-header">
          <div class="equipment-case-title">Transmitter Case ${this.id}</div>
          <div class="equipment-case-power-controls">
            <div class="equipment-case-main-power"></div>
            <div class="equipment-case-status-indicator">
              <span class="equipment-case-status-label">Status</span>
              <div class="led"></div>
            </div>
          </div>
        </div>

        <div class="transmitter-controls">
          <!-- Modem Selection Buttons -->
          <div class="modem-buttons">
            ${this.state.modems.map(modem => html`
              <button
                id="modem-${modem.modem_number}"
                class="btn-modem ${modem.modem_number === this.state.activeModem ? 'active' : ''} ${modem.isTransmitting ? 'transmitting' : ''}"
                data-modem="${modem.modem_number}">
                ${modem.modem_number}
              </button>
            `).join('')}
          </div>

          <div class="transmitter-main-content">

            <!-- Active Modem Configuration -->
            <div class="tx-modem-config">
              <div class="config-row">
                <label>Antenna</label>
                <select class="input-tx-antenna" data-param="antenna_id">
                  <option value="1" ${this.inputData.antenna_id === 1 ? 'selected' : ''}>1</option>
                  <option value="2" ${this.inputData.antenna_id === 2 ? 'selected' : ''}>2</option>
                </select>
                <span class="current-value">${this.activeModem.antenna_id}</span>
              </div>

              <div class="config-row">
                <label>Freq (MHz)</label>
                <input
                  type="text"
                  class="input-tx-frequency"
                  data-param="frequency"
                  value="${(this.inputData.ifSignal?.frequency ?? this.activeModem.ifSignal.frequency) / 1e6}"
                />
                <span class="current-value">${this.activeModem.ifSignal.frequency / 1e6} MHz</span>
              </div>

              <div class="config-row">
                <label>BW (MHz)</label>
                <input
                  type="text"
                  class="input-tx-bandwidth"
                  data-param="bandwidth"
                  value="${(this.inputData.ifSignal?.bandwidth ?? this.activeModem.ifSignal.bandwidth) / 1e6}"
                />
                <span class="current-value">${this.activeModem.ifSignal.bandwidth / 1e6} MHz</span>
              </div>

              <div class="config-row">
                <label>Power (dBm)</label>
                <input
                  type="text"
                  class="input-tx-power"
                  data-param="power"
                  value="${this.inputData.ifSignal?.power ?? this.activeModem.ifSignal.power}"
                />
                <span class="current-value">${this.activeModem.ifSignal.power} dBm</span>
              </div>

              <div class="config-actions">
                <button class="btn-apply" data-action="apply">Apply</button>
              </div>
            </div>

            <div class="transmitter-right-content">
              <div class="config-row power-meter">
                <label>Power %</label>
                <div class="power-bar-container">
                  <div
                    class="power-bar ${this.getPowerPercentage() > 100 ? 'over-budget' : ''}"
                    style="width: ${Math.min(this.getPowerPercentage(), 100)}%">
                  </div>
                  <span class="power-percentage">${Math.round(this.getPowerPercentage())}%</span>
                </div>
              </div>
              <div class="unit-status-indicators">
                <div class="status-indicator transmitting">
                  <span id="tx-transmitting-light" class="indicator-light ${this.activeModem.isTransmitting ? 'on' : 'off'}"></span>
                  <span class="indicator-label">TX</span>
                  ${this.txToggleSwitch.html}
                </div>
                <div class="status-indicator ${this.activeModem.isFaulted ? 'fault' : ''}">
                  <span id="tx-fault-light" class="indicator-light ${this.activeModem.isPowered ? 'on' : 'off'}"></span>
                  <span class="indicator-label">Fault</span>
                  ${this.faultResetSwitch.html}
                </div>
                <div class="status-indicator test-mode">
                  <span id="tx-test-mode-light" class="indicator-light ${this.activeModem.isTestMode ? 'on' : 'off'}"></span>
                  <span class="indicator-label">Test</span>
                  ${this.testModeSwitch.html}
                </div>
                <div class="status-indicator online">
                  <span id="tx-active-power-light" class="indicator-light ${this.activeModem.isPowered ? 'on' : 'off'}"></span>
                  <span class="indicator-label">Online</span>
                  ${this.powerSwitch.html}
                </div>
              </div>
            </div>
        </div>
      </div>
    `;

    // Cache commonly used DOM nodes for efficient updates
    this.domCache['parent'] = parentDom;
    this.domCache['led'] = qs('.led', parentDom);
    this.state.modems.forEach(modem => {
      this.domCache[`modemButton${modem.modem_number}`] = qs(`#modem-${modem.modem_number}`, parentDom);
    });
    this.domCache['inputAntenna'] = qs('.input-tx-antenna', parentDom);
    this.domCache['inputFrequency'] = qs('.input-tx-frequency', parentDom);
    this.domCache['inputBandwidth'] = qs('.input-tx-bandwidth', parentDom);
    this.domCache['inputPower'] = qs('.input-tx-power', parentDom);
    this.domCache['btnApply'] = qs('.btn-apply', parentDom);
    this.domCache['powerBar'] = qs('.power-bar', parentDom);
    this.domCache['powerPercentage'] = qs('.power-percentage', parentDom);
    this.domCache['txActivePowerLight'] = qs('#tx-active-power-light', parentDom);
    this.domCache['txTransmittingLight'] = qs('#tx-transmitting-light', parentDom);
    this.domCache['txFaultLight'] = qs('#tx-fault-light', parentDom);
    this.domCache['txTestModeLight'] = qs('#tx-test-mode-light', parentDom);

    // If this.inputData is empty, initialize it with active modem data
    if (Object.keys(this.inputData).length === 0) {
      this.inputData = { ...this.activeModem };
    }

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

    // Power and Transmit Toggle Switches
    this.txToggleSwitch.addEventListeners(this.toggleTransmit.bind(this));
    this.faultResetSwitch.addEventListeners(this.toggleFaultReset.bind(this));
    this.testModeSwitch.addEventListeners(this.toggleTestMode.bind(this));
    this.powerSwitch.addEventListeners(this.togglePower.bind(this));
  }

  private togglePower(isOn: boolean): void {
    if (isOn) {
      SoundManager.getInstance().play(Sfx.TOGGLE_ON);
    } else {
      // If turning off power, also stop transmission
      this.activeModem.isTransmitting = false;
      this.activeModem.isFaulted = false;
      SoundManager.getInstance().play(Sfx.TOGGLE_OFF);
    }

    setTimeout(() => {
      this.activeModem.isPowered = isOn;
      this.emit(Events.TX_CONFIG_CHANGED, {
        unit: this.id,
        modem: this.state.activeModem,
        config: this.activeModem
      });
      this.syncDomWithState();
    }, isOn ? 4000 : 250);
  }

  protected initialize_(): void {
    this.syncDomWithState();
  }

  public sync(data: Partial<TransmitterState>): void {
    if (data.modems) {
      this.state.modems = data.modems;
    }
    this.state.activeModem = data.activeModem ?? this.state.activeModem;
    this.syncDomWithState();
  }

  /**
   * Private Methods
   */

  get activeModem(): TransmitterModem {
    return this.state.modems.find(m => m.modem_number === this.state.activeModem) ?? this.state.modems[0];
  }

  private setActiveModem(modemNumber: number): void {
    this.state.activeModem = modemNumber;
    this.inputData = structuredClone(this.activeModem);
    this.syncDomWithState();

    // Emit event for modem change
    this.emit(Events.TX_ACTIVE_MODEM_CHANGED, {
      unit: this.id,
      activeModem: modemNumber
    });
  }

  private handleInputChange(e: Event): void {
    const target = e.target as HTMLInputElement | HTMLSelectElement;
    const param = target.dataset.param;
    if (!param) return;

    let value: any = target.value;

    // Parse based on parameter type using switch
    switch (param) {
      case 'power':
        // Allow negative numbers for power
        if (value.match(/[^0-9-]/g)) return;
        this.inputData.ifSignal.power = Number.parseFloat(value) || 0;
        break;
      case 'frequency':
        value = Number.parseFloat(value) || 0;
        // Convert MHz to Hertz
        this.inputData.ifSignal.frequency = value * 1e6 as IfFrequency;
        break;
      case 'bandwidth':
        value = Number.parseFloat(value) || 0;
        // Convert MHz to Hertz
        this.inputData.ifSignal.bandwidth = value * 1e6 as IfFrequency;
        break;
      case 'antenna_id':
        this.inputData.antenna_id = Number.parseInt(value);
        break;
      default:
        throw new Error(`Unknown parameter '${param}' in transmitter input change`);
    }
  }

  private applyChanges(): void {
    this.updateTransmissionState();

    // Update the modem configuration
    this.state.modems[this.activeModem.id] = {
      ...this.activeModem,
      ifSignal: this.inputData.ifSignal ?? this.activeModem.ifSignal
      ,
    };

    this.emit(Events.TX_CONFIG_CHANGED, {
      unit: this.id,
      modem: this.state.activeModem,
      config: this.state.modems[this.activeModem.id]
    });

    this.syncDomWithState();
  }

  private toggleTransmit(): void {
    const activeModem = this.activeModem;
    const modemIndex = this.state.modems.findIndex(m => m.modem_number === this.state.activeModem);

    if (activeModem.isPowered === false) {
      this.emit(Events.TX_ERROR, { message: 'Cannot transmit: Modem is powered off' });
      return;
    }

    this.activeModem.isTransmittingSwitchUp = !this.activeModem.isTransmittingSwitchUp;
    this.state.modems[modemIndex].isTransmitting = this.activeModem.isTransmittingSwitchUp;
    this.updateTransmissionState();

    this.emit(Events.TX_CONFIG_CHANGED, {
      unit: this.id,
      modem: this.state.activeModem,
      config: this.state.modems[this.activeModem.id]
    });

    SoundManager.getInstance().play(Sfx.SWITCH);

    this.syncDomWithState();
  }

  private toggleFaultReset(): void {
    this.activeModem.isFaultSwitchUp = true;

    // Wait 3 seconds and then clear fault and reset switch
    setTimeout(() => {
      if (!this.activeModem.isTransmitting) {
        this.activeModem.isFaulted = false;
      }
      this.faultResetSwitch.deactivate();
      this.activeModem.isFaultSwitchUp = false;

      this.emit(Events.TX_CONFIG_CHANGED, {
        unit: this.id,
        modem: this.state.activeModem,
        config: this.state.modems[this.activeModem.id]
      });
      SoundManager.getInstance().play(Sfx.SWITCH);
    }, 250);

    this.emit(Events.TX_CONFIG_CHANGED, {
      unit: this.id,
      modem: this.state.activeModem,
      config: this.state.modems[this.activeModem.id]
    });

    SoundManager.getInstance().play(Sfx.SWITCH);
  }

  private toggleTestMode(): void {
    this.activeModem.isTestMode = !this.activeModem.isTestMode;

    this.emit(Events.TX_CONFIG_CHANGED, {
      unit: this.id,
      modem: this.state.activeModem,
      config: this.state.modems[this.activeModem.id]
    });
    SoundManager.getInstance().play(Sfx.SWITCH);
    this.syncDomWithState();
  }

  private updateTransmissionState() {
    // Check power budget if turning on
    if (this.activeModem.isTransmitting) {
      const modemPower = this.calculateModemPower(this.activeModem.ifSignal.bandwidth, this.activeModem.ifSignal.power);
      if (!this.validatePowerConsumption(modemPower)) {
        this.activeModem.isFaulted = true;
        this.emit(Events.TX_ERROR, { message: 'Power consumption exceeds budget' });
      }
    }
  }

  private calculateModemPower(bandwidth: Hertz, powerDbm: number): number {
    // Power calculation: bandwidth (MHz) * 10^((120 + power) / 10)
    return bandwidth / 1e6 * Math.pow(10, (120 + powerDbm) / 10);
  }

  private getPowerPercentage(): number {
    const activeModem = this.activeModem;

    if (!activeModem.isPowered) return 0;

    const modemPower = this.calculateModemPower(
      activeModem.ifSignal.bandwidth,
      activeModem.ifSignal.power
    );
    return Math.round((100 * modemPower) / this.powerBudget);
  }

  private validatePowerConsumption(modemPower: number): boolean {
    return Math.round((100 * modemPower) / this.powerBudget) <= 100;
  }

  syncDomWithState(): void {
    // Avoid unnecessary DOM updates by shallow comparing serialized state
    if (JSON.stringify(this.state) === JSON.stringify(this.lastRenderState)) {
      return; // No changes, skip update
    }

    const parentDom = this.domCache['parent'];

    // Update status
    const isTransmitting = this.state.modems.some(m => m.isTransmitting);
    const somePower = this.state.modems.some(m => m.isPowered);
    if (somePower) {
      (this.domCache['led']).className = `led ${isTransmitting ? 'led-red' : 'led-green'}`;
    } else {
      (this.domCache['led']).className = `led`;
    }

    // Update modem buttons
    const modemButtons = parentDom.querySelectorAll('.btn-modem');
    modemButtons.forEach((btn) => {
      const modemNum = Number((btn as HTMLElement).dataset['modem']);
      const modem = this.state.modems.find(m => m.modem_number === modemNum);
      const isActive = modemNum === this.state.activeModem;
      const transmittingClass = modem?.isTransmitting ? 'transmitting' : '';
      btn.className = `btn-modem ${isActive ? 'active' : ''} ${transmittingClass}`.trim();
    });

    // Sync active modem inputs
    const activeModem = this.activeModem;

    if (this.domCache['inputAntenna']) {
      const sel = this.domCache['inputAntenna'] as HTMLSelectElement;
      for (const element of sel.options) {
        element.selected = Number(element.value) === (this.inputData.antenna_id ?? activeModem.antenna_id);
      }
    }

    // Convert Hertz to MHz for display
    const freqHz = (this.inputData.ifSignal?.frequency) ?? activeModem.ifSignal.frequency ?? 0;
    (this.domCache['inputFrequency'] as HTMLInputElement).value = freqHz ? String(freqHz / 1e6) : '';

    // Convert Hertz to MHz for display
    const bwHz = this.inputData.ifSignal?.bandwidth ?? activeModem.ifSignal.bandwidth ?? 0;
    (this.domCache['inputBandwidth'] as HTMLInputElement).value = bwHz ? String(bwHz / 1e6) : '';

    (this.domCache['inputPower'] as HTMLInputElement).value = String(this.inputData.ifSignal?.power ?? activeModem.ifSignal.power ?? '');

    // Update current-value labels (antenna, freq, bw, power)
    const currentValueEls = parentDom.querySelectorAll('.tx-modem-config .current-value');
    if (activeModem && currentValueEls.length >= 4) {
      (currentValueEls[0] as HTMLElement).textContent = String(activeModem.antenna_id);
      (currentValueEls[1] as HTMLElement).textContent = `${activeModem.ifSignal.frequency / 1e6} MHz`;
      (currentValueEls[2] as HTMLElement).textContent = `${activeModem.ifSignal.bandwidth / 1e6} MHz`;
      (currentValueEls[3] as HTMLElement).textContent = `${activeModem.ifSignal.power} dBm`;
    }

    // Update power meter
    const pct = this.getPowerPercentage();
    if (this.domCache['powerBar']) {
      const bar = this.domCache['powerBar'];
      bar.style.width = `${Math.min(pct, 100)}%`;
      if (pct > 100) bar.classList.add('over-budget'); else bar.classList.remove('over-budget');
    }
    if (this.domCache['powerPercentage']) {
      (this.domCache['powerPercentage']).textContent = `${Math.round(pct)}%`;
    }

    // Update transmit button active class
    this.txToggleSwitch.sync(this.activeModem.isTransmittingSwitchUp);
    this.faultResetSwitch.sync(this.activeModem.isFaultSwitchUp);
    this.testModeSwitch.sync(this.activeModem.isTestMode);
    this.powerSwitch.sync(activeModem.isPowered);

    // Update physical light indicators
    this.domCache['txActivePowerLight'].className = `indicator-light ${activeModem.isPowered ? 'on' : 'off'}`;
    this.domCache['txTransmittingLight'].className = `indicator-light ${activeModem.isTransmitting ? 'on' : 'off'}`;
    this.domCache['txFaultLight'].className = `indicator-light ${activeModem.isPowered ? 'on' : 'off'}`;
    this.domCache['txFaultLight'].parentElement.className = `status-indicator ${activeModem.isFaulted ? 'fault' : ''}`;
    this.domCache['txTestModeLight'].className = `indicator-light ${activeModem.isTestMode ? 'on' : 'off'}`;
    // Save snapshot
    this.lastRenderState = structuredClone(this.state);
  }
}