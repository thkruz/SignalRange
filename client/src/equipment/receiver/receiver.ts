import { Events } from "../../events/events";
import { FECType, Hertz, MHz, ModulationType } from "../../types";
import { html, qs } from '../../utils';
import { Equipment } from '../equipment';
import { Antenna } from './../antenna/antenna';
import './receiver.css';

export interface ReceiverModem {
  modemNumber: number; // 1-4
  antenna: Antenna;
  frequency: MHz; // MHz
  bandwidth: MHz; // MHz
  modulation: ModulationType;
  fec: FECType;
}

export interface ReceiverConfig {
  unit: number; // Case number 1-4
  team_id: number;
  server_id: number;
  modems: ReceiverModem[];
}

// RX Event specific interfaces
export interface RxConfigChangedData {
  unit: number;
  modem: number;
  config: ReceiverModem;
}

export interface RxSignalFoundData {
  unit: number;
  modem: number;
}

export interface RxSignalLostData {
  unit: number;
  modem: number;
}

/**
 * Receiver - Single receiver case containing 4 modems
 * Manages modem configuration and signal reception state
 * Extends Equipment base class for standard lifecycle
 */
export class Receiver extends Equipment {
  // State
  private readonly config: ReceiverConfig;
  private activeModem: number = 1;
  private inputData: Partial<ReceiverModem> = {};
  private readonly antennas: Antenna[];

