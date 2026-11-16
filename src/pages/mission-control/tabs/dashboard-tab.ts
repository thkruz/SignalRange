import { GroundStation } from '@app/assets/ground-station/ground-station';
import antennaPng from '@app/assets/icons/antenna.png';
import receiverPng from '@app/assets/icons/arrow-big-down-lines.png';
import transmitterPng from '@app/assets/icons/arrow-big-up-lines.png';
import modemPng from '@app/assets/icons/radio.png';
import { BaseElement } from '@app/components/base-element';
import { html } from '@app/engine/utils/development/formatter';
import { qs } from '@app/engine/utils/query-selector';
import { antennaLockLabel, trackingModeLabel } from '@app/equipment/antenna/tracking-mode-label';
import { EventBus } from '@app/events/event-bus';
import { AggregatedAlarm, Events } from '@app/events/events';
import { AlarmService, AlarmWithDetail } from '@app/services/alarm-service';
import { getSimulatedNowMs } from '@app/simulation/sim-time';
import { AlarmLedOptions, AlarmLedState, alarmLed, applyAlarmLed } from '../alarm-led';
import { wrapAzimuthDeg } from '../az-display';
import { severityGlyph } from '../glyphs';
import { STATION_STATUS_BADGE, stationStatusLabel } from '../station-status-label';
import { formatBucOutputPower } from './buc-adapter';
import './dashboard-tab.css';
import { formatHpaOutputPower } from './hpa-adapter';

interface AlarmEntry {
  id: string;
  level: 'critical' | 'warning' | 'info';
  message: string;
  /** Live value behind a fixed label (rain-fade depth, modem Es/N0) */
  detail?: string;
  timestamp: Date;
}

const ALARM_LEVEL: Record<AggregatedAlarm['severity'], AlarmEntry['level']> = {
  error: 'critical',
  warning: 'warning',
  info: 'info',
  success: 'info',
};

/**
 * Active Alarms row glyphs, the ticker's shapes (Phase 32 D14, nats-r7-s24-F1):
 * an error is an exclamation in a filled circle, a warning the triangle, so a
 * lock loss never reads like the warnings under it. The shared inline glyphs
 * (D21): the app loads no icon font.
 */
