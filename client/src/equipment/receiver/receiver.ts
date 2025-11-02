import { html } from "../../engine/ui/utils/development/formatter";
import { qs } from "../../engine/ui/utils/query-selector";
import { Events } from "../../events/events";
import { FECType, Hertz, MHz, ModulationType } from "../../types";
import { Equipment } from "../equipment";
import { Antenna } from './../antenna/antenna';
import './receiver.css';

export interface ReceiverModemState {
  modemNumber: number; // 1-4
  antennaId: number;
  frequency: MHz; // MHz
  bandwidth: MHz; // MHz
  modulation: ModulationType;
  fec: FECType;
}

export interface ReceiverState {
  unit: number; // Case number 1-4
  team_id: number;
  server_id: number;
  modems: ReceiverModemState[];
  activeModem: number;
}

/**
 * Receiver - Single receiver case containing 4 modems
 * Manages modem configuration and signal reception state
 * Extends Equipment base class for standard lifecycle
 */
export class Receiver extends Equipment {
  state: ReceiverState;
  private inputData: Partial<ReceiverModemState> = {};
  private readonly antennas: Antenna[];
  private lastRenderState: ReceiverState | null = null;

  constructor(parentId: string, unit: number, antennas: Antenna[], teamId: number = 1, serverId: number = 1) {
    super(parentId, unit, teamId);

    this.antennas = antennas;

    // Initialize config with 4 modems
    const modems: ReceiverModemState[] = [];
    for (let i = 1; i <= 4; i++) {
      modems.push({
        modemNumber: i,
        antennaId: i <= 2 ? antennas[0].state.id : antennas[1]?.state.id ?? antennas[0].state.id,
        frequency: 4700 as MHz, // (IF Band after downconversion)
        bandwidth: 50 as MHz,
        modulation: 'QPSK' as ModulationType,
        fec: '3/4' as FECType,
      });
    }

    this.state = {
      unit: this.unit,
      team_id: this.teamId,
      server_id: serverId,
      modems,
      activeModem: 1,
    };

    this.build(parentId);
  }

  update(): void {
    this.syncDomWithState();
  }

