import { ToggleSwitch } from "@app/components/toggle-switch/toggle-switch";
import { EventBus } from "@app/events/event-bus";
import { SignalOrigin } from "@app/signal-origin";
import { PowerSwitch } from '../../components/power-switch/power-switch';
import { html } from "../../engine/utils/development/formatter";
import { qs } from "../../engine/utils/query-selector";
import { Events } from "../../events/events";
import { dBi, dBm, Hertz, IfFrequency, IfSignal } from "../../types";
import { AlarmStatus, BaseEquipment } from "../base-equipment";
import './transmitter.css';

export interface TransmitterModem {
  /** Index in modems array */
  id: number;
  /** Unit number */
  modem_number: number; // 1-4
  antenna_id: number;
  isPowered: boolean;
  isLoopback: boolean;
  isFaulted: boolean;
  isFaultSwitchUp: boolean;
  isTransmitting: boolean;
  isTransmittingSwitchUp: boolean;
  /** The active IF signal of this modem */
  ifSignal: IfSignal;
}

export interface TransmitterState {
  uuid: string;
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
  private readonly powerBudget = 10 as dBm; // dBm (10W) total power budget
  powerSwitch: PowerSwitch;
  txToggleSwitch: ToggleSwitch;
  loopbackSwitch: ToggleSwitch;
  faultResetSwitch: ToggleSwitch;

  constructor(parentId: string, state?: Partial<TransmitterState>, teamId: number = 1, serverId: number = 1) {
    super(teamId);

    const defaults = Transmitter.getDefaultState();

    const uuid = state?.uuid ?? this.uuid;
    const team_id = state?.team_id ?? this.teamId;
    const server_id = state?.server_id ?? serverId;

    // Merge modem overrides by modem_number (so callers don't have to provide a full ordered array)
    const overridesByModemNumber = new Map<number, Partial<TransmitterModem>>(
      (state?.modems ?? []).map(m => [m.modem_number, m])
    );

    const modems: TransmitterModem[] = defaults.modems.map((def) => {
      const override = overridesByModemNumber.get(def.modem_number);

      const merged: TransmitterModem = {
        ...def,
        ...override,
        // Ensure identity fields remain correct unless explicitly overridden
        id: override?.id ?? def.id,
        modem_number: override?.modem_number ?? def.modem_number,
        ifSignal: {
          ...def.ifSignal,
          ...override?.ifSignal,
        },
      };

      // Fill in derived defaults unless overridden
      merged.ifSignal.serverId = override?.ifSignal?.serverId ?? server_id;
      merged.ifSignal.signalId = override?.ifSignal?.signalId ?? `${uuid}-${merged.modem_number}-default`;
      merged.ifSignal.origin = override?.ifSignal?.origin ?? SignalOrigin.TRANSMITTER;

      return merged;
    });

    this.state = {
      ...defaults,
      ...state,
      uuid,
      team_id,
      server_id,
      modems,
      activeModem: state?.activeModem ?? defaults.activeModem,
    };

    this.build(parentId);

    EventBus.getInstance().on(Events.UPDATE, this.update.bind(this));
    EventBus.getInstance().on(Events.SYNC, this.syncDomWithState.bind(this));
    EventBus.getInstance().once(Events.SYNC, this.initialSync.bind(this));
  }

  static getDefaultState(): TransmitterState {
    const modems: TransmitterModem[] = Array.from({ length: 4 }, (_, idx) => {
      const modemNumber = idx + 1;

      return {
        id: idx,
        modem_number: modemNumber,
        antenna_id: 1,
        ifSignal: {
          signalId: `default-${modemNumber}`,
          serverId: 1,
          noradId: 1,
          frequency: (1400 * 1e6) as IfFrequency, // 1.4 GHz IF
          power: -20 as dBm,
          bandwidth: (10 * 1e6) as Hertz, // 10 MHz
          modulation: 'null',
          fec: 'null',
          feed: '',
          polarization: null,
          isDegraded: false,
          origin: SignalOrigin.TRANSMITTER,
          noiseFloor: null,
          gainInPath: 0 as dBi,
        },
        isTransmitting: false,
        isTransmittingSwitchUp: false,
        isPowered: true,
        isLoopback: false,
        isFaulted: false,
        isFaultSwitchUp: false,
      };
    });

    return {
      uuid: 'default',
      team_id: 1,
      server_id: 1,
      modems,
      activeModem: 1,
    };
  }