const ALARM_ICON: Record<AlarmEntry['level'], string> = {
  critical: severityGlyph('error', 'alarm-glyph-error'),
  warning: severityGlyph('warning', 'alarm-glyph-warning'),
  info: severityGlyph('info', 'alarm-glyph-info'),
};

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
  /** RF alarm label prefixes of the receive chain (RF case 2 less the GPSDO) */
  private static readonly RX_CHAIN_PREFIXES_ = ['LNB', 'AGC', 'Notch', 'Filter'] as const;
  /** RF alarm label prefixes of the transmit chain (RF case 1) */
  private static readonly TX_CHAIN_PREFIXES_ = ['BUC', 'HPA'] as const;
  /** RF alarm label prefixes of the GPSDO (gpsdo-module-core.ts getAlarms) */
  private static readonly GPSDO_PREFIXES_ = ['GPSDO', 'GNSS'] as const;

  private readonly groundStation: GroundStation;
  private readonly domCache_: Map<string, HTMLElement> = new Map();
  private readonly alarms_: AlarmEntry[] = [];
  /** This station's AlarmService alarms from the last sync, most severe first */
  private stationAlarms_: AlarmWithDetail[] = [];
  private updateHandler_: (() => void) | null = null;
  /** Re-syncs on AlarmService's poll (Phase 34 D8); removed in dispose() */
  private alarmStateHandler_: (() => void) | null = null;
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
    const status = stationStatusLabel(gs);

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
                  <span id="station-status" class="status-badge ${STATION_STATUS_BADGE[status]}">${status}</span>
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
                    <span id="tx-count" class="equipment-item-count">${this.txModems_().length}</span>
                    <span class="equipment-item-label">TX Modems</span>
                  </div>
                  <div class="equipment-item">
                    <img src="${receiverPng}" alt="Receivers" class="equipment-item-icon" />
                    <span id="rx-count" class="equipment-item-count">${this.rxModems_().length}</span>
                    <span class="equipment-item-label">RX Modems</span>
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
                      <span class="quick-stat-label">RX Modems On</span>
                    </div>
                  </div>
                  <div class="col-6">
                    <div class="quick-stat">
                      <span id="active-transmitters" class="quick-stat-value good">${this.getActiveTransmitters_()}</span>
                      <span class="quick-stat-label">TX Modems On</span>
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
                      <span id="alarm-count" class="quick-stat-value ${this.activeAlarmCount_() > 0 ? 'warn' : ''}">${this.activeAlarmCount_()}</span>
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
                  <span class="text-muted small" title="Measured in the beacon receiver's 1 kHz tracking bandwidth (the RX modem C/N is in the carrier bandwidth)">Beacon C/N (1 kHz):</span>
                  <span id="antenna-cn" class="fw-bold font-monospace small">-- dB</span>
                </div>
              </div>
            </div>
          </div>

          <!-- GPSDO Summary Card -->
          <div class="col-lg-3">
            <div class="card h-100 summary-card clickable-card" data-target-tab="gps-timing">
              <div class="card-header d-flex justify-content-between align-items-center">
                <h3 class="card-title mb-0">GPSDO</h3>
                <span id="gpsdo-fault-led" class="card-alarm-led off"></span>
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
              <div class="card-header d-flex justify-content-between align-items-center">
                <h3 class="card-title mb-0">RF Chain RX</h3>
                <span id="rx-chain-fault-led" class="card-alarm-led off"></span>
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
              <div class="card-header d-flex justify-content-between align-items-center">
                <h3 class="card-title mb-0">RF Chain TX</h3>
                <span id="tx-chain-fault-led" class="card-alarm-led off"></span>
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

  // One counting scope everywhere (phase 27, r2-s09-F1 / s01-F19): modems,
  // across every chassis. A modem is what an operator assigns a carrier to;
  // a chassis holds four. Equipment Summary and Mission Overview count the
  // modems installed, Quick Stats the modems powered, and the TX/RX cards
  // show powered/installed - so 4 installed and 1 on never reads "16" or
  // contradicts a chassis count.
  private txModems_() {
    return this.groundStation.transmitters.flatMap((tx) => tx.state.modems);
  }

  private rxModems_() {
    return this.groundStation.receivers.flatMap((rx) => rx.state.modems);
  }

  private getActiveReceivers_(): number {
    return this.rxModems_().filter((m) => m.isPowered).length;
  }

  private getActiveTransmitters_(): number {
    return this.txModems_().filter((m) => m.isPowered).length;
  }

  private getSignalCount_(): number {
    // Count available signals across receivers
    return this.groundStation.receivers.reduce((count, rx) => count + (rx.state.availableSignals?.length ?? 0), 0);
  }

  /**
   * Every listed row, info included: the Quick Stats "Alarms" figure reads the
   * same number as the ticker badges for this station (nats-r5-s01-F1)
   */
  private activeAlarmCount_(): number {
    return this.alarms_.length;
  }

  private renderAlarmList_(): string {
    // The placeholder only when the card lists nothing at all, never above a row
    const noAlarms =
      this.alarms_.length === 0
        ? html`
        <div class="no-alarms">
          <div class="no-alarms-icon">&#x2713;</div>
          <div>No active alarms</div>
        </div>
      `
        : '';

    return (
      noAlarms +
      this.alarms_
        .map(
          (alarm) => html`
      <div class="alarm-item"${alarm.detail ? ` title="${alarm.detail}"` : ''}>
        <span class="alarm-icon ${alarm.level}">${ALARM_ICON[alarm.level]}</span>
        <span class="alarm-message">${alarm.message}</span>
        ${alarm.detail ? html`<span class="alarm-detail">${alarm.detail}</span>` : ''}
        <span class="alarm-time">${this.formatTime_(alarm.timestamp)}</span>
      </div>
    `
        )
        .join('')
    );
  }

  /** `02:15:07` - station clock time of day (UTC), as the HUD clock writes it */
  private formatTime_(date: Date): string {
    return date.toISOString().slice(11, 19);
  }

  private cacheDomElements_(): void {
    const ids = [
      // Existing elements
      'station-status',
      'antenna-count',
      'rf-count',
      'tx-count',
      'rx-count',
      'active-receivers',
      'active-transmitters',
      'signal-count',
      'alarm-count',
      'alarm-list',
      // Antenna summary
      'antenna-fault-led',
      'antenna-mode',
      'antenna-position',
      'antenna-lock',
      'antenna-cn',
      // GPSDO summary
      'gpsdo-fault-led',
      'gpsdo-lock',
      'gpsdo-sats',
      'gpsdo-status',
      'gpsdo-warmup',
      // RF Chain RX summary
      'rx-chain-fault-led',
      'lnb-lock',
      'lnb-noise',
      'filter-bw',
      'lnb-power',
      // RF Chain TX summary
      'tx-chain-fault-led',
      'buc-lock',
      'buc-output',
      'hpa-power',
      'hpa-status',
      // Receivers summary
      'rx-active',
      'rx-snr',
      'rx-signals',
      'rx-quality',
      // Transmitters summary
      'tx-active',
      'tx-status',
      'tx-budget',
      'tx-fault',
    ];

    ids.forEach((id) => {
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
      const status = stationStatusLabel(gs);
      statusEl.textContent = status;
      statusEl.className = `status-badge ${STATION_STATUS_BADGE[status]}`;
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
      const activeAlarms = this.activeAlarmCount_();
      alarmCountEl.textContent = String(activeAlarms);
      alarmCountEl.className = `quick-stat-value ${activeAlarms > 0 ? 'warn' : ''}`;
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
      modeEl.textContent = trackingModeLabel(state);
      // Color by mode type
      modeEl.className = 'status-badge';
      if (state.isAcuAutomationFaulted) {
        // The ACU's automation is down: whatever the mode switch says, nothing
        // is tracking, so the badge carries the alarm's colour (nats-r3-s23-F1)
        modeEl.classList.add('status-badge-red');
      } else if (state.trackingMode === 'stow') {
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
      posEl.textContent = `Az: ${wrapAzimuthDeg(state.azimuth).toFixed(1)}° El: ${state.elevation.toFixed(1)}°`;
    }

    // Lock status
    const lockEl = this.domCache_.get('antenna-lock');
    if (lockEl) {
      const lock = antennaLockLabel(state);
      const led = lockEl.querySelector('.card-alarm-led');
      const text = lockEl.querySelector('.small');
      DashboardTab.setDot_(led, lock === 'LOCKED' ? 'success' : lock === 'UNKNOWN' ? 'warning' : 'off', `Antenna lock: ${lock}`);
      if (text) text.textContent = lock;
    }

    // Beacon C/N
    const cnEl = this.domCache_.get('antenna-cn');
    if (cnEl) {
      cnEl.textContent = state.beaconCN !== null ? `${state.beaconCN.toFixed(1)} dB` : '-- dB';
    }

    // Fault LED: the station's ANT alarms plus the pointing-limit fault,
    // which raises no alarm of its own; grey only when the pedestal is off
    // (s01-F14), titled with the top alarm (Phase 33 D2, nats-r8-s17-F1)
    this.syncAlarmLed_('antenna-fault-led', (alarm) => alarm.equipmentType === 'ANT', {
      isPowered: state.isPowered,
      offTitle: 'Antenna off',
      extra: state.hasFault ? [{ severity: 'error', message: state.faultMessage ?? 'Antenna fault' }] : undefined,
    });
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
      const lock = state.isLocked ? 'LOCKED' : 'UNLOCKED';
      DashboardTab.setDot_(led, state.isLocked ? 'success' : 'off', `GPSDO lock: ${lock}`);
      if (text) text.textContent = lock;
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

    // Warm-up time: the same wording as the GPS Timing tab badge (READY / m:ss / OFF)
    const warmupEl = this.domCache_.get('gpsdo-warmup');
    if (warmupEl) {
      warmupEl.textContent = state.isPowered ? rfFe.gpsdoModule.formatWarmupTime_() : 'OFF';
    }

    // Header fault LED: the GPSDO's RF alarms ("GPSDO not locked", "GNSS
    // signal lost", holdover, oven, self-test), grey while off or warming up
    // (Phase 34 D4, nats-r9-s01-F1)
    this.syncAlarmLed_('gpsdo-fault-led', DashboardTab.rfAlarmMatcher_(DashboardTab.GPSDO_PREFIXES_), {
      isPowered: state.isPowered,
      offTitle: 'GPSDO off',
      idleTitle: state.warmupTimeRemaining > 0 ? 'Warming up' : undefined,
    });
  }

  /**
   * A nested lock / power dot: its colour class and its title in one place,
   * so no dot is ever left without a title (Phase 34 D4, nats-r9-s01-F1)
   */
  private static setDot_(led: Element | null | undefined, state: AlarmLedState, title: string): void {
    if (!led) return;
    led.className = `card-alarm-led ${state}`;
    (led as HTMLElement).title = title;
  }

  private syncRxChainSummary_(): void {
    const rfFe = this.groundStation.rfFrontEnds[0];
    if (!rfFe) return;

    // A powered-off LNB has no lock and no noise figure: read it as the LNB
    // card does ("--", grey), not as an unlocked 290 K unit (nats-r5-s12-F1)
    const lnbPowered = rfFe.lnbModule?.state.isPowered ?? false;

    // LNB Lock
    const lnbLockEl = this.domCache_.get('lnb-lock');
    if (lnbLockEl && rfFe.lnbModule) {
      const led = lnbLockEl.querySelector('.card-alarm-led');
      const text = lnbLockEl.querySelector('.small');
      const isLocked = lnbPowered && rfFe.lnbModule.state.isExtRefLocked;
      const lock = lnbPowered ? (isLocked ? 'LOCKED' : 'UNLOCKED') : 'OFF';
      DashboardTab.setDot_(led, isLocked ? 'success' : 'off', `LNB lock: ${lock}`);
      if (text) text.textContent = lock;
    }

    // LNB Noise Temp
    const noiseEl = this.domCache_.get('lnb-noise');
    if (noiseEl && rfFe.lnbModule) {
      noiseEl.textContent = lnbPowered ? `${rfFe.lnbModule.state.noiseTemperature.toFixed(0)} K` : '--';
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
      DashboardTab.setDot_(powerEl, lnbPowered ? 'success' : 'off', `LNB power: ${lnbPowered ? 'ON' : 'OFF'}`);
    }

    // Header fault LED: the receive chain's RF alarms (LNB, AGC, notch,
    // filter), grey while the LNB is off (Phase 32 D14, Phase 33 D2, nats-r8-s02-F2)
    this.syncAlarmLed_('rx-chain-fault-led', DashboardTab.rfAlarmMatcher_(DashboardTab.RX_CHAIN_PREFIXES_), {
      isPowered: lnbPowered,
      offTitle: 'LNB off',
    });
  }

  /**
   * RF alarms carry no TX/RX field, so a chain LED picks its alarms by label
   * prefix (rf-front-end-core.ts case 1 / case 2)
   */
  private static rfAlarmMatcher_(prefixes: readonly string[]): (alarm: AlarmWithDetail) => boolean {
    return (alarm) => alarm.equipmentType === 'RF' && prefixes.some((prefix) => alarm.message.startsWith(prefix));
  }

  /**
   * One summary LED from this station's AlarmService alarms (Phase 33 D2):
   * grey when off, red / amber for the worst error / warning titled with the
   * top alarm, grey when idle, else green "No alarms". Every LED gets a title.
   */
  private syncAlarmLed_(id: string, match: (alarm: AlarmWithDetail) => boolean, opts: AlarmLedOptions): void {
    const led = this.domCache_.get(id);
    if (led) {
      applyAlarmLed(led, alarmLed(this.stationAlarms_, match, opts));
    }
  }

  private syncTxChainSummary_(): void {
    const rfFe = this.groundStation.rfFrontEnds[0];
    if (!rfFe) return;

    // BUC Lock: a powered-off BUC reads OFF (grey), as the LNB does (phase 31 D6)
    const bucLockEl = this.domCache_.get('buc-lock');
    if (bucLockEl && rfFe.bucModule) {
      const led = bucLockEl.querySelector('.card-alarm-led');
      const text = bucLockEl.querySelector('.small');
      const bucPowered = rfFe.bucModule.state.isPowered;
      const isLocked = bucPowered && rfFe.bucModule.state.isExtRefLocked;
      const lock = bucPowered ? (isLocked ? 'LOCKED' : 'UNLOCKED') : 'OFF';
      DashboardTab.setDot_(led, isLocked ? 'success' : 'off', `BUC lock: ${lock}`);
      if (text) text.textContent = lock;
    }

    // BUC Output
    const bucOutEl = this.domCache_.get('buc-output');
    if (bucOutEl && rfFe.bucModule) {
      bucOutEl.textContent = formatBucOutputPower(rfFe.bucModule);
    }

    // HPA Power
    const hpaPowerEl = this.domCache_.get('hpa-power');
    if (hpaPowerEl && rfFe.hpaModule) {
      hpaPowerEl.textContent = formatHpaOutputPower(rfFe.hpaModule);
    }

    // HPA Status
    const hpaStatusEl = this.domCache_.get('hpa-status');
    if (hpaStatusEl && rfFe.hpaModule) {
      const isOverdriven = rfFe.hpaModule.state.isOverdriven;
      const isPowered = rfFe.hpaModule.state.isPowered;
      if (!isPowered) {
        hpaStatusEl.textContent = 'OFF';
        hpaStatusEl.className = 'status-badge status-badge-gray';
      } else if (!rfFe.hpaModule.state.isHpaEnabled) {
        // Powered but output disabled: not radiating, so not "OK" (phase 31 D6)
        hpaStatusEl.textContent = 'DISABLED';
        hpaStatusEl.className = 'status-badge status-badge-gray';
      } else if (isOverdriven) {
        // Amber: "HPA overdrive - IMD degradation" is a warning (Phase 32 D14)
        hpaStatusEl.textContent = 'OVERDRIVE';
        hpaStatusEl.className = 'status-badge status-badge-amber';
      } else {
        hpaStatusEl.textContent = 'OK';
        hpaStatusEl.className = 'status-badge status-badge-green';
      }
    }

    // Header fault LED: the BUC + HPA alarms' worst severity (Phase 32 D14);
    // grey while the chain is not radiating, titled with the reason (Phase 33
    // D2, nats-r8-s02-F1: a disabled HPA raises no alarm but is not green)
    const bucPowered = rfFe.bucModule?.state.isPowered ?? false;
    const hpaPowered = rfFe.hpaModule?.state.isPowered ?? false;
    this.syncAlarmLed_('tx-chain-fault-led', DashboardTab.rfAlarmMatcher_(DashboardTab.TX_CHAIN_PREFIXES_), {
      isPowered: bucPowered || hpaPowered,
      offTitle: 'BUC and HPA off',
      idleTitle: DashboardTab.txChainIdleTitle_(rfFe),
    });
  }

  /**
   * Why a powered transmit chain is not radiating, or undefined when it is
   * (BUC on and unmuted, HPA on with its output enabled)
   */
  private static txChainIdleTitle_(rfFe: GroundStation['rfFrontEnds'][number]): string | undefined {
    const buc = rfFe.bucModule?.state;
    const hpa = rfFe.hpaModule?.state;
    if (!hpa?.isPowered) {
      return 'HPA off';
    }
    if (!hpa.isHpaEnabled) {
      return 'HPA output disabled';
    }
    if (!buc?.isPowered) {
      return 'BUC off';
    }
    if (buc.isMuted) {
      return 'BUC muted';
    }
    return undefined;
  }

  private syncReceiversSummary_(): void {
    const receivers = this.groundStation.receivers;
    if (receivers.length === 0) return;

    // Every chassis's modems, each read through its own receiver
    const owned = receivers.flatMap((rx) => rx.state.modems.map((modem) => ({ rx, modem })));
    const modems = owned.map((o) => o.modem);
    const totalModems = modems.length;
    const activeModems = modems.filter((m) => m.isPowered).length;

    // Active modems
    const activeEl = this.domCache_.get('rx-active');
    if (activeEl) {
      activeEl.textContent = `${activeModems}/${totalModems} Modems`;
    }

    // Best SNR: the modem card's Effective C/N (after the ADC penalty), so the
    // Dashboard and the modem never quote two numbers for one carrier
    // (Phase 30 D8, nats-r5-s07-F1)
    const snrEl = this.domCache_.get('rx-snr');
    if (snrEl) {
      let bestSnr: number | null = null;
      owned.forEach(({ rx, modem }) => {
        if (!modem.isPowered) return;
        const info = rx.getSignalsInBandwidth(modem);
        if (!info.hasCarrier) return;
        const snr = info.effectiveCnRatio_dB ?? info.cnRatio_dB;
        if (Number.isFinite(snr) && (bestSnr === null || snr > bestSnr)) {
          bestSnr = snr;
        }
      });
      snrEl.textContent = bestSnr !== null ? `${bestSnr.toFixed(1)} dB` : '-- dB';
    }

    // Modems in demodulator lock (the receiver's lock tracker, phase 19.5)
    const signalsEl = this.domCache_.get('rx-signals');
    if (signalsEl) {
      const lockedCount = owned.filter(({ rx, modem }) => modem.isPowered && rx.getSignalsInBandwidth(modem).hasLock).length;
      signalsEl.textContent = `${lockedCount} locked`;
    }

    // Quality LED: the station's RX alarms (Carrier lock lost red, Degraded
    // margin amber), grey with no modem on or no carrier at all (Phase 33 D2,
    // nats-r8-s24-F1)
    const signals = receivers.flatMap((rx) => rx.state.availableSignals ?? []);
    this.syncAlarmLed_('rx-quality', (alarm) => alarm.equipmentType === 'RX', {
      isPowered: activeModems > 0,
      offTitle: 'No modem powered',
      idleTitle: signals.length === 0 ? 'No carrier' : undefined,
    });
  }

  private syncTransmittersSummary_(): void {
    const transmitter = this.groundStation.transmitters[0];
    if (!transmitter) return;

    // Modems across every chassis (the Quick Stats / Summary scope)
    const modems = this.txModems_();
    const totalModems = modems.length;
    const activeModems = modems.filter((m) => m.isPowered).length;
    const transmittingModems = modems.filter((m) => m.isTransmitting).length;

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

    // Fault LED: the station's TX alarms (Faulted, Power Exceeds red;
    // Intermittent Fault, Approaching amber) (Phase 33 D2, nats-r8-s08-F1)
    this.syncAlarmLed_('tx-fault', (alarm) => alarm.equipmentType === 'TX', {
      isPowered: activeModems > 0,
      offTitle: 'No modem powered',
    });
  }

  /**
   * Collect this station's alarms from AlarmService, the same source the
   * ticker polls, so the list, the Quick Stats count and the ticker agree
   * (s08-F2, s16-F2, s17-F2, s23-F2). Already ordered most severe first.
   */
  private collectAlarms_(): void {
    // Stamped on the scenario clock (nats-r3-s08-F2) at the moment the alarm
    // was RAISED, as AlarmService recorded it, not when this list first
    // rendered it (nats-r4-s01-F2)
    const nowMs = getSimulatedNowMs();
    const alarms = AlarmService.getAlarms(this.groundStation);
    this.stationAlarms_ = alarms;
    this.alarms_.length = 0;
    alarms.forEach((alarm, index) => {
      this.alarms_.push({
        id: `${alarm.equipmentType}-${alarm.equipmentIndex}-${index}`,
        level: ALARM_LEVEL[alarm.severity],
        message: alarm.message,
        detail: alarm.detail,
        timestamp: new Date(alarm.raisedAtMs ?? nowMs),
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

  /**
   * AlarmService's poll changed the alarm set: re-sync now, outside the wall
   * throttle, so a row, the Quick Stats count and the LED titles change on the
   * same tick as the ticker and the Ops Log line (Phase 34 D8, nats-r9-s04-F1)
   */
  private onAlarmStateChanged_(): void {
    this.lastSyncTime_ = Date.now();
    this.syncDomWithState_();
  }

  protected addEventListeners_(): void {
    // Subscribe to update events for live data with throttling
    this.updateHandler_ = () => this.throttledSync_();
    EventBus.getInstance().on(Events.UPDATE, this.updateHandler_);
    this.alarmStateHandler_ = () => this.onAlarmStateChanged_();
    EventBus.getInstance().on(Events.ALARM_STATE_CHANGED, this.alarmStateHandler_);
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
    if (this.alarmStateHandler_) {
      EventBus.getInstance().off(Events.ALARM_STATE_CHANGED, this.alarmStateHandler_);
      this.alarmStateHandler_ = null;
    }
    this.domCache_.clear();
    this.dom_.remove();
  }
}