  initializeDom(parentId: string): HTMLElement {
    const parentDom = super.initializeDom(parentId);
    const activeModemData = this.getActiveModem();
    const signalStatus = this.getSignalStatus();
    const feedUrl = this.getVisibleSignals()[0]?.feed || '';

    parentDom.innerHTML = html`
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
            ${this.state.modems.map(modem => html`
              <button id="modem-${modem.modemNumber}"
                class="btn-modem ${modem.modemNumber === this.state.activeModem ? 'active' : ''} ${this.getModemStatusClass(modem)}"
                data-modem="${modem.modemNumber}">
                ${modem.modemNumber}
              </button>
            `).join('')}
          </div>

          <!-- Main content area with config and video side by side -->
          <div class="receiver-main-content">
            <!-- Active Modem Configuration -->
            <div class="rx-modem-config">
              <div class="config-row">
                <label>Antenna</label>
                <select class="input-rx-antenna" data-param="antennaId">
                  <option value="1" ${this.inputData.antennaId === this.antennas[0]?.state.id ? 'selected' : ''}>1</option>
                  <option value="2" ${this.inputData.antennaId === this.antennas[1]?.state.id ? 'selected' : ''}>2</option>
                </select>
                <span class="current-value">${activeModemData?.antennaId}</span>
              </div>

              <div class="config-row">
                <label>Freq (MHz)</label>
                <input
                  type="text"
                  class="input-rx-frequency"
                  data-param="frequency"
                  value="${this.inputData.frequency ?? activeModemData?.frequency}"
                />
                <span class="current-value">${activeModemData?.frequency} MHz</span>
              </div>

              <div class="config-row">
                <label>BW (MHz)</label>
                <input
                  type="text"
                  class="input-rx-bandwidth"
                  data-param="bandwidth"
                  value="${this.inputData.bandwidth ?? activeModemData?.bandwidth}"
                />
                <span class="current-value">${activeModemData?.bandwidth} MHz</span>
              </div>

              <div class="config-row">
                <label>Modulation</label>
                <select class="input-rx-modulation" data-param="modulation">
                  <option value="BPSK" ${this.inputData.modulation === 'BPSK' ? 'selected' : ''}>BPSK</option>
                  <option value="QPSK" ${this.inputData.modulation === 'QPSK' ? 'selected' : ''}>QPSK</option>
                  <option value="8QAM" ${this.inputData.modulation === '8QAM' ? 'selected' : ''}>8QAM</option>
                  <option value="16QAM" ${this.inputData.modulation === '16QAM' ? 'selected' : ''}>16QAM</option>
                </select>
                <span class="current-value">${activeModemData?.modulation}</span>
              </div>

              <div class="config-row">
                <label>FEC</label>
                <select class="input-rx-fec" data-param="fec">
                  <option value="1/2" ${this.inputData.fec === '1/2' ? 'selected' : ''}>1/2</option>
                  <option value="2/3" ${this.inputData.fec === '2/3' ? 'selected' : ''}>2/3</option>
                  <option value="3/4" ${this.inputData.fec === '3/4' ? 'selected' : ''}>3/4</option>
                  <option value="5/6" ${this.inputData.fec === '5/6' ? 'selected' : ''}>5/6</option>
                  <option value="7/8" ${this.inputData.fec === '7/8' ? 'selected' : ''}>7/8</option>
                </select>
                <span class="current-value">${activeModemData?.fec}</span>
              </div>

              <div class="config-actions">
                <button class="btn-apply" data-action="apply">Apply</button>
              </div>
            </div>

            <!-- Video Monitor -->
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
          </div>
        </div>
      </div>
    `;

    // Cache frequently used DOM nodes for efficient updates
    this.domCache['parent'] = parentDom;
    this.domCache['status'] = qs('.receiver-status', parentDom) as HTMLElement;
    this.state.modems.forEach(modem => {
      this.domCache[`modemButton${modem.modemNumber}`] = qs(`#modem-${modem.modemNumber}`, parentDom) as HTMLElement;
    });
    this.domCache['inputAntenna'] = qs('.input-rx-antenna', parentDom) as HTMLSelectElement;
    this.domCache['inputFrequency'] = qs('.input-rx-frequency', parentDom) as HTMLInputElement;
    this.domCache['inputBandwidth'] = qs('.input-rx-bandwidth', parentDom) as HTMLInputElement;
    this.domCache['inputModulation'] = qs('.input-rx-modulation', parentDom) as HTMLSelectElement;
    this.domCache['inputFec'] = qs('.input-rx-fec', parentDom) as HTMLSelectElement;
    this.domCache['btnApply'] = qs('.btn-apply', parentDom) as HTMLElement;
    this.domCache['monitorScreen'] = qs('.monitor-screen', parentDom) as HTMLElement;

    const currentValueEls = parentDom.querySelectorAll('.current-value');
    this.domCache['currentValueAntenna'] = currentValueEls[0] as HTMLElement;
    this.domCache['currentValueFrequency'] = currentValueEls[1] as HTMLElement;
    this.domCache['currentValueBandwidth'] = currentValueEls[2] as HTMLElement;
    this.domCache['currentValueModulation'] = currentValueEls[3] as HTMLElement;
    this.domCache['currentValueFec'] = currentValueEls[4] as HTMLElement;

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
  }

  protected initialize(): void {
    this.syncDomWithState();

    // Listen for antenna changes
    this.subscribeToAntennaEvents();
  }

  private subscribeToAntennaEvents() {
    this.on(Events.ANTENNA_CONFIG_CHANGED, () => {
      this.syncDomWithState();
    });

    this.on(Events.ANTENNA_ERROR, () => {
      this.syncDomWithState();
    });

    this.on(Events.ANTENNA_HPA_CHANGED, () => {
      this.syncDomWithState();
    });

    this.on(Events.ANTENNA_LOCKED, () => {
      this.syncDomWithState();
    });

    this.on(Events.ANTENNA_LOOPBACK_CHANGED, () => {
      this.syncDomWithState();
    });

    this.on(Events.ANTENNA_POWER_CHANGED, () => {
      this.syncDomWithState();
    });

    this.on(Events.ANTENNA_TRACK_CHANGED, () => {
      this.syncDomWithState();
    });
  }

  public sync(data: Partial<ReceiverState>): void {
    if (data.modems) {
      this.state.modems = data.modems;
    }
    this.state.activeModem = data.activeModem ?? this.state.activeModem;
    this.syncDomWithState();
  }

  /**
   * Private Methods
   */

  private getActiveModem(): ReceiverModemState {
    return this.state.modems.find(m => m.modemNumber === this.state.activeModem) ?? this.state.modems[0];
  }

  private setActiveModem(modemNumber: number): void {
    this.state.activeModem = modemNumber;
    this.inputData = { ...this.getActiveModem() };
    this.syncDomWithState();

    // Emit event for modem change
    this.emit(Events.RX_ACTIVE_MODEM_CHANGED, {
      unit: this.unit,
      activeModem: modemNumber
    });
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
        this.inputData.antennaId = this.antennas.find(a => a.state.id === Number.parseInt(inputValue))?.state.id;
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
    const modemIndex = this.state.modems.findIndex(m => m.modemNumber === this.state.activeModem);

    if (!activeModem || modemIndex === -1) return;

    // Update the modem configuration
    this.state.modems[modemIndex] = {
      ...activeModem,
      ...this.inputData,
    };

    this.emit(Events.RX_CONFIG_CHANGED, {
      unit: this.unit,
      modem: this.state.activeModem,
      config: this.state.modems[modemIndex]
    });

    this.syncDomWithState();
  }

