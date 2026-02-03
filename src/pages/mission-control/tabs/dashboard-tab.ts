import { GroundStation } from "@app/assets/ground-station/ground-station";
import { BaseElement } from "@app/components/base-element";
import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import { EventBus } from "@app/events/event-bus";
import { Events } from "@app/events/events";
import antennaPng from '../../../assets/icons/antenna.png';
import modemPng from '../../../assets/icons/radio.png';
import receiverPng from '../../../assets/icons/arrow-big-down-lines.png';
import transmitterPng from '../../../assets/icons/arrow-big-up-lines.png';
import './dashboard-tab.css';

interface AlarmEntry {
  id: string;
  level: 'critical' | 'warning' | 'info';
  message: string;
  timestamp: Date;
}

/**
 * DashboardTab - Ground station overview and status display
 *
 * Displays:
 * - Station identification and location
 * - Equipment summary counts
 * - Operational status
 * - Active alarms list
 */
export class DashboardTab extends BaseElement {
  private static readonly UPDATE_INTERVAL_MS = 1000;

  private readonly groundStation: GroundStation;
  private readonly domCache_: Map<string, HTMLElement> = new Map();
  private readonly alarms_: AlarmEntry[] = [];
  private updateHandler_: (() => void) | null = null;
  private lastSyncTime_: number = 0;

  constructor(groundStation: GroundStation, containerId: string) {
    super();
    this.groundStation = groundStation;

    // Ensure equipment is initialized
    if (this.groundStation.antennas.length === 0) {
      this.groundStation.initializeEquipment();
    }

    this.init_(containerId, 'replace');
    this.dom_ = qs('.dashboard-tab');

    this.cacheDomElements_();
    this.syncDomWithState_();
  }

