import { Events } from "../../events/events";
import { html, qs } from '../../utils';
import { Equipment } from '../equipment';
import './transmitter.css';

export interface TransmitterModem {
  modem_number: number; // 1-4
  antenna_id: number;
  frequency: number; // MHz
  bandwidth: number; // MHz
  power: number; // dBm
  transmitting: boolean;
}

export interface TransmitterState {
  unit: number; // Case number 1-4
  team_id: number;
  server_id: number;
  modems: TransmitterModem[];
}

/**
 * Transmitter - Single transmitter case containing 4 modems
 * Manages modem configuration and transmission state_
 * Extends Equipment base class for standard lifecycle
 */
export class Transmitter extends Equipment {
  // State
  protected state_: TransmitterState;
  get state(): TransmitterState {
    return this.state_;
  }
  private activeModem: number = 1;
  private inputData: Partial<TransmitterModem> = {};

  // Power management
  private readonly powerBudget = 23886;

  constructor(parentId: string, unit: number, teamId: number = 1, serverId: number = 1) {
    super(parentId, unit, teamId);

    // Initialize config with 4 modems
    const modems: TransmitterModem[] = [];
    for (let i = 1; i <= 4; i++) {
      modems.push({
        modem_number: i,
        antenna_id: 1,
        frequency: 1000, // MHz (L-Band)
        bandwidth: 10, // MHz
        power: -97, // dBm
        transmitting: false
      });
    }

    this.state_ = {
      unit: this.unit,
      team_id: this.teamId,
      server_id: serverId,
      modems
    };

    this.inputData = { ...this.getActiveModem() };
    this.build();
  }

  public update(): void {
    // No periodic updates needed for transmitter at this time
  }

