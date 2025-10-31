import { Events } from "../../events/Events";
import { html, qs } from '../../utils';
import { Equipment } from '../equipment';
import './receiver.css';

export type ModulationType = 'BPSK' | 'QPSK' | '8QAM' | '16QAM';
export type FECType = '1/2' | '2/3' | '3/4' | '5/6' | '7/8';

export interface ReceiverModem {
  modem_number: number; // 1-4
  antenna_id: number;
  frequency: number; // MHz
  bandwidth: number; // MHz
  modulation: ModulationType;
  fec: FECType;
  found: boolean; // Signal found
  degraded: boolean; // Signal degraded
  denied: boolean; // Signal denied
}

export interface ReceiverConfig {
  unit: number; // Case number 1-4
  team_id: number;
  server_id: number;
  modems: ReceiverModem[];
}

/**
 * Receiver - Single receiver case containing 4 modems
 * Manages modem configuration and signal reception state
 * Extends Equipment base class for standard lifecycle
 */
export class Receiver extends Equipment {
  // State
  private config: ReceiverConfig;
  private activeModem: number = 1;
  private inputData: Partial<ReceiverModem> = {};

  constructor(parentId: string, unit: number, teamId: number = 1, serverId: number = 1) {
    super(parentId, unit, teamId);

    // Initialize config with 4 modems
    const modems: ReceiverModem[] = [];
    for (let i = 1; i <= 4; i++) {
      modems.push({
        modem_number: i,
        antenna_id: 1,
        frequency: 4700, // MHz (IF Band after downconversion)
        bandwidth: 50, // MHz
        modulation: 'QPSK',
        fec: '3/4',
        found: false,
        degraded: false,
        denied: false
      });
    }

    this.config = {
      unit: this.unit,
      team_id: this.teamId,
      server_id: serverId,
      modems
    };

    this.inputData = { ...this.getActiveModem() };
    this.build();
  }

  protected loadCSS(): void {
    // CSS is imported at the top of the file
  }

