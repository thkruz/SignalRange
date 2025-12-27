import { GroundStation } from "@app/assets/ground-station/ground-station";
import { BaseElement } from "@app/components/base-element";
import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import { Satellite } from "@app/equipment/satellite/satellite";
import { EventBus } from "@app/events/event-bus";
import { Events } from "@app/events/events";
import { SimulationManager } from "@app/simulation/simulation-manager";
import antennaPng from '../../../assets/icons/antenna.png';
import satellitePng from '../../../assets/icons/satellite.png';
import './mission-overview-tab.css';

/**
 * MissionOverviewTab - Overview of all assets in the mission
 *
 * Displays:
 * - Grid of ground station cards with name, status, location, and equipment counts
 * - Grid of satellite cards with NORAD ID, position, health, and transponder count
 * - Clicking a card navigates to that asset's dashboard
 */
export class MissionOverviewTab extends BaseElement {
  private readonly groundStations_: GroundStation[];
  private readonly satellites_: Satellite[];

  constructor(containerId: string) {
    super();
    this.groundStations_ = SimulationManager.getInstance().groundStations;
    this.satellites_ = SimulationManager.getInstance().satellites;
    this.init_(containerId, 'replace');
    this.dom_ = qs('.mission-overview-tab');
    this.addEventListenersLate_();
  }

  protected get html_(): string {
    return html`
      <div class="mission-overview-tab">
        <div class="row g-2 pb-6">
          <!-- Header -->
          <div class="col-12">
            <h2 class="mission-overview-title">Mission Overview</h2>
          </div>

          <!-- Ground Stations Section -->
          <div class="col-12">
            <h3 class="section-title">Ground Stations</h3>
          </div>
          ${this.groundStations_.length > 0
            ? this.groundStations_.map(gs => this.renderGroundStationCard_(gs)).join('')
            : `<div class="col-12"><p class="text-muted">No ground stations in this scenario.</p></div>`
          }

          <!-- Satellites Section -->
          <div class="col-12 mt-4">
            <h3 class="section-title">Satellites</h3>
          </div>
          ${this.satellites_.length > 0
            ? this.satellites_.map(sat => this.renderSatelliteCard_(sat)).join('')
            : `<div class="col-12"><p class="text-muted">No satellites in this scenario.</p></div>`
          }
        </div>
      </div>
    `;
  }

  private renderGroundStationCard_(gs: GroundStation): string {
    const loc = gs.state.location;
    const isOperational = gs.state.isOperational;

    return html`
      <div class="col-lg-4 col-md-6">
        <div class="card asset-card clickable-card h-100"
             data-asset-type="ground-station"
             data-asset-id="${gs.state.id}">
          <div class="card-body">
            <div class="d-flex align-items-center mb-3">
              <img src="${antennaPng}" alt="Ground Station" class="asset-icon me-3" />
              <div class="flex-fill">
                <h4 class="card-title mb-0">${gs.state.name}</h4>
                <span class="text-muted small">${gs.state.id}</span>
              </div>
              <span class="status-badge ${isOperational ? 'status-badge-green' : 'status-badge-red'}">
                ${isOperational ? 'OPERATIONAL' : 'OFFLINE'}
              </span>
            </div>
            <hr class="my-2" />
            <div class="row g-2">
              <div class="col-6">
                <div class="d-flex justify-content-between align-items-center">
                  <span class="text-muted small">Latitude:</span>
                  <span class="fw-bold font-monospace small">${loc.latitude.toFixed(4)}&deg;</span>
                </div>
              </div>
              <div class="col-6">
                <div class="d-flex justify-content-between align-items-center">
                  <span class="text-muted small">Longitude:</span>
                  <span class="fw-bold font-monospace small">${loc.longitude.toFixed(4)}&deg;</span>
                </div>
              </div>
            </div>
            <hr class="my-2" />
            <div class="equipment-counts d-flex justify-content-around text-center">
              <div class="equipment-count">
                <span class="count-value">${gs.antennas.length}</span>
                <span class="count-label">ANT</span>
              </div>
              <div class="equipment-count">
                <span class="count-value">${gs.rfFrontEnds.length}</span>
                <span class="count-label">RF-FE</span>
              </div>
              <div class="equipment-count">
                <span class="count-value">${gs.transmitters.length}</span>
                <span class="count-label">TX</span>
              </div>
              <div class="equipment-count">
                <span class="count-value">${gs.receivers.length}</span>
                <span class="count-label">RX</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderSatelliteCard_(sat: Satellite): string {
    const healthPercent = Math.round(sat.health * 100);
    const isHealthy = sat.health >= 0.9;
    const transponderCount = sat.transponders.length;
    const activeTransponders = sat.transponders.filter(t => t.isActive).length;

    return html`
      <div class="col-lg-4 col-md-6">
        <div class="card asset-card clickable-card h-100"
             data-asset-type="satellite"
             data-asset-id="sat-${sat.noradId}">
          <div class="card-body">
            <div class="d-flex align-items-center mb-3">
              <img src="${satellitePng}" alt="Satellite" class="asset-icon me-3" />
              <div class="flex-fill">
                <h4 class="card-title mb-0">${sat.name}</h4>
                <span class="text-muted small">NORAD ${sat.noradId}</span>
              </div>
              <span class="status-badge ${isHealthy ? 'status-badge-green' : 'status-badge-yellow'}">
                ${healthPercent}% HEALTH
              </span>
            </div>
            <hr class="my-2" />
            <div class="row g-2">
              <div class="col-6">
                <div class="d-flex justify-content-between align-items-center">
                  <span class="text-muted small">Azimuth:</span>
                  <span class="fw-bold font-monospace small">${sat.az.toFixed(1)}&deg;</span>
                </div>
              </div>
              <div class="col-6">
                <div class="d-flex justify-content-between align-items-center">
                  <span class="text-muted small">Elevation:</span>
                  <span class="fw-bold font-monospace small">${sat.el.toFixed(1)}&deg;</span>
                </div>
              </div>
            </div>
            <hr class="my-2" />
            <div class="equipment-counts d-flex justify-content-around text-center">
              <div class="equipment-count">
                <span class="count-value">${activeTransponders}/${transponderCount}</span>
                <span class="count-label">TRANSPONDERS</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  protected addEventListeners_(): void {
    // Event listeners added late after DOM is ready
  }

  private addEventListenersLate_(): void {
    // Add click handlers to asset cards
    const assetCards = this.dom_.querySelectorAll('.asset-card');
    assetCards.forEach(card => {
      card.addEventListener('click', () => {
        const type = card.getAttribute('data-asset-type') as 'ground-station' | 'satellite';
        const id = card.getAttribute('data-asset-id');

        if (type && id) {
          EventBus.getInstance().emit(Events.ASSET_SELECTED, { type, id });
        }
      });
    });
  }

  public activate(): void {
    if (this.dom_) {
      this.dom_.style.display = 'block';
    }
  }

  public deactivate(): void {
    if (this.dom_) {
      this.dom_.style.display = 'none';
    }
  }

  public dispose(): void {
    this.dom_?.remove();
  }
}
