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
  private readonly groundStation: GroundStation;
  private readonly domCache_: Map<string, HTMLElement> = new Map();
  private readonly alarms_: AlarmEntry[] = [];
  private updateHandler_: (() => void) | null = null;

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
      'station-status', 'antenna-count', 'rf-count', 'tx-count', 'rx-count',
      'active-receivers', 'active-transmitters', 'signal-count', 'alarm-count', 'alarm-list'
    ];

    ids.forEach(id => {
      const el = qs(`#${id}`, this.dom_);
      if (el) {
        this.domCache_.set(id, el);
      }
    });
  }

  private syncDomWithState_(): void {
    const gs = this.groundStation;

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
  }

  protected addEventListeners_(): void {
    // Subscribe to update events for live data
    this.updateHandler_ = () => this.syncDomWithState_();
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