  protected get html_(): string {
    const gs = this.groundStation;
    const loc = gs.state.location;

    return html`
      <div class="dashboard-tab">
        <div class="row g-2 pb-6">
          <!-- Station Info Card -->
          <div class="col-lg-4">
            <div class="card h-100">
              <div class="card-header">
                <h3 class="card-title">Station Information</h3>
              </div>
              <div class="card-body">
                <div class="d-flex align-items-center mb-3">
                  <img src="${antennaPng}" alt="Station" class="station-icon-lg me-3" />
                  <div>
                    <h4 class="mb-0">${gs.state.name}</h4>
                    <span class="text-muted small">${gs.state.id}</span>
                  </div>
                </div>
                <hr class="my-2" />
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <span class="text-muted small">Latitude:</span>
                  <span class="fw-bold font-monospace">${loc.latitude.toFixed(4)}&deg;</span>
                </div>
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <span class="text-muted small">Longitude:</span>
                  <span class="fw-bold font-monospace">${loc.longitude.toFixed(4)}&deg;</span>
                </div>
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <span class="text-muted small">Elevation:</span>
                  <span class="fw-bold font-monospace">${loc.elevation.toFixed(0)} m</span>
                </div>
                <hr class="my-2" />
                <div class="d-flex justify-content-between align-items-center">
                  <span class="text-muted small">Status:</span>
                  <span id="station-status" class="status-badge ${gs.state.isOperational ? 'status-badge-green' : 'status-badge-red'}">
                    ${gs.state.isOperational ? 'OPERATIONAL' : 'OFFLINE'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Equipment Summary Card -->
          <div class="col-lg-4">
            <div class="card h-100">
              <div class="card-header">
                <h3 class="card-title">Equipment Summary</h3>
              </div>
              <div class="card-body">
                <div class="equipment-summary">
                  <div class="equipment-item">
                    <img src="${antennaPng}" alt="Antennas" class="equipment-item-icon" />
                    <span id="antenna-count" class="equipment-item-count">${gs.antennas.length}</span>
                    <span class="equipment-item-label">Antennas</span>
                  </div>
                  <div class="equipment-item">
                    <img src="${modemPng}" alt="RF Front-Ends" class="equipment-item-icon" />
                    <span id="rf-count" class="equipment-item-count">${gs.rfFrontEnds.length}</span>
                    <span class="equipment-item-label">RF Front-Ends</span>
                  </div>
                  <div class="equipment-item">
                    <img src="${transmitterPng}" alt="Transmitters" class="equipment-item-icon" />
                    <span id="tx-count" class="equipment-item-count">${gs.transmitters.length}</span>
                    <span class="equipment-item-label">Transmitters</span>
                  </div>
                  <div class="equipment-item">
                    <img src="${receiverPng}" alt="Receivers" class="equipment-item-icon" />
                    <span id="rx-count" class="equipment-item-count">${gs.receivers.length}</span>
                    <span class="equipment-item-label">Receivers</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Quick Stats Card -->
          <div class="col-lg-4">
            <div class="card h-100">
              <div class="card-header">
                <h3 class="card-title">Quick Stats</h3>
              </div>
              <div class="card-body">
                <div class="row g-2">
                  <div class="col-6">
                    <div class="quick-stat">
                      <span id="active-receivers" class="quick-stat-value good">${this.getActiveReceivers_()}</span>
                      <span class="quick-stat-label">Active RX</span>
                    </div>
                  </div>
                  <div class="col-6">
                    <div class="quick-stat">
                      <span id="active-transmitters" class="quick-stat-value good">${this.getActiveTransmitters_()}</span>
                      <span class="quick-stat-label">Active TX</span>
                    </div>
                  </div>
                  <div class="col-6">
                    <div class="quick-stat">
                      <span id="signal-count" class="quick-stat-value">${this.getSignalCount_()}</span>
                      <span class="quick-stat-label">Signals</span>
                    </div>
                  </div>
                  <div class="col-6">
                    <div class="quick-stat">
                      <span id="alarm-count" class="quick-stat-value ${this.alarms_.length > 0 ? 'warn' : ''}">${this.alarms_.length}</span>
                      <span class="quick-stat-label">Alarms</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Row 2: Subsystem Summary Cards -->

          <!-- Antenna/ACU Summary Card -->
          <div class="col-lg-3">
            <div class="card h-100 summary-card clickable-card" data-target-tab="acu-control">
              <div class="card-header d-flex justify-content-between align-items-center">
                <h3 class="card-title mb-0">Antenna</h3>
                <span id="antenna-fault-led" class="card-alarm-led off"></span>
              </div>
              <div class="card-body">
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <span class="text-muted small">Mode:</span>
                  <span id="antenna-mode" class="status-badge status-badge-info">MANUAL</span>
                </div>
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <span class="text-muted small">Position:</span>
                  <span id="antenna-position" class="fw-bold font-monospace small">Az: --° El: --°</span>
                </div>
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <span class="text-muted small">Lock:</span>
                  <span id="antenna-lock" class="d-flex align-items-center gap-1">
                    <span class="card-alarm-led off"></span>
                    <span class="small">UNLOCKED</span>
                  </span>
                </div>
                <div class="d-flex justify-content-between align-items-center">
                  <span class="text-muted small">Beacon C/N:</span>
                  <span id="antenna-cn" class="fw-bold font-monospace small">-- dB</span>
                </div>
              </div>
            </div>
          </div>

          <!-- GPSDO Summary Card -->
          <div class="col-lg-3">
            <div class="card h-100 summary-card clickable-card" data-target-tab="gps-timing">
              <div class="card-header">
                <h3 class="card-title">GPSDO</h3>
              </div>
              <div class="card-body">
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <span class="text-muted small">Lock:</span>
                  <span id="gpsdo-lock" class="d-flex align-items-center gap-1">
                    <span class="card-alarm-led off"></span>
                    <span class="small">UNLOCKED</span>
                  </span>
                </div>
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <span class="text-muted small">Satellites:</span>
                  <span id="gpsdo-sats" class="fw-bold font-monospace small">-- SVs</span>
                </div>
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <span class="text-muted small">Status:</span>
                  <span id="gpsdo-status" class="status-badge status-badge-green">OK</span>
                </div>
                <div class="d-flex justify-content-between align-items-center">
                  <span class="text-muted small">Warm-up:</span>
                  <span id="gpsdo-warmup" class="fw-bold font-monospace small">--</span>
                </div>
              </div>
            </div>
          </div>

          <!-- RF Chain RX Summary Card -->
          <div class="col-lg-3">
            <div class="card h-100 summary-card clickable-card" data-target-tab="rx-analysis">
              <div class="card-header">
                <h3 class="card-title">RF Chain RX</h3>
              </div>
              <div class="card-body">
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <span class="text-muted small">LNB Lock:</span>
                  <span id="lnb-lock" class="d-flex align-items-center gap-1">
                    <span class="card-alarm-led off"></span>
                    <span class="small">UNLOCKED</span>
                  </span>
                </div>
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <span class="text-muted small">Noise Temp:</span>
                  <span id="lnb-noise" class="fw-bold font-monospace small">-- K</span>
                </div>
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <span class="text-muted small">Filter BW:</span>
                  <span id="filter-bw" class="fw-bold font-monospace small">-- MHz</span>
                </div>
                <div class="d-flex justify-content-between align-items-center">
                  <span class="text-muted small">LNB Power:</span>
                  <span id="lnb-power" class="card-alarm-led off"></span>
                </div>
              </div>
            </div>
          </div>

          <!-- RF Chain TX Summary Card -->
          <div class="col-lg-3">
            <div class="card h-100 summary-card clickable-card" data-target-tab="tx-chain">
              <div class="card-header">
                <h3 class="card-title">RF Chain TX</h3>
              </div>
              <div class="card-body">
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <span class="text-muted small">BUC Lock:</span>
                  <span id="buc-lock" class="d-flex align-items-center gap-1">
                    <span class="card-alarm-led off"></span>
                    <span class="small">UNLOCKED</span>
                  </span>
                </div>
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <span class="text-muted small">BUC Output:</span>
                  <span id="buc-output" class="fw-bold font-monospace small">-- dBm</span>
                </div>
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <span class="text-muted small">HPA Power:</span>
                  <span id="hpa-power" class="fw-bold font-monospace small">-- dBm</span>
                </div>
                <div class="d-flex justify-content-between align-items-center">
                  <span class="text-muted small">HPA Status:</span>
                  <span id="hpa-status" class="status-badge status-badge-green">OK</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Receivers Summary Card -->
          <div class="col-lg-6">
            <div class="card h-100 summary-card clickable-card" data-target-tab="rx-analysis">
              <div class="card-header">
                <h3 class="card-title">Receivers</h3>
              </div>
              <div class="card-body">
                <div class="row">
                  <div class="col-6">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                      <span class="text-muted small">Active:</span>
                      <span id="rx-active" class="fw-bold font-monospace">--/-- Modems</span>
                    </div>
                    <div class="d-flex justify-content-between align-items-center">
                      <span class="text-muted small">Best SNR:</span>
                      <span id="rx-snr" class="fw-bold font-monospace">-- dB</span>
                    </div>
                  </div>
                  <div class="col-6">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                      <span class="text-muted small">Signals:</span>
                      <span id="rx-signals" class="fw-bold font-monospace">-- locked</span>
                    </div>
                    <div class="d-flex justify-content-between align-items-center">
                      <span class="text-muted small">Quality:</span>
                      <span id="rx-quality" class="card-alarm-led off"></span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Transmitters Summary Card -->
          <div class="col-lg-6">
            <div class="card h-100 summary-card clickable-card" data-target-tab="tx-chain">
              <div class="card-header">
                <h3 class="card-title">Transmitters</h3>
              </div>
              <div class="card-body">
                <div class="row">
                  <div class="col-6">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                      <span class="text-muted small">Active:</span>
                      <span id="tx-active" class="fw-bold font-monospace">--/-- Modems</span>
                    </div>
                    <div class="d-flex justify-content-between align-items-center">
                      <span class="text-muted small">TX Status:</span>
                      <span id="tx-status" class="fw-bold font-monospace">-- TX</span>
                    </div>
                  </div>
                  <div class="col-6">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                      <span class="text-muted small">Power Budget:</span>
                      <span id="tx-budget" class="fw-bold font-monospace">--%</span>
                    </div>
                    <div class="d-flex justify-content-between align-items-center">
                      <span class="text-muted small">Faults:</span>
                      <span id="tx-fault" class="card-alarm-led off"></span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Alarms Card (full width) -->
          <div class="col-12">
            <div class="card">
              <div class="card-header">
                <h3 class="card-title">Active Alarms</h3>
              </div>
              <div class="card-body">
                <div id="alarm-list" class="alarm-list">
                  ${this.renderAlarmList_()}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private getActiveReceivers_(): number {
    // Count powered modems across all receivers
    return this.groundStation.receivers.reduce((count, rx) => {
      return count + rx.state.modems.filter(m => m.isPowered).length;
    }, 0);
  }

  private getActiveTransmitters_(): number {
    // Count powered modems across all transmitters
    return this.groundStation.transmitters.reduce((count, tx) => {
      return count + tx.state.modems.filter(m => m.isPowered).length;
    }, 0);
  }

  private getSignalCount_(): number {
    // Count available signals across receivers
    return this.groundStation.receivers.reduce((count, rx) => {
      return count + (rx.state.availableSignals?.length ?? 0);
    }, 0);
  }

  private renderAlarmList_(): string {
    if (this.alarms_.length === 0) {
      return html`
        <div class="no-alarms">
          <div class="no-alarms-icon">&#x2713;</div>
          <div>No active alarms</div>
        </div>
      `;
    }

    return this.alarms_.map(alarm => html`
      <div class="alarm-item">
        <span class="alarm-icon ${alarm.level}">
          ${alarm.level === 'critical' ? '&#x26A0;' : alarm.level === 'warning' ? '&#x26A0;' : '&#x2139;'}
        </span>
        <span class="alarm-message">${alarm.message}</span>
        <span class="alarm-time">${this.formatTime_(alarm.timestamp)}</span>
      </div>
    `).join('');
  }

  private formatTime_(date: Date): string {
    return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  private cacheDomElements_(): void {
    const ids = [
      // Existing elements
      'station-status', 'antenna-count', 'rf-count', 'tx-count', 'rx-count',
      'active-receivers', 'active-transmitters', 'signal-count', 'alarm-count', 'alarm-list',
      // Antenna summary
      'antenna-fault-led', 'antenna-mode', 'antenna-position', 'antenna-lock', 'antenna-cn',
      // GPSDO summary
      'gpsdo-lock', 'gpsdo-sats', 'gpsdo-status', 'gpsdo-warmup',
      // RF Chain RX summary
      'lnb-lock', 'lnb-noise', 'filter-bw', 'lnb-power',
      // RF Chain TX summary
      'buc-lock', 'buc-output', 'hpa-power', 'hpa-status',
      // Receivers summary
      'rx-active', 'rx-snr', 'rx-signals', 'rx-quality',
      // Transmitters summary
      'tx-active', 'tx-status', 'tx-budget', 'tx-fault'
    ];

    ids.forEach(id => {
      const el = qs(`#${id}`, this.dom_);
      if (el) {
        this.domCache_.set(id, el);
      }
    });

    // Add click handlers for clickable cards
    this.addCardClickHandlers_();
  }

  private addCardClickHandlers_(): void {
    const clickableCards = this.dom_.querySelectorAll('.clickable-card');
    clickableCards.forEach((card: HTMLElement) => {
      card.addEventListener('click', () => {
        const targetTab = card.dataset.targetTab;
        if (targetTab) {
          EventBus.getInstance().emit(Events.SWITCH_TAB, { tabId: targetTab });
        }
      });
    });
  }

  private syncDomWithState_(): void {
    const gs = this.groundStation;

    // Collect alarms from all equipment
    this.collectAlarms_();

    const statusEl = this.domCache_.get('station-status');
    if (statusEl) {
      statusEl.textContent = gs.state.isOperational ? 'OPERATIONAL' : 'OFFLINE';
      statusEl.className = `status-badge ${gs.state.isOperational ? 'status-badge-green' : 'status-badge-red'}`;
    }

    const rxEl = this.domCache_.get('active-receivers');
    if (rxEl) {
      const activeRx = this.getActiveReceivers_();
      rxEl.textContent = String(activeRx);
      rxEl.className = `quick-stat-value ${activeRx > 0 ? 'good' : ''}`;
    }

    const txEl = this.domCache_.get('active-transmitters');
    if (txEl) {
      const activeTx = this.getActiveTransmitters_();
      txEl.textContent = String(activeTx);
      txEl.className = `quick-stat-value ${activeTx > 0 ? 'good' : ''}`;
    }

    const sigEl = this.domCache_.get('signal-count');
    if (sigEl) {
      sigEl.textContent = String(this.getSignalCount_());
    }

    const alarmCountEl = this.domCache_.get('alarm-count');
    if (alarmCountEl) {
      alarmCountEl.textContent = String(this.alarms_.length);
      alarmCountEl.className = `quick-stat-value ${this.alarms_.length > 0 ? 'warn' : ''}`;
    }

    // Sync new summary cards
    this.syncAntennaSummary_();
    this.syncGpsdoSummary_();
    this.syncRxChainSummary_();
    this.syncTxChainSummary_();
    this.syncReceiversSummary_();
    this.syncTransmittersSummary_();
  }

  private syncAntennaSummary_(): void {
    const antenna = this.groundStation.antennas[0];
    if (!antenna) return;

    const state = antenna.state;

    // Mode badge
    const modeEl = this.domCache_.get('antenna-mode');
    if (modeEl) {
      const modeText = state.trackingMode.toUpperCase().replace('-', ' ');
      modeEl.textContent = modeText;
      // Color by mode type
      modeEl.className = 'status-badge';
      if (state.trackingMode === 'stow') {
        modeEl.classList.add('status-badge-gray');
      } else if (state.trackingMode === 'program-track') {
        modeEl.classList.add('status-badge-green');
      } else {
        modeEl.classList.add('status-badge-info');
      }
    }

    // Position
    const posEl = this.domCache_.get('antenna-position');
    if (posEl) {
      posEl.textContent = `Az: ${state.azimuth.toFixed(1)}° El: ${state.elevation.toFixed(1)}°`;
    }

    // Lock status
    const lockEl = this.domCache_.get('antenna-lock');
    if (lockEl) {
      const isLocked = state.isLocked || state.isBeaconLocked;
      const led = lockEl.querySelector('.card-alarm-led');
      const text = lockEl.querySelector('.small');
      if (led) led.className = `card-alarm-led ${isLocked ? 'success' : 'off'}`;
      if (text) text.textContent = isLocked ? 'LOCKED' : 'UNLOCKED';
    }

    // Beacon C/N
    const cnEl = this.domCache_.get('antenna-cn');
    if (cnEl) {
      cnEl.textContent = state.beaconCN !== null ? `${state.beaconCN.toFixed(1)} dB` : '-- dB';
    }

    // Fault LED
    const faultEl = this.domCache_.get('antenna-fault-led');
    if (faultEl) {
      faultEl.className = `card-alarm-led ${state.hasFault ? 'error' : 'off'}`;
    }
  }

  private syncGpsdoSummary_(): void {
    const rfFe = this.groundStation.rfFrontEnds[0];
    if (!rfFe?.gpsdoModule) return;

    const state = rfFe.gpsdoModule.state;

    // Lock status
    const lockEl = this.domCache_.get('gpsdo-lock');
    if (lockEl) {
      const led = lockEl.querySelector('.card-alarm-led');
      const text = lockEl.querySelector('.small');
      if (led) led.className = `card-alarm-led ${state.isLocked ? 'success' : 'off'}`;
      if (text) text.textContent = state.isLocked ? 'LOCKED' : 'UNLOCKED';
    }

    // Satellites
    const satsEl = this.domCache_.get('gpsdo-sats');
    if (satsEl) {
      satsEl.textContent = `${state.satelliteCount} SVs`;
    }

    // Status badge (holdover/warming/ok)
    const statusEl = this.domCache_.get('gpsdo-status');
    if (statusEl) {
      if (state.isInHoldover) {
        statusEl.textContent = 'HOLDOVER';
        statusEl.className = 'status-badge status-badge-amber';
      } else if (state.warmupTimeRemaining > 0) {
        statusEl.textContent = 'WARMING';
        statusEl.className = 'status-badge status-badge-amber';
      } else if (!state.isPowered) {
        statusEl.textContent = 'OFF';
        statusEl.className = 'status-badge status-badge-gray';
      } else {
        statusEl.textContent = 'OK';
        statusEl.className = 'status-badge status-badge-green';
      }
    }

    // Warm-up time
    const warmupEl = this.domCache_.get('gpsdo-warmup');
    if (warmupEl) {
      if (state.warmupTimeRemaining > 0) {
        const mins = Math.floor(state.warmupTimeRemaining / 60);
        const secs = Math.floor(state.warmupTimeRemaining % 60);
        warmupEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
      } else {
        warmupEl.textContent = '--';
      }
    }
  }

  private syncRxChainSummary_(): void {
    const rfFe = this.groundStation.rfFrontEnds[0];
    if (!rfFe) return;

    // LNB Lock
    const lnbLockEl = this.domCache_.get('lnb-lock');
    if (lnbLockEl && rfFe.lnbModule) {
      const led = lnbLockEl.querySelector('.card-alarm-led');
      const text = lnbLockEl.querySelector('.small');
      const isLocked = rfFe.lnbModule.state.isExtRefLocked;
      if (led) led.className = `card-alarm-led ${isLocked ? 'success' : 'off'}`;
      if (text) text.textContent = isLocked ? 'LOCKED' : 'UNLOCKED';
    }

    // LNB Noise Temp
    const noiseEl = this.domCache_.get('lnb-noise');
    if (noiseEl && rfFe.lnbModule) {
      noiseEl.textContent = `${rfFe.lnbModule.state.noiseTemperature.toFixed(0)} K`;
    }

    // Filter Bandwidth
    const bwEl = this.domCache_.get('filter-bw');
    if (bwEl && rfFe.filterModule) {
      const bwMHz = rfFe.filterModule.state.bandwidth;
      bwEl.textContent = bwMHz >= 1 ? `${bwMHz.toFixed(0)} MHz` : `${(bwMHz * 1000).toFixed(0)} kHz`;
    }

    // LNB Power LED
    const powerEl = this.domCache_.get('lnb-power');
    if (powerEl && rfFe.lnbModule) {
      powerEl.className = `card-alarm-led ${rfFe.lnbModule.state.isPowered ? 'success' : 'off'}`;
    }
  }

  private syncTxChainSummary_(): void {
    const rfFe = this.groundStation.rfFrontEnds[0];
    if (!rfFe) return;

    // BUC Lock
    const bucLockEl = this.domCache_.get('buc-lock');
    if (bucLockEl && rfFe.bucModule) {
      const led = bucLockEl.querySelector('.card-alarm-led');
      const text = bucLockEl.querySelector('.small');
      const isLocked = rfFe.bucModule.state.isExtRefLocked;
      if (led) led.className = `card-alarm-led ${isLocked ? 'success' : 'off'}`;
      if (text) text.textContent = isLocked ? 'LOCKED' : 'UNLOCKED';
    }

    // BUC Output
    const bucOutEl = this.domCache_.get('buc-output');
    if (bucOutEl && rfFe.bucModule) {
      bucOutEl.textContent = `${rfFe.bucModule.state.outputPower.toFixed(1)} dBm`;
    }

    // HPA Power
    const hpaPowerEl = this.domCache_.get('hpa-power');
    if (hpaPowerEl && rfFe.hpaModule) {
      hpaPowerEl.textContent = `${rfFe.hpaModule.state.outputPower.toFixed(1)} dBm`;
    }

    // HPA Status
    const hpaStatusEl = this.domCache_.get('hpa-status');
    if (hpaStatusEl && rfFe.hpaModule) {
      const isOverdriven = rfFe.hpaModule.state.isOverdriven;
      const isPowered = rfFe.hpaModule.state.isPowered;
      if (!isPowered) {
        hpaStatusEl.textContent = 'OFF';
        hpaStatusEl.className = 'status-badge status-badge-gray';
      } else if (isOverdriven) {
        hpaStatusEl.textContent = 'OVERDRIVE';
        hpaStatusEl.className = 'status-badge status-badge-red';
      } else {
        hpaStatusEl.textContent = 'OK';
        hpaStatusEl.className = 'status-badge status-badge-green';
      }
    }
  }

  private syncReceiversSummary_(): void {
    const receiver = this.groundStation.receivers[0];
    if (!receiver) return;

    const modems = receiver.state.modems;
    const totalModems = modems.length;
    const activeModems = modems.filter(m => m.isPowered).length;

    // Active modems
    const activeEl = this.domCache_.get('rx-active');
    if (activeEl) {
      activeEl.textContent = `${activeModems}/${totalModems} Modems`;
    }

    // Best SNR
    const snrEl = this.domCache_.get('rx-snr');
    if (snrEl) {
      let bestSnr: number | null = null;
      modems.forEach(modem => {
        const snr = receiver.getSnrForModem(modem);
        if (snr !== null && (bestSnr === null || snr > bestSnr)) {
          bestSnr = snr;
        }
      });
      snrEl.textContent = bestSnr !== null ? `${bestSnr.toFixed(1)} dB` : '-- dB';
    }

    // Signals locked
    const signalsEl = this.domCache_.get('rx-signals');
    if (signalsEl) {
      const signalCount = receiver.state.availableSignals?.length ?? 0;
      signalsEl.textContent = `${signalCount} locked`;
    }

    // Quality LED (green if any signal, amber if degraded, red if none)
    const qualityEl = this.domCache_.get('rx-quality');
    if (qualityEl) {
      const signals = receiver.state.availableSignals ?? [];
      const hasDegraded = signals.some(s => s.isDegraded);
      if (signals.length === 0) {
        qualityEl.className = 'card-alarm-led off';
      } else if (hasDegraded) {
        qualityEl.className = 'card-alarm-led warning';
      } else {
        qualityEl.className = 'card-alarm-led success';
      }
    }
  }

  private syncTransmittersSummary_(): void {
    const transmitter = this.groundStation.transmitters[0];
    if (!transmitter) return;

    const modems = transmitter.state.modems;
    const totalModems = modems.length;
    const activeModems = modems.filter(m => m.isPowered).length;
    const transmittingModems = modems.filter(m => m.isTransmitting).length;
    const faultedModems = modems.filter(m => m.isFaulted).length;

    // Active modems
    const activeEl = this.domCache_.get('tx-active');
    if (activeEl) {
      activeEl.textContent = `${activeModems}/${totalModems} Modems`;
    }

    // TX Status
    const statusEl = this.domCache_.get('tx-status');
    if (statusEl) {
      statusEl.textContent = `${transmittingModems} TX`;
    }

    // Power Budget
    const budgetEl = this.domCache_.get('tx-budget');
    if (budgetEl) {
      const percentage = transmitter.getPowerPercentage();
      budgetEl.textContent = `${percentage.toFixed(0)}%`;
    }

    // Fault LED
    const faultEl = this.domCache_.get('tx-fault');
    if (faultEl) {
      faultEl.className = `card-alarm-led ${faultedModems > 0 ? 'error' : 'off'}`;
    }
  }

  /**
   * Collect alarms from all equipment modules
   * Updates the alarms_ array and the alarm list display
   */
  private collectAlarms_(): void {
    // Clear existing alarms
    this.alarms_.length = 0;

    const gs = this.groundStation;

    // Collect from RF Front-Ends (TX chain: rfcase=1, RX chain: rfcase=2)
    gs.rfFrontEnds.forEach((rfFe) => {
      const txAlarms = rfFe.getStatusAlarms(1);
      const rxAlarms = rfFe.getStatusAlarms(2);

      [...txAlarms, ...rxAlarms].forEach(alarm => {
        this.alarms_.push({
          id: `rfFe-${alarm.message}`,
          level: alarm.severity === 'error' ? 'critical' : 'warning',
          message: alarm.message,
          timestamp: new Date()
        });
      });
    });

    // Collect from Antennas
    gs.antennas.forEach((antenna, antIdx) => {
      if (antenna.state.hasFault) {
        this.alarms_.push({
          id: `antenna-fault-${antIdx}`,
          level: 'critical',
          message: `Antenna ${antIdx + 1} has fault`,
          timestamp: new Date()
        });
      }
    });

    // Collect from Transmitters
    gs.transmitters.forEach((tx, txIdx) => {
      tx.state.modems.forEach((modem, modemIdx) => {
        if (modem.isFaulted) {
          this.alarms_.push({
            id: `tx-modem-fault-${txIdx}-${modemIdx}`,
            level: 'warning',
            message: `Transmitter modem ${modemIdx + 1} faulted`,
            timestamp: new Date()
          });
        }
      });
    });

    // Update the alarm list DOM
    const alarmListEl = this.domCache_.get('alarm-list');
    if (alarmListEl) {
      alarmListEl.innerHTML = this.renderAlarmList_();
    }
  }

  private throttledSync_(): void {
    const now = Date.now();
    if (now - this.lastSyncTime_ < DashboardTab.UPDATE_INTERVAL_MS) return;
    this.lastSyncTime_ = now;
    this.syncDomWithState_();
  }

  protected addEventListeners_(): void {
    // Subscribe to update events for live data with throttling
    this.updateHandler_ = () => this.throttledSync_();
    EventBus.getInstance().on(Events.UPDATE, this.updateHandler_);
  }

  public activate(): void {
    this.dom_.style.display = 'block';
  }

  public deactivate(): void {
    this.dom_.style.display = 'none';
  }

  public dispose(): void {
    if (this.updateHandler_) {
      EventBus.getInstance().off(Events.UPDATE, this.updateHandler_);
      this.updateHandler_ = null;
    }
    this.domCache_.clear();
    this.dom_.remove();
  }
}
