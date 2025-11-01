import { Events } from "../../events/events";
import { html, qs } from '../../utils';
import { Equipment } from "../equipment";
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
  activeModem: number;
}

/**
 * Transmitter - Single transmitter case containing 4 modems
 * Manages modem configuration and transmission state_
 * Extends Equipment base class for standard lifecycle
 */
export class Transmitter extends Equipment {
  // State
  state: TransmitterState;
  private inputData: Partial<TransmitterModem> = {};
  private lastRenderState: TransmitterState | null = null;

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

    this.state = {
      unit: this.unit,
      team_id: this.teamId,
      server_id: serverId,
      modems,
      activeModem: 1
    };

    this.build(parentId);
  }

  public update(): void {
    // No periodic updates needed for transmitter at this time
  }

  initializeDom(parentId: string): HTMLElement {
    const parentDom = super.initializeDom(parentId);

    const activeModemData = this.getActiveModem();
    const isTransmitting = this.state.modems.some(m => m.transmitting);

    parentDom.innerHTML = html`
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
            ${this.state.modems.map(modem => html`
              <button
                id="modem-${modem.modem_number}"
                class="btn-modem ${modem.modem_number === this.state.activeModem ? 'active' : ''} ${modem.transmitting ? 'transmitting' : ''}"
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

    // Cache commonly used DOM nodes for efficient updates
    this.domCache['parent'] = parentDom;
    this.domCache['status'] = qs('.transmitter-status', parentDom) as HTMLElement;
    this.state.modems.forEach(modem => {
      this.domCache[`modemButton${modem.modem_number}`] = qs(`#modem-${modem.modem_number}`, parentDom) as HTMLElement;
    });
    this.domCache['inputAntenna'] = qs('.input-tx-antenna', parentDom) as HTMLSelectElement;
    this.domCache['inputFrequency'] = qs('.input-tx-frequency', parentDom) as HTMLInputElement;
    this.domCache['inputBandwidth'] = qs('.input-tx-bandwidth', parentDom) as HTMLInputElement;
    this.domCache['inputPower'] = qs('.input-tx-power', parentDom) as HTMLInputElement;
    this.domCache['btnApply'] = qs('.btn-apply', parentDom) as HTMLElement;
    this.domCache['btnTransmit'] = qs('.btn-transmit', parentDom) as HTMLElement;
    this.domCache['powerBar'] = qs('.power-bar', parentDom) as HTMLElement;
    this.domCache['powerPercentage'] = qs('.power-percentage', parentDom) as HTMLElement;

    // Initialize lastRenderState so first render always updates
    this.lastRenderState = structuredClone(this.state);

    return parentDom;
  }

  protected addListeners(parentDom: HTMLElement): void {
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

    // Transmit button
    const btnTransmit = qs('.btn-transmit', parentDom);
    btnTransmit?.addEventListener('click', () => this.toggleTransmit());
  }

  protected initialize(): void {
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

  private getActiveModem(): TransmitterModem {
    return this.state.modems.find(m => m.modem_number === this.state.activeModem) ?? this.state.modems[0];
  }

  private setActiveModem(modemNumber: number): void {
    this.state.activeModem = modemNumber;
    this.inputData = { ...this.getActiveModem() };
    this.syncDomWithState();

    // Emit event for modem change
    this.emit(Events.TX_ACTIVE_MODEM_CHANGED, {
      unit: this.unit,
      activeModem: modemNumber
    });
  }

  private handleInputChange(e: Event): void {
    const target = e.target as HTMLInputElement | HTMLSelectElement;
    const param = target.dataset.param;
    if (!param) return;

    let value: any = target.value;

    // Parse based on parameter type
    if (param === 'power') {
      // Allow negative numbers for power
      if (value.match(/[^0-9-]/g)) return;
      value = Number.parseInt(value) || 0;
    } else if (param === 'frequency' || param === 'bandwidth') {
      value = Number.parseInt(value) || 0;
    } else if (param === 'antenna_id') {
      value = Number.parseInt(value);
    }

    this.inputData[param as keyof TransmitterModem] = value;
  }

  private applyChanges(): void {
    const activeModem = this.getActiveModem();
    const modemIndex = this.state.modems.findIndex(m => m.modem_number === this.state.activeModem);

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
    this.state.modems[modemIndex] = {
      ...activeModem,
      ...this.inputData
    };

    this.emit(Events.TX_CONFIG_CHANGED, {
      unit: this.unit,
      modem: this.state.activeModem,
      config: this.state.modems[modemIndex]
    });

    this.syncDomWithState();
  }

  private toggleTransmit(): void {
    const activeModem = this.getActiveModem();
    const modemIndex = this.state.modems.findIndex(m => m.modem_number === this.state.activeModem);

    const newTransmittingState = !activeModem.transmitting;

    // Check power budget if turning on
    if (newTransmittingState) {
      const modemPower = this.calculateModemPower(activeModem.bandwidth, activeModem.power);
      if (!this.validatePowerConsumption(modemPower)) {
        this.emit(Events.TX_ERROR, { message: 'Power consumption exceeds budget' });
        return;
      }
    }

    this.state.modems[modemIndex].transmitting = newTransmittingState;

    this.emit(Events.TX_TRANSMIT_CHANGED, {
      unit: this.unit,
      modem: this.state.activeModem,
      transmitting: newTransmittingState
    });

    this.syncDomWithState();
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

  syncDomWithState(): void {
    // Avoid unnecessary DOM updates by shallow comparing serialized state
    if (JSON.stringify(this.state) === JSON.stringify(this.lastRenderState)) {
      return; // No changes, skip update
    }

    const parentDom = this.domCache['parent'];

    // Update status
    const isTransmitting = this.state.modems.some(m => m.transmitting);
    if (this.domCache['status']) {
      (this.domCache['status']).className = `transmitter-status ${isTransmitting ? 'status-active' : 'status-standby'}`;
      (this.domCache['status']).textContent = isTransmitting ? 'TRANSMITTING' : 'STANDBY';
    }

    // Update modem buttons
    const modemButtons = parentDom.querySelectorAll('.btn-modem');
    modemButtons.forEach((btn) => {
      const modemNum = Number((btn as HTMLElement).dataset['modem']);
      const modem = this.state.modems.find(m => m.modem_number === modemNum);
      const isActive = modemNum === this.state.activeModem;
      const transmittingClass = modem?.transmitting ? 'transmitting' : '';
      btn.className = `btn-modem ${isActive ? 'active' : ''} ${transmittingClass}`.trim();
    });

    // Sync active modem inputs
    const activeModem = this.getActiveModem();

    if (this.domCache['inputAntenna']) {
      const sel = this.domCache['inputAntenna'] as HTMLSelectElement;
      for (const element of sel.options) {
        element.selected = Number(element.value) === (this.inputData.antenna_id ?? activeModem.antenna_id);
      }
    }

    if (this.domCache['inputFrequency']) {
      (this.domCache['inputFrequency'] as HTMLInputElement).value = String(this.inputData.frequency ?? activeModem.frequency ?? '');
    }

    if (this.domCache['inputBandwidth']) {
      (this.domCache['inputBandwidth'] as HTMLInputElement).value = String(this.inputData.bandwidth ?? activeModem.bandwidth ?? '');
    }

    if (this.domCache['inputPower']) {
      (this.domCache['inputPower'] as HTMLInputElement).value = String(this.inputData.power ?? activeModem.power ?? '');
    }

    // Update current-value labels (antenna, freq, bw, power)
    const currentValueEls = parentDom.querySelectorAll('.tx-modem-config .current-value');
    if (activeModem && currentValueEls.length >= 4) {
      (currentValueEls[0] as HTMLElement).textContent = String(activeModem.antenna_id);
      (currentValueEls[1] as HTMLElement).textContent = `${activeModem.frequency} MHz`;
      (currentValueEls[2] as HTMLElement).textContent = `${activeModem.bandwidth} MHz`;
      (currentValueEls[3] as HTMLElement).textContent = `${activeModem.power} dBm`;
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
    if (this.domCache['btnTransmit']) {
      const btn = this.domCache['btnTransmit'];
      btn.className = `btn-transmit ${activeModem.transmitting ? 'active' : ''}`;
    }

    // Save snapshot
    this.lastRenderState = structuredClone(this.state);
  }
}