  update(): void {
    // Check for alarms and faults
    this.checkForAlarms_();
  }

  initialSync(): void {
    this.inputData = structuredClone(this.activeModem);
  }

  initializeDom(parentId: string): HTMLElement {
    const parentDom = super.initializeDom(parentId);

    this.txToggleSwitch = ToggleSwitch.create(`tx-transmit-switch-${this.state.uuid}${this.activeModem.modem_number}`, this.activeModem.isTransmittingSwitchUp);
    this.faultResetSwitch = ToggleSwitch.create(`tx-fault-reset-switch-${this.state.uuid}${this.activeModem.modem_number}`, this.activeModem.isFaultSwitchUp);
    this.loopbackSwitch = ToggleSwitch.create(`tx-loopback-switch-${this.state.uuid}${this.activeModem.modem_number}`, this.activeModem.isLoopback);
    this.powerSwitch = PowerSwitch.create(`tx-power-switch-${this.state.uuid}${this.activeModem.modem_number}`, this.activeModem.isPowered);

    parentDom.innerHTML = html`
      <div class="equipment-case transmitter-box">
        <div class="equipment-case-header">
          <div class="equipment-case-title">Transmitter Case ${this.uuidShort}</div>
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
              <div class="led-indicators">
                <div class="status-indicator transmitting">
                  <span id="tx-transmitting-light" class="indicator-light ${this.activeModem.isTransmitting ? 'on' : 'off'}"></span>
                  <span class="indicator-label">TX</span>
                </div>
                <div class="status-indicator ${this.activeModem.isFaulted ? 'fault' : ''}">
                  <span id="tx-fault-light" class="indicator-light ${this.activeModem.isPowered ? 'on' : 'off'}"></span>
                  <span class="indicator-label">Fault</span>
                </div>
                <div class="status-indicator loopback">
                  <span id="tx-loopback-light" class="indicator-light ${this.activeModem.isLoopback ? 'on' : 'off'}"></span>
                  <span class="indicator-label">Loopback to<br />IF Filter</span>
                </div>
                <div class="status-indicator online">
                  <span id="tx-active-power-light" class="indicator-light ${this.activeModem.isPowered ? 'on' : 'off'}"></span>
                  <span class="indicator-label">Online</span>
                </div>
              </div>
              <div class="input-knobs">
                ${this.txToggleSwitch.html}
                ${this.faultResetSwitch.html}
                ${this.loopbackSwitch.html}
                ${this.powerSwitch.html}
              </div>
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
    this.domCache['txLoopbackLight'] = qs('#tx-loopback-light', parentDom);
    this.domCache['bottom-status-bar'] = qs('.bottom-status-bar', parentDom);

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
    this.loopbackSwitch.addEventListeners(this.toggleTestMode.bind(this));
    this.powerSwitch.addEventListeners(this.togglePower.bind(this));
  }

  protected checkForAlarms_(): void {
    this.updateStatusBar(this.domCache['bottom-status-bar'], this.getStatusAlarms());
  }

  public getStatusAlarms(): AlarmStatus[] {
    const alarms: AlarmStatus[] = [];

    for (const modem of this.state.modems) {
      if (modem.isFaulted) {
        alarms.push({
          message: `Modem ${modem.modem_number} Faulted`,
          severity: 'error'
        });
      }
      if (modem.isLoopback) {
        alarms.push({
          message: `Modem ${modem.modem_number} in Loopback Mode`,
          severity: 'info'
        });
      }
      if (modem.isTransmitting) {
        const modemPower = this.calculatePowerBudgetLoad_(modem.ifSignal.bandwidth, modem.ifSignal.power);
        if (!this.validatePowerConsumption(modemPower, 100)) {
          alarms.push({
            message: `Modem ${modem.modem_number} Power Exceeds Max Transmit Power`,
            severity: 'error'
          });
        }
        if (!this.validatePowerConsumption(modemPower, 90)) {
          alarms.push({
            message: `Modem ${modem.modem_number} Power Approaching Max Transmit Power`,
            severity: 'warning'
          });
        }
      }
    }

    return alarms;
  }

  private togglePower(isOn: boolean): void {
    if (!isOn) {
      // If turning off power, also stop transmission
      this.activeModem.isTransmitting = false;
      this.activeModem.isFaulted = false;
    }

    setTimeout(() => {
      this.activeModem.isPowered = isOn;
      this.emit(Events.TX_CONFIG_CHANGED, {
        uuid: this.uuid,
        modem: this.state.activeModem,
        config: this.activeModem
      });
      this.syncDomWithState();
    }, isOn ? 4000 : 250);
  }

  protected initialize_(): void {
    this.syncDomWithState();
  }

  sync(data: Partial<TransmitterState>): void {
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

  /**
   * Public API for adapters - Modem selection
   */
  public setActiveModem(modemNumber: number): void {
    this.state.activeModem = modemNumber;
    this.inputData = structuredClone(this.activeModem);
    this.syncDomWithState();

    // Emit event for modem change
    this.emit(Events.TX_ACTIVE_MODEM_CHANGED, {
      uuid: this.uuid,
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
        this.inputData.ifSignal.power = (Number.parseFloat(value) || 0) as dBm;
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


  private toggleTransmit(): void {
    const activeModem = this.activeModem;
    const modemIndex = this.state.modems.findIndex(m => m.modem_number === this.state.activeModem);

    if (activeModem.isPowered === false) {
      return;
    }

    this.activeModem.isTransmittingSwitchUp = !this.activeModem.isTransmittingSwitchUp;
    this.state.modems[modemIndex].isTransmitting = this.activeModem.isTransmittingSwitchUp;
    this.updateTransmissionState();

    this.emit(Events.TX_CONFIG_CHANGED, {
      uuid: this.uuid,
      modem: this.state.activeModem,
      config: this.state.modems[this.activeModem.id]
    });

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
        uuid: this.uuid,
        modem: this.state.activeModem,
        config: this.state.modems[this.activeModem.id]
      });
    }, 250);

    this.emit(Events.TX_CONFIG_CHANGED, {
      uuid: this.uuid,
      modem: this.state.activeModem,
      config: this.state.modems[this.activeModem.id]
    });
  }

  private toggleTestMode(): void {
    this.activeModem.isLoopback = !this.activeModem.isLoopback;

    this.emit(Events.TX_CONFIG_CHANGED, {
      uuid: this.uuid,
      modem: this.state.activeModem,
      config: this.state.modems[this.activeModem.id]
    });
    this.syncDomWithState();
  }

  private updateTransmissionState() {
    // Check power budget if turning on
    if (this.activeModem.isTransmitting) {
      const modemPower = this.calculatePowerBudgetLoad_(this.activeModem.ifSignal.bandwidth, this.activeModem.ifSignal.power);
      if (!this.validatePowerConsumption(modemPower)) {
        this.activeModem.isFaulted = true;
      }
    }
  }

  /**
   * Calculate power budget load for transmitter resource allocation.
   *
   * Wider bandwidth signals at the same power level use more transmitter capacity.
   * This is NOT the RF signal power - it's a metric for budget/resource management.
   *
   * The formula accounts for total energy content: a wider bandwidth signal at
   * the same power level represents more total energy that the transmitter must handle.
   *
   * @param bandwidth Signal bandwidth in Hz
   * @param powerDbm Signal power in dBm (total power, not power density)
   * @returns Power budget load metric in dBm-equivalent
   */
  private calculatePowerBudgetLoad_(bandwidth: Hertz, powerDbm: dBm): dBm {
    const bandwidthMHz = bandwidth / 1e6;
    return (powerDbm + 10 * Math.log10(bandwidthMHz)) as dBm;
  }

  /**
   * Public API for adapters - Power budget percentage
   */
  public getPowerPercentage(): number {
    const activeModem = this.activeModem;

    if (!activeModem.isPowered) return 0;

    const modemPower = this.calculatePowerBudgetLoad_(
      activeModem.ifSignal.bandwidth,
      activeModem.ifSignal.power
    );
    return Math.round((100 * modemPower) / this.powerBudget);
  }

  private validatePowerConsumption(modemPower: number, maxPercent = 100): boolean {
    return Math.round((100 * modemPower) / this.powerBudget) <= maxPercent;
  }

  /**
   * Public API for adapters - Configuration handlers
   */
  public handleAntennaChange(antennaId: number): void {
    this.inputData.antenna_id = antennaId;
  }

  public handleFrequencyChange(frequencyMHz: number): void {
    if (!this.inputData.ifSignal?.signalId) {
      this.inputData.ifSignal = { ...this.activeModem.ifSignal };
    }
    this.inputData.ifSignal.frequency = (frequencyMHz * 1e6) as IfFrequency;
  }

  public handleBandwidthChange(bandwidthMHz: number): void {
    if (!this.inputData.ifSignal?.signalId) {
      this.inputData.ifSignal = { ...this.activeModem.ifSignal };
    }
    this.inputData.ifSignal.bandwidth = (bandwidthMHz * 1e6) as Hertz;
  }

  public handlePowerChange(powerDbm: number): void {
    if (!this.inputData.ifSignal?.signalId) {
      this.inputData.ifSignal = { ...this.activeModem.ifSignal };
    }
    this.inputData.ifSignal.power = powerDbm as dBm;
  }

  /**
   * Public API for adapters - Control switches
   */
  public handleTransmitToggle(isEnabled: boolean): void {
    const activeModem = this.activeModem;
    const modemIndex = this.state.modems.findIndex(m => m.modem_number === this.state.activeModem);

    if (!activeModem.isPowered) return;

    this.activeModem.isTransmittingSwitchUp = isEnabled;
    this.state.modems[modemIndex].isTransmitting = isEnabled;
    this.updateTransmissionState();

    this.emit(Events.TX_CONFIG_CHANGED, {
      uuid: this.uuid,
      modem: this.state.activeModem,
      config: this.state.modems[this.activeModem.id]
    });

    this.syncDomWithState();
  }

  public handleFaultReset(): void {
    this.toggleFaultReset();
  }

  public handleLoopbackToggle(isEnabled: boolean): void {
    this.activeModem.isLoopback = isEnabled;

    this.emit(Events.TX_CONFIG_CHANGED, {
      uuid: this.uuid,
      modem: this.state.activeModem,
      config: this.state.modems[this.activeModem.id]
    });

    this.syncDomWithState();
  }

  public handlePowerToggle(isEnabled: boolean): void {
    if (!isEnabled) {
      // If turning off power, also stop transmission
      this.activeModem.isTransmitting = false;
      this.activeModem.isFaulted = false;
    }

    setTimeout(() => {
      this.activeModem.isPowered = isEnabled;
      this.emit(Events.TX_CONFIG_CHANGED, {
        uuid: this.uuid,
        modem: this.state.activeModem,
        config: this.activeModem
      });
      this.syncDomWithState();
    }, isEnabled ? 4000 : 250);
  }

  /**
   * Public API for adapters - Apply pending configuration changes
   */
  public applyChanges(): void {
    this.updateTransmissionState();

    // Find the correct array index for the active modem
    const modemIndex = this.state.modems.findIndex(m => m.modem_number === this.state.activeModem);
    if (modemIndex === -1) return;

    // Update the modem configuration, merging ifSignal properties
    this.state.modems[modemIndex] = {
      ...this.activeModem,
      antenna_id: this.inputData.antenna_id ?? this.activeModem.antenna_id,
      ifSignal: {
        ...this.activeModem.ifSignal,
        ...this.inputData.ifSignal,
      },
    };

    this.emit(Events.TX_CONFIG_CHANGED, {
      uuid: this.uuid,
      modem: this.state.activeModem,
      config: this.state.modems[modemIndex]
    });

    this.syncDomWithState();
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
    this.loopbackSwitch.sync(this.activeModem.isLoopback);
    this.powerSwitch.sync(activeModem.isPowered);

    // Update physical light indicators
    this.domCache['txActivePowerLight'].className = `indicator-light ${activeModem.isPowered ? 'on' : 'off'}`;
    this.domCache['txTransmittingLight'].className = `indicator-light ${activeModem.isTransmitting ? 'on' : 'off'}`;
    this.domCache['txFaultLight'].className = `indicator-light ${activeModem.isPowered ? 'on' : 'off'}`;
    this.domCache['txFaultLight'].parentElement.className = `status-indicator ${activeModem.isFaulted ? 'fault' : ''}`;
    this.domCache['txLoopbackLight'].className = `indicator-light ${activeModem.isLoopback ? 'on' : 'off'}`;
    // Save snapshot
    this.lastRenderState = structuredClone(this.state);
  }
}