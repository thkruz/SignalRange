import { BaseElement } from "@app/components/base-element";
import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import { Satellite, Transponder } from "@app/equipment/satellite/satellite";
import { EventBus } from "@app/events/event-bus";
import { Events } from "@app/events/events";
import satellitePng from '../../../assets/icons/satellite.png';
import './satellite-dashboard-tab.css';

/**
 * SatelliteDashboardTab - Satellite status and transponder overview
 *
 * Displays:
 * - Satellite identification (NORAD ID)
 * - Position (Azimuth/Elevation)
 * - Health status
 * - Transponder list with frequencies
 * - Active signal count
 */
export class SatelliteDashboardTab extends BaseElement {
  private readonly satellite: Satellite;
  private readonly domCache_: Map<string, HTMLElement> = new Map();
  private updateHandler_: (() => void) | null = null;

  constructor(satellite: Satellite, containerId: string) {
    super();
    this.satellite = satellite;

    this.init_(containerId, 'replace');
    this.dom_ = qs('.satellite-dashboard-tab');

    this.cacheDomElements_();
    this.syncDomWithState_();
  }

  protected get html_(): string {
    const healthPercent = Math.round(this.satellite.health * 100);
    const healthStatus = this.satellite.health >= 0.9 ? 'Healthy' : this.satellite.health >= 0.5 ? 'Degraded' : 'Critical';
    const healthBadgeClass = this.satellite.health >= 0.9 ? 'status-badge-green' : this.satellite.health >= 0.5 ? 'status-badge-amber' : 'status-badge-red';

    return html`
      <div class="satellite-dashboard-tab">
        <div class="row g-2 pb-6">
          <!-- Satellite Info Card -->
          <div class="col-lg-4">
            <div class="card h-100">
              <div class="card-header">
                <h3 class="card-title">Satellite Information</h3>
              </div>
              <div class="card-body">
                <div class="text-center mb-3">
                  <img src="${satellitePng}" alt="Satellite" class="satellite-icon-lg" />
                </div>
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <span class="text-muted small">NORAD ID:</span>
                  <span class="fw-bold font-monospace">${this.satellite.noradId}</span>
                </div>
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <span class="text-muted small">Azimuth:</span>
                  <span id="sat-azimuth" class="fw-bold font-monospace">${this.satellite.az.toFixed(1)}&deg;</span>
                </div>
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <span class="text-muted small">Elevation:</span>
                  <span id="sat-elevation" class="fw-bold font-monospace">${this.satellite.el.toFixed(1)}&deg;</span>
                </div>
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <span class="text-muted small">Rotation:</span>
                  <span id="sat-rotation" class="fw-bold font-monospace">${this.satellite.rotation.toFixed(1)}&deg;</span>
                </div>
                <hr class="my-2" />
                <div class="d-flex justify-content-between align-items-center">
                  <span class="text-muted small">Health:</span>
                  <span id="sat-health-badge" class="status-badge ${healthBadgeClass}">${healthStatus} (${healthPercent}%)</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Transponders Card -->
          <div class="col-lg-4">
            <div class="card h-100">
              <div class="card-header">
                <h3 class="card-title">Transponders</h3>
              </div>
              <div class="card-body">
                <div class="d-flex justify-content-between align-items-center mb-3">
                  <span class="text-muted small">Total:</span>
                  <span class="fw-bold">${this.satellite.transponders.length}</span>
                </div>
                <div class="d-flex justify-content-between align-items-center mb-3">
                  <span class="text-muted small">Active:</span>
                  <span id="sat-active-transponders" class="fw-bold">${this.satellite.transponders.filter(t => t.isActive).length}</span>
                </div>
                <hr class="my-2" />
                <div class="transponder-list">
                  ${this.renderTransponderList_()}
                </div>
              </div>
            </div>
          </div>

          <!-- Signal Status Card -->
          <div class="col-lg-4">
            <div class="card h-100">
              <div class="card-header">
                <h3 class="card-title">Signal Status</h3>
              </div>
              <div class="card-body">
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <span class="text-muted small">RX Signals:</span>
                  <span id="sat-rx-count" class="fw-bold font-monospace">${this.satellite.rxSignal.length + this.satellite.externalSignal.length}</span>
                </div>
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <span class="text-muted small">TX Signals:</span>
                  <span id="sat-tx-count" class="fw-bold font-monospace">${this.satellite.txSignal.length}</span>
                </div>
                <hr class="my-2" />
                <div class="mb-3">
                  <label class="form-label text-muted small text-uppercase">Degradation Config</label>
                  <div class="d-flex flex-wrap gap-2">
                    <span class="badge ${this.satellite.degradationConfig.atmosphericEffects ? 'bg-primary' : 'bg-secondary'}">Atmospheric</span>
                    <span class="badge ${this.satellite.degradationConfig.powerVariation ? 'bg-primary' : 'bg-secondary'}">Power Var</span>
                    <span class="badge ${this.satellite.degradationConfig.randomDropout ? 'bg-primary' : 'bg-secondary'}">Dropout</span>
                    <span class="badge ${this.satellite.degradationConfig.interference ? 'bg-primary' : 'bg-secondary'}">Interference</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderTransponderList_(): string {
    if (this.satellite.transponders.length === 0) {
      return html`<div class="text-muted text-center">No transponders configured</div>`;
    }

    return this.satellite.transponders.map((tp: Transponder) => html`
      <div class="transponder-item">
        <div>
          <div class="transponder-id">${tp.id}</div>
          <div class="transponder-freq">
            UL: ${(tp.uplinkFrequency / 1e9).toFixed(3)} GHz
            / DL: ${(tp.downlinkFrequency / 1e9).toFixed(3)} GHz
          </div>
        </div>
        <span class="status-badge ${tp.isActive ? 'status-badge-green' : 'status-badge-off'}">
          ${tp.isActive ? 'ON' : 'OFF'}
        </span>
      </div>
    `).join('');
  }

  private cacheDomElements_(): void {
    const ids = [
      'sat-azimuth', 'sat-elevation', 'sat-rotation',
      'sat-health-badge', 'sat-active-transponders',
      'sat-rx-count', 'sat-tx-count'
    ];

    ids.forEach(id => {
      const el = qs(`#${id}`, this.dom_);
      if (el) {
        this.domCache_.set(id, el);
      }
    });
  }

  private syncDomWithState_(): void {
    const azEl = this.domCache_.get('sat-azimuth');
    if (azEl) azEl.textContent = `${this.satellite.az.toFixed(1)}\u00B0`;

    const elEl = this.domCache_.get('sat-elevation');
    if (elEl) elEl.textContent = `${this.satellite.el.toFixed(1)}\u00B0`;

    const rotEl = this.domCache_.get('sat-rotation');
    if (rotEl) rotEl.textContent = `${this.satellite.rotation.toFixed(1)}\u00B0`;

    const healthPercent = Math.round(this.satellite.health * 100);
    const healthStatus = this.satellite.health >= 0.9 ? 'Healthy' : this.satellite.health >= 0.5 ? 'Degraded' : 'Critical';
    const healthBadgeClass = this.satellite.health >= 0.9 ? 'status-badge-green' : this.satellite.health >= 0.5 ? 'status-badge-amber' : 'status-badge-red';

    const healthEl = this.domCache_.get('sat-health-badge');
    if (healthEl) {
      healthEl.textContent = `${healthStatus} (${healthPercent}%)`;
      healthEl.className = `status-badge ${healthBadgeClass}`;
    }

    const activeEl = this.domCache_.get('sat-active-transponders');
    if (activeEl) activeEl.textContent = String(this.satellite.transponders.filter(t => t.isActive).length);

    const rxEl = this.domCache_.get('sat-rx-count');
    if (rxEl) rxEl.textContent = String(this.satellite.rxSignal.length + this.satellite.externalSignal.length);

    const txEl = this.domCache_.get('sat-tx-count');
    if (txEl) txEl.textContent = String(this.satellite.txSignal.length);
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