  initializeDom(): HTMLElement {
    const activeModemData = this.getActiveModem();
    const isTransmitting = this.state_.modems.some(m => m.transmitting);

    this.element.innerHTML = html`
      <div class="transmitter-box">
        <div class="transmitter-header">
          <div class="transmitter-title">Transmitter Case ${this.unit}</div>
          <div class="transmitter-status ${isTransmitting ? 'status-active' : 'status-standby'}">
            ${isTransmitting ? 'TRANSMITTING' : 'STANDBY'}
          </div>
        </div>

        <div class="transmitter-controls">
          <!-- Modem Selection Buttons -->
          <div class="modem-buttons">
            ${this.state_.modems.map(modem => html`
              <button
                class="btn-modem ${modem.modem_number === this.activeModem ? 'active' : ''} ${modem.transmitting ? 'transmitting' : ''}"
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
                <span class="current-value">${activeModemData.antenna_id}</span>
              </div>

              <div class="config-row">
                <label>Freq (MHz)</label>
                <input
                  type="text"
                  class="input-tx-frequency"
                  data-param="frequency"
                  value="${this.inputData.frequency ?? activeModemData.frequency}"
                />
                <span class="current-value">${activeModemData.frequency} MHz</span>
              </div>

              <div class="config-row">
                <label>BW (MHz)</label>
                <input
                  type="text"
                  class="input-tx-bandwidth"
                  data-param="bandwidth"
                  value="${this.inputData.bandwidth ?? activeModemData.bandwidth}"
                />
                <span class="current-value">${activeModemData.bandwidth} MHz</span>
              </div>

              <div class="config-row">
                <label>Power (dBm)</label>
                <input
                  type="text"
                  class="input-tx-power"
                  data-param="power"
                  value="${this.inputData.power ?? activeModemData.power}"
                />
                <span class="current-value">${activeModemData.power} dBm</span>
              </div>

              <div class="config-actions">
                <button class="btn-apply" data-action="apply">Apply</button>
              </div>
            </div>

            <div class="transmitter-power-content">
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
              <button
                class="btn-transmit ${activeModemData.transmitting ? 'active' : ''}"
                data-action="transmit">
                TX
              </button>
            </div>
        </div>
      </div>
    `;

    return this.element;
  }

  protected addListeners(): void {
    // Modem selection buttons
    const modemButtons = this.element.querySelectorAll('.btn-modem');
    modemButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const modemNum = parseInt((e.target as HTMLElement).getAttribute('data-modem') || '1');
        this.setActiveModem(modemNum);
      });
    });

    // Input changes
    const inputs = this.element.querySelectorAll('input, select');
    inputs.forEach(input => {
      input.addEventListener('change', (e) => this.handleInputChange(e));
    });

    // Apply button
    const btnApply = qs('.btn-apply', this.element);
    btnApply?.addEventListener('click', () => this.applyChanges());

    // Transmit button
    const btnTransmit = qs('.btn-transmit', this.element);
    btnTransmit?.addEventListener('click', () => this.toggleTransmit());
  }

  protected initialize(): void {
    this.updateDisplay();
  }

  public sync(data: Partial<TransmitterState>): void {
    if (data.modems) {
      this.state_.modems = data.modems;
    }
    this.updateDisplay();
  }

  public getConfig(): TransmitterState {
    return { ...this.state_ };
  }

  /**
   * Private Methods
   */

  private getActiveModem(): TransmitterModem {
    return this.state_.modems.find(m => m.modem_number === this.activeModem) || this.state_.modems[0];
  }

  private setActiveModem(modemNumber: number): void {
    this.activeModem = modemNumber;
    this.inputData = { ...this.getActiveModem() };
    this.updateDisplay();
  }

  private handleInputChange(e: Event): void {
    const target = e.target as HTMLInputElement | HTMLSelectElement;
    const param = target.getAttribute('data-param');
    if (!param) return;

    let value: any = target.value;

    // Parse based on parameter type
    if (param === 'power') {
      // Allow negative numbers for power
      if (value.match(/[^0-9-]/g)) return;
      value = parseInt(value) || 0;
    } else if (param === 'frequency' || param === 'bandwidth') {
      value = parseInt(value) || 0;
    } else if (param === 'antenna_id') {
      value = parseInt(value);
    }

    this.inputData[param as keyof TransmitterModem] = value;
  }

  private applyChanges(): void {
    const activeModem = this.getActiveModem();
    const modemIndex = this.state_.modems.findIndex(m => m.modem_number === this.activeModem);

    // Calculate power consumption
    const newPower = this.calculateModemPower(
      this.inputData.bandwidth ?? activeModem.bandwidth,
      this.inputData.power ?? activeModem.power
    );

    // Check if over budget while transmitting
    if (activeModem.transmitting && !this.validatePowerConsumption(newPower)) {
      this.emit(Events.TX_ERROR, { message: 'Power consumption exceeds budget' });
      return;
    }

    // Update the modem configuration
    this.state_.modems[modemIndex] = {
      ...activeModem,
      ...this.inputData
    };

    this.emit(Events.TX_CONFIG_CHANGED, {
      unit: this.unit,
      modem: this.activeModem,
      config: this.state_.modems[modemIndex]
    });

    this.updateDisplay();
  }

  private toggleTransmit(): void {
    const activeModem = this.getActiveModem();
    const modemIndex = this.state_.modems.findIndex(m => m.modem_number === this.activeModem);

    const newTransmittingState = !activeModem.transmitting;

    // Check power budget if turning on
    if (newTransmittingState) {
      const modemPower = this.calculateModemPower(activeModem.bandwidth, activeModem.power);
      if (!this.validatePowerConsumption(modemPower)) {
        this.emit(Events.TX_ERROR, { message: 'Power consumption exceeds budget' });
        return;
      }
    }

    this.state_.modems[modemIndex].transmitting = newTransmittingState;

    this.emit(Events.TX_TRANSMIT_CHANGED, {
      unit: this.unit,
      modem: this.activeModem,
      transmitting: newTransmittingState
    });

    this.updateDisplay();
  }

  private calculateModemPower(bandwidth: number, powerDbm: number): number {
    // Power calculation: bandwidth (MHz) * 10^((120 + power) / 10)
    return bandwidth * Math.pow(10, (120 + powerDbm) / 10);
  }

  private getPowerPercentage(): number {
    const activeModem = this.getActiveModem();
    const modemPower = this.calculateModemPower(
      activeModem.bandwidth,
      activeModem.power
    );
    return Math.round((100 * modemPower) / this.powerBudget);
  }

  private validatePowerConsumption(modemPower: number): boolean {
    return Math.round((100 * modemPower) / this.powerBudget) <= 100;
  }

  private updateDisplay(): void {
    this.initializeDom();

    // Re-attach listeners after render
    this.addListeners();
  }
}