  constructor(parentId: string, unit: number, antennas: Antenna[], teamId: number = 1, serverId: number = 1) {
    super(parentId, unit, teamId);

    this.antennas = antennas;

    // Initialize config with 4 modems
    const modems: ReceiverModem[] = [];
    for (let i = 1; i <= 4; i++) {
      modems.push({
        modemNumber: i,
        antenna: i <= 2 ? antennas[0] : antennas[1],
        frequency: 4700 as MHz, // (IF Band after downconversion)
        bandwidth: 50 as MHz,
        modulation: 'QPSK' as ModulationType,
        fec: '3/4' as FECType,
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

  syncInputToConfig(): void {
    const activeModem = this.getActiveModem();
    Object.assign(this.inputData, activeModem);

    this.updateDisplay();
  }

  render(): HTMLElement {
    const activeModemData = this.getActiveModem();
    const signalStatus = this.getSignalStatus();
    const feedUrl = this.getVisibleSignals()[0]?.feed || '';

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
                class="btn-modem ${modem.modemNumber === this.activeModem ? 'active' : ''} ${this.getModemStatusClass(modem)}"
                data-modem="${modem.modemNumber}">
                ${modem.modemNumber}
              </button>
            `).join('')}
          </div>

          <!-- Active Modem Configuration -->
          <div class="modem-config">
            <div class="config-row">
              <label>Antenna</label>
              <select class="input-antenna" data-param="antenna">
                <option value="1" ${this.inputData.antenna?.config.id === this.antennas[0]?.config.id ? 'selected' : ''}>1</option>
                <option value="2" ${this.inputData.antenna?.config.id === this.antennas[1]?.config.id ? 'selected' : ''}>2</option>
              </select>
              <span class="current-value">${activeModemData?.antenna.config.id}</span>
            </div>

            <div class="config-row">
              <label>Freq (MHz)</label>
              <input
                type="text"
                class="input-frequency"
                data-param="frequency"
                value="${this.inputData.frequency ?? activeModemData?.frequency}"
              />
              <span class="current-value">${activeModemData?.frequency} MHz</span>
            </div>

            <div class="config-row">
              <label>BW (MHz)</label>
              <input
                type="text"
                class="input-bandwidth"
                data-param="bandwidth"
                value="${this.inputData.bandwidth ?? activeModemData?.bandwidth}"
              />
              <span class="current-value">${activeModemData?.bandwidth} MHz</span>
            </div>

            <div class="config-row">
              <label>Modulation</label>
              <select class="input-modulation" data-param="modulation">
                <option value="BPSK" ${this.inputData.modulation === 'BPSK' ? 'selected' : ''}>BPSK</option>
                <option value="QPSK" ${this.inputData.modulation === 'QPSK' ? 'selected' : ''}>QPSK</option>
                <option value="8QAM" ${this.inputData.modulation === '8QAM' ? 'selected' : ''}>8QAM</option>
                <option value="16QAM" ${this.inputData.modulation === '16QAM' ? 'selected' : ''}>16QAM</option>
              </select>
              <span class="current-value">${activeModemData?.modulation}</span>
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
              <span class="current-value">${activeModemData?.fec}</span>
            </div>

            <!-- Video Monitor Placeholder -->
            <div class="video-monitor">
              <div class="monitor-screen ${feedUrl.length > 0 ? 'signal-found' : 'no-signal'}">
                ${feedUrl.length > 0
        ? html`<div class="signal-indicator">
                      <video class="video-feed" src="/videos/${feedUrl}" alt="Video Feed" autoplay muted loop />
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

  private subscribeToAntennaEvents() {
    this.on(Events.ANTENNA_CONFIG_CHANGED, () => {
      this.updateDisplay();
    });

    this.on(Events.ANTENNA_ERROR, () => {
      this.updateDisplay();
    });

    this.on(Events.ANTENNA_HPA_CHANGED, () => {
      this.updateDisplay();
    });

    this.on(Events.ANTENNA_LOCKED, () => {
      this.updateDisplay();
    });

    this.on(Events.ANTENNA_LOOPBACK_CHANGED, () => {
      this.updateDisplay();
    });

    this.on(Events.ANTENNA_POWER_CHANGED, () => {
      this.updateDisplay();
    });

    this.on(Events.ANTENNA_TRACK_CHANGED, () => {
      this.updateDisplay();
    });
  }

  protected initialize(): void {
    this.updateDisplay();

    // Listen for antenna changes
    this.subscribeToAntennaEvents();
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

  private getActiveModem(): ReceiverModem | undefined {
    return this.config.modems.find(m => m.modemNumber === this.activeModem) || this.config.modems[0];
  }

  private setActiveModem(modemNumber: number): void {
    this.activeModem = modemNumber;
    this.inputData = { ...this.getActiveModem() };
    this.updateDisplay();
  }

  private handleInputChange(e: Event): void {
    const target = e.target as HTMLInputElement | HTMLSelectElement;
    const param = target.dataset.param;
    if (!param) return;

    const inputValue = target.value;

    // Parse based on parameter type
    switch (param) {
      case 'frequency':
        this.inputData.frequency = Number.parseInt(inputValue) as MHz || 0 as MHz;
        break;
      case 'bandwidth':
        this.inputData.bandwidth = (Number.parseInt(inputValue) as MHz) || 0 as MHz;
        break;
      case 'antenna':
        this.inputData.antenna = this.antennas.find(a => a.config.id === Number.parseInt(inputValue)) as Antenna;
        break;
      case 'modulation':
        this.inputData.modulation = inputValue as ModulationType;
        break;
      case 'fec':
        this.inputData.fec = inputValue as FECType;
        break;
    }
  }

  private applyChanges(): void {
    const activeModem = this.getActiveModem();
    const modemIndex = this.config.modems.findIndex(m => m.modemNumber === this.activeModem);

    if (!activeModem || modemIndex === -1) return;

    // Update the modem configuration
    this.config.modems[modemIndex] = {
      ...activeModem,
      ...this.inputData,
    };

    this.emit(Events.RX_CONFIG_CHANGED, {
      unit: this.unit,
      modem: this.activeModem,
      config: this.config.modems[modemIndex]
    });

    this.updateDisplay();
  }

  private getSignalStatus(): { text: string; class: string } {
    const visibleSignals = this.getVisibleSignals();

    // TODO: This logic is wrong, but will work for now!

    // If 1 then good signal
    if (visibleSignals.length === 1) {
      return { text: 'SIGNAL FOUND', class: 'status-signal-found' };
    }

    // If 2 then degraded
    if (visibleSignals.length === 2) {
      return { text: 'SIGNAL DEGRADED', class: 'status-signal-degraded' };
    }

    // If more than 2 then denied
    if (visibleSignals.length > 2) {
      return { text: 'SIGNAL DENIED', class: 'status-signal-denied' };
    }

    return { text: 'NO SIGNAL', class: 'status-no-signal' };
  }

  private getVisibleSignals(activeModemData = this.getActiveModem()) {
    if (!activeModemData) return [];

    const activeAntenna = activeModemData.antenna;

    if (!activeAntenna) return [];

    // Figure out which signals match the receiver settings
    const visibleSignals = activeAntenna.signals.filter((s) => {
      if (s.bandwidth > (activeModemData.bandwidth * 1e6 as Hertz)) {
        return false;
      }
      if (s.frequency + (s.bandwidth * 1e6 as Hertz) / 2 < activeModemData.frequency - activeModemData.bandwidth / 2) {
        return false;
      }
      if (s.frequency - (s.bandwidth * 1e6 as Hertz) / 2 > activeModemData.frequency + activeModemData.bandwidth / 2) {
        return false;
      }

      if (s.modulation !== activeModemData.modulation) {
        return false;
      }
      if (s.fec !== activeModemData.fec) {
        return false;
      }
      return true;
    });

    return visibleSignals
      .filter((s) => {
        const frequencyMhz = s.frequency / 1e6 as MHz;
        const freqTolerance50 = activeModemData.bandwidth * 0.5;
        const lowerBound50 = activeModemData.frequency - freqTolerance50;
        const upperBound50 = activeModemData.frequency + freqTolerance50;
        // Filter out signals more than 50% outside center frequency
        return frequencyMhz >= lowerBound50 && frequencyMhz <= upperBound50;
      })
      .map((s) => {
        const frequencyMhz = s.frequency / 1e6 as MHz;
        const freqTolerance10 = activeModemData.bandwidth * 0.1;
        const lowerBound10 = activeModemData.frequency - freqTolerance10;
        const upperBound10 = activeModemData.frequency + freqTolerance10;
        // Within 10%: no prefix
        if (frequencyMhz >= lowerBound10 && frequencyMhz <= upperBound10) {
          s.feed = s.feed.replace(/^degraded-/, '');
        } else {
          // Outside 10% but within 50%: degraded-
          if (!s.feed.startsWith('degraded-')) {
            s.feed = `degraded-${s.feed.replace(/^degraded-/, '')}`;
          }
        }
        return s;
      });
  }

  private getModemStatusClass(modem: ReceiverModem): string {
    for (const signal of this.getVisibleSignals(modem)) {
      if (signal.isActive) {
        if (signal.feed.includes('DENIED')) {
          return 'modem-denied';
        } else if (signal.feed.includes('DEGRADED')) {
          return 'modem-degraded';
        } else {
          return 'modem-found';
        }
      }
    }
    return '';
  }

  updateDisplay(): void {
    this.render();

    // Re-attach listeners after render
    this.addListeners();
  }
}