  render(): HTMLElement {
    const activeModemData = this.getActiveModem();
    const signalStatus = this.getSignalStatus();

    this.element.innerHTML = html`
      <div class="receiver-box">
        <div class="receiver-header">
          <div class="receiver-title">Receiver Case ${this.unit}</div>
          <div class="receiver-status ${signalStatus.class}">
            ${signalStatus.text}
          </div>
        </div>

        <div class="receiver-controls">
          <!-- Modem Selection Buttons -->
          <div class="modem-buttons">
            ${this.config.modems.map(modem => html`
              <button
                class="btn-modem ${modem.modem_number === this.activeModem ? 'active' : ''} ${this.getModemStatusClass(modem)}"
                data-modem="${modem.modem_number}">
                ${modem.modem_number}
              </button>
            `).join('')}
          </div>

          <!-- Active Modem Configuration -->
          <div class="modem-config">
            <div class="config-row">
              <label>Antenna</label>
              <select class="input-antenna" data-param="antenna_id">
                <option value="1" ${this.inputData.antenna_id === 1 ? 'selected' : ''}>1</option>
                <option value="2" ${this.inputData.antenna_id === 2 ? 'selected' : ''}>2</option>
              </select>
              <span class="current-value">${activeModemData.antenna_id}</span>
            </div>

            <div class="config-row">
              <label>Freq (MHz)</label>
              <input
                type="text"
                class="input-frequency"
                data-param="frequency"
                value="${this.inputData.frequency ?? activeModemData.frequency}"
              />
              <span class="current-value">${activeModemData.frequency} MHz</span>
            </div>

            <div class="config-row">
              <label>BW (MHz)</label>
              <input
                type="text"
                class="input-bandwidth"
                data-param="bandwidth"
                value="${this.inputData.bandwidth ?? activeModemData.bandwidth}"
              />
              <span class="current-value">${activeModemData.bandwidth} MHz</span>
            </div>

            <div class="config-row">
              <label>Modulation</label>
              <select class="input-modulation" data-param="modulation">
                <option value="BPSK" ${this.inputData.modulation === 'BPSK' ? 'selected' : ''}>BPSK</option>
                <option value="QPSK" ${this.inputData.modulation === 'QPSK' ? 'selected' : ''}>QPSK</option>
                <option value="8QAM" ${this.inputData.modulation === '8QAM' ? 'selected' : ''}>8QAM</option>
                <option value="16QAM" ${this.inputData.modulation === '16QAM' ? 'selected' : ''}>16QAM</option>
              </select>
              <span class="current-value">${activeModemData.modulation}</span>
            </div>

            <div class="config-row">
              <label>FEC</label>
              <select class="input-fec" data-param="fec">
                <option value="1/2" ${this.inputData.fec === '1/2' ? 'selected' : ''}>1/2</option>
                <option value="2/3" ${this.inputData.fec === '2/3' ? 'selected' : ''}>2/3</option>
                <option value="3/4" ${this.inputData.fec === '3/4' ? 'selected' : ''}>3/4</option>
                <option value="5/6" ${this.inputData.fec === '5/6' ? 'selected' : ''}>5/6</option>
                <option value="7/8" ${this.inputData.fec === '7/8' ? 'selected' : ''}>7/8</option>
              </select>
              <span class="current-value">${activeModemData.fec}</span>
            </div>

            <!-- Video Monitor Placeholder -->
            <div class="video-monitor">
              <div class="monitor-screen ${activeModemData.found ? 'signal-found' : 'no-signal'}">
                ${activeModemData.found
        ? html`<div class="signal-indicator">
                      <div class="signal-bars"></div>
                      <span>SIGNAL ACQUIRED</span>
                    </div>`
        : html`<span class="no-signal-text">NO SIGNAL</span>`
      }
              </div>
            </div>

            <div class="config-actions">
              <button class="btn-apply" data-action="apply">Apply</button>
            </div>
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
  }

  protected initialize(): void {
    this.updateDisplay();
  }

  public update(data: Partial<ReceiverConfig>): void {
    if (data.modems) {
      this.config.modems = data.modems;
    }
    this.updateDisplay();
  }

  public getConfig(): ReceiverConfig {
    return { ...this.config };
  }

  /**
   * Private Methods
   */

  private getActiveModem(): ReceiverModem {
    return this.config.modems.find(m => m.modem_number === this.activeModem) || this.config.modems[0];
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
    if (param === 'frequency' || param === 'bandwidth') {
      value = parseInt(value) || 0;
    } else if (param === 'antenna_id') {
      value = parseInt(value);
    }
    // modulation and fec are strings, keep as-is

    this.inputData[param as keyof ReceiverModem] = value;
  }

  private applyChanges(): void {
    const activeModem = this.getActiveModem();
    const modemIndex = this.config.modems.findIndex(m => m.modem_number === this.activeModem);

    // Update the modem configuration
    this.config.modems[modemIndex] = {
      ...activeModem,
      ...this.inputData,
      // Keep signal status flags (these are set by server/simulation)
      found: activeModem.found,
      degraded: activeModem.degraded,
      denied: activeModem.denied
    };

    this.emit(Events.RX_CONFIG_CHANGED, {
      unit: this.unit,
      modem: this.activeModem,
      config: this.config.modems[modemIndex]
    });

    this.updateDisplay();
  }

  private getSignalStatus(): { text: string; class: string } {
    const hasSignalFound = this.config.modems.some(m => m.found);
    const hasSignalDegraded = this.config.modems.some(m => m.degraded);
    const hasSignalDenied = this.config.modems.some(m => m.denied);

    if (hasSignalFound && !hasSignalDegraded && !hasSignalDenied) {
      return { text: 'SIGNAL FOUND', class: 'status-found' };
    } else if (hasSignalFound && hasSignalDegraded && !hasSignalDenied) {
      return { text: 'SIGNAL DEGRADED', class: 'status-degraded' };
    } else if (hasSignalFound && hasSignalDenied) {
      return { text: 'SIGNAL DENIED', class: 'status-denied' };
    } else {
      return { text: 'NO SIGNAL', class: 'status-standby' };
    }
  }

  private getModemStatusClass(modem: ReceiverModem): string {
    if (modem.denied) return 'modem-denied';
    if (modem.degraded) return 'modem-degraded';
    if (modem.found) return 'modem-found';
    return '';
  }

  private updateDisplay(): void {
    this.render();

    // Re-attach listeners after render
    this.addListeners();
  }
}