  private getSignalStatus(): { text: string; class: string } {
    const visibleSignals = this.getVisibleSignals();

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

    const activeAntenna = this.antennas.find(a => a.state.id === activeModemData.antennaId);

    if (!activeAntenna) return [];

    // Figure out which signals match the receiver settings
    const visibleSignals = activeAntenna.state.signals.filter((s) => {
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
          // Outside 10% but within 50%: degraded-
        } else if (!s.feed.startsWith('degraded-')) {
          s.feed = `degraded-${s.feed.replace(/^degraded-/, '')}`;
        }
        return s;
      });
  }

  private getModemStatusClass(modem: ReceiverModemState): string {
    const signals = this.getVisibleSignals(modem);
    const denied = signals.find(signal => signal.feed.includes('DENIED'));
    if (denied) return 'modem-denied';

    const degraded = signals.find(signal => signal.feed.includes('DEGRADED'));
    if (degraded) return 'modem-degraded';

    if (signals.length > 0) return 'modem-found';

    return '';
  }

  syncDomWithState(): void {
    // Avoid unnecessary DOM updates by shallow comparing serialized state
    if (JSON.stringify(this.state) === JSON.stringify(this.lastRenderState)) {
      return; // No changes, skip update
    }

    const parentDom = this.domCache['parent'];

    // Update status banner
    const signalStatus = this.getSignalStatus();
    if (this.domCache['status']) {
      (this.domCache['status']).className = `receiver-status ${signalStatus.class}`;
      (this.domCache['status']).textContent = signalStatus.text;
    }

    // Update modem buttons active & status classes
    const modemButtons = parentDom.querySelectorAll('.btn-modem');
    modemButtons.forEach((btn) => {
      const modemNum = Number((btn as HTMLElement).dataset.modem);
      const modem = this.state.modems.find(m => m.modemNumber === modemNum);
      const isActive = modemNum === this.state.activeModem;
      const statusClass = modem ? this.getModemStatusClass(modem) : '';
      btn.className = `btn-modem ${isActive ? 'active' : ''} ${statusClass}`.trim();
    });

    // Sync active modem display and inputs
    const activeModem = this.getActiveModem();

    if (this.domCache['inputAntenna']) {
      const sel = this.domCache['inputAntenna'] as HTMLSelectElement;
      // Try to select the option matching antenna id
      for (const option of sel.options) {
        option.selected = Number(option.value) === (this.inputData.antennaId ?? activeModem?.antennaId);
      }
    }

    (this.domCache['inputFrequency'] as HTMLInputElement).value = String(this.inputData.frequency ?? activeModem?.frequency ?? '');
    (this.domCache['inputBandwidth'] as HTMLInputElement).value = String(this.inputData.bandwidth ?? activeModem?.bandwidth ?? '');
    (this.domCache['inputModulation'] as HTMLSelectElement).value = String(this.inputData.modulation ?? activeModem?.modulation ?? '');
    (this.domCache['inputFec'] as HTMLSelectElement).value = String(this.inputData.fec ?? activeModem?.fec ?? '');

    (this.domCache['currentValueAntenna']).textContent = String(activeModem.antennaId);
    (this.domCache['currentValueFrequency']).textContent = `${activeModem.frequency} MHz`;
    (this.domCache['currentValueBandwidth']).textContent = `${activeModem.bandwidth} MHz`;
    (this.domCache['currentValueModulation']).textContent = String(activeModem.modulation);
    (this.domCache['currentValueFec']).textContent = String(activeModem.fec);

    // Update monitor / video feed
    const feedUrl = this.getVisibleSignals()[0]?.feed || '';
    const monitor = this.domCache['monitorScreen'];
    if (monitor) {
      monitor.className = `monitor-screen ${feedUrl.length > 0 ? 'signal-found' : 'no-signal'}`;
      if (feedUrl.length > 0) {
        const videoEl = qs('.video-feed', monitor) as HTMLVideoElement;
        if (videoEl) {
          videoEl.src = `/videos/${feedUrl}`;
        } else {
          monitor.innerHTML = `<div class="signal-indicator"><video class="video-feed" src="/videos/${feedUrl}" alt="Video Feed" autoplay muted loop></video></div>`;
        }
      } else {
        monitor.innerHTML = `<span class="no-signal-text">NO SIGNAL</span>`;
      }
    }

    // Save render snapshot
    this.lastRenderState = structuredClone(this.state);
  }
}