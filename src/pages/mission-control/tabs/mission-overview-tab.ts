import { GroundStation } from '@app/assets/ground-station/ground-station';
import antennaPng from '@app/assets/icons/antenna.png';
import satellitePng from '@app/assets/icons/satellite.png';
import { BaseElement } from '@app/components/base-element';
import { html } from '@app/engine/utils/development/formatter';
import { qs } from '@app/engine/utils/query-selector';
import { Satellite } from '@app/equipment/satellite/satellite';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { SimulationManager } from '@app/simulation/simulation-manager';
import { STATION_STATUS_BADGE, stationStatusLabel } from '../station-status-label';
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
  /** Authored plus pinned satellites; every satellite of a small scenario. */
  private satellites_: Satellite[];
  private readonly boundSelectionChanged_: () => void;
  /** Station whose view of each satellite the cards show (the last one selected; the first by default) */
  private viewStationId_: string | null = null;
  private lastLookSyncMs_ = 0;
  private static readonly LOOK_SYNC_INTERVAL_MS = 1000;
  /**
   * The ground station last selected anywhere (sidebar or overview card). The
   * tab is rebuilt each time the Overview is shown, so the choice lives here,
   * not on the instance (phase 31 D16, r6-s18-F1). Cleared on scenario teardown.
   */
  private static lastSelectedStationId_: string | null = null;
  private readonly boundUpdate_: () => void;
  private readonly boundAssetSelected_: (asset: { type: 'ground-station' | 'satellite'; id: string }) => void;

  constructor(containerId: string) {
    super();
    this.groundStations_ = SimulationManager.getInstance().groundStations;
    this.satellites_ = MissionOverviewTab.cardSatellites_();
    const remembered = MissionOverviewTab.lastSelectedStationId_;
    this.viewStationId_ = this.groundStations_.some((gs) => gs.state.id === remembered) ? remembered : (this.groundStations_[0]?.state.id ?? null);
    this.init_(containerId, 'replace');
    this.dom_ = qs('.mission-overview-tab');
    this.addEventListenersLate_();

    // Look angles move (an inclined GEO's figure-8, a LEO pass): refresh them
    // live from the station's own view (phase 27, s06-F5 / r2-s18-F1)
    this.boundUpdate_ = this.throttledLookSync_.bind(this);
    this.boundAssetSelected_ = this.onAssetSelected_.bind(this);
    EventBus.getInstance().on(Events.UPDATE, this.boundUpdate_);
    EventBus.getInstance().on(Events.ASSET_SELECTED, this.boundAssetSelected_);
    this.boundSelectionChanged_ = this.onSelectionChanged_.bind(this);
    if (this.isScale_) {
      EventBus.getInstance().on(Events.SELECTION_CHANGED, this.boundSelectionChanged_);
    }
    this.syncLookAngles_();
  }

  /** With constellation members, cards exist only for authored and pinned satellites (members are in the asset tree). */
  private get isScale_(): boolean {
    return ((SimulationManager.getInstance() as { registry?: { memberCount: number } }).registry?.memberCount ?? 0) > 0;
  }

  private static cardSatellites_(): Satellite[] {
    const sim = SimulationManager.getInstance();

    return (sim as { registry?: { memberCount: number; tracked(): Satellite[] } }).registry?.tracked() ?? sim.satellites;
  }

  /** A pin was added or removed: redraw only the satellite cards. */
  private onSelectionChanged_(): void {
    const host = this.dom_?.querySelector('.mo-sat-cards');
    const next = MissionOverviewTab.cardSatellites_();

    if (!host || (next.length === this.satellites_.length && next.every((sat, i) => sat === this.satellites_[i]))) {
      return;
    }
    this.satellites_ = next;
    host.innerHTML = this.renderSatelliteCards_();
    this.bindCardClicks_(host);
    this.syncLookAngles_();
  }

  private renderSatelliteCards_(): string {
    return this.satellites_.length > 0
      ? this.satellites_.map((sat) => this.renderSatelliteCard_(sat)).join('')
      : `<div class="col-12"><p class="text-muted">No satellites in this scenario.</p></div>`;
  }

  /** Remember the selected ground station for the next Overview (phase 31 D16) */
  static rememberStation(stationId: string): void {
    MissionOverviewTab.lastSelectedStationId_ = stationId;
  }

  /** Forget the remembered station (scenario teardown) */
  static resetRememberedStation(): void {
    MissionOverviewTab.lastSelectedStationId_ = null;
  }

  private onAssetSelected_(asset: { type: 'ground-station' | 'satellite'; id: string }): void {
    if (asset.type === 'ground-station' && this.groundStations_.some((gs) => gs.state.id === asset.id)) {
      MissionOverviewTab.rememberStation(asset.id);
      this.viewStationId_ = asset.id;
      this.syncLookAngles_();
    }
  }

  private throttledLookSync_(): void {
    const now = Date.now();
    if (now - this.lastLookSyncMs_ < MissionOverviewTab.LOOK_SYNC_INTERVAL_MS) {
      return;
    }
    this.lastLookSyncMs_ = now;
    this.syncLookAngles_();
    this.syncStationStatus_();
  }

  /** Each station card's status badge, live (Phase 32 D16, nats-r7-s11-F1) */
  private syncStationStatus_(): void {
    if (!this.dom_) {
      return;
    }
    for (const gs of this.groundStations_) {
      const badge = this.dom_.querySelector(`[data-asset-id="${gs.state.id}"] .station-status-badge`);
      if (!badge) {
        continue;
      }
      const status = stationStatusLabel(gs);
      badge.textContent = status;
      badge.className = `status-badge station-status-badge ${STATION_STATUS_BADGE[status]}`;
    }
  }

  /**
   * Az/El of a satellite as the viewing station's antenna sees it. Before the
   * station's equipment exists, the satellite's own reference angles.
   */
  lookAnglesOf(sat: Satellite): { az: number; el: number; stationId: string | null } {
    const gs = this.groundStations_.find((g) => g.state.id === this.viewStationId_);
    const antenna = gs?.antennas[0];
    if (antenna) {
      const view = antenna.viewOf(sat);
      return { az: (((view.az as number) % 360) + 360) % 360, el: view.el as number, stationId: gs.state.id };
    }

    return { az: sat.az as number, el: sat.el as number, stationId: null };
  }

  private syncLookAngles_(): void {
    if (!this.dom_) {
      return;
    }
    for (const sat of this.satellites_) {
      const card = this.dom_.querySelector(`[data-asset-id="sat-${sat.noradId}"]`);
      if (!card) {
        continue;
      }
      const look = this.lookAnglesOf(sat);
      const azEl = card.querySelector('.sat-look-az');
      const elEl = card.querySelector('.sat-look-el');
      const fromEl = card.querySelector('.sat-look-from');
      if (azEl) azEl.textContent = `${look.az.toFixed(1)}\u00B0`;
      if (elEl) elEl.textContent = `${look.el.toFixed(1)}\u00B0`;
      if (fromEl) fromEl.textContent = look.stationId ? `Look angles from ${look.stationId}` : 'Reference look angles';
    }
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
          ${
            this.groundStations_.length > 0
              ? this.groundStations_.map((gs) => this.renderGroundStationCard_(gs)).join('')
              : `<div class="col-12"><p class="text-muted">No ground stations in this scenario.</p></div>`
          }

          <!-- Satellites Section -->
          <div class="col-12 mt-4">
            <h3 class="section-title">Satellites</h3>
          </div>
          ${
            this.isScale_
              ? `<div class="col-12"><p class="text-muted small">Authored and pinned satellites. Search the constellation in the asset tree and pin a member to add it here.</p></div><div class="mo-sat-cards" style="display: contents;">${this.renderSatelliteCards_()}</div>`
              : this.renderSatelliteCards_()
          }
        </div>
      </div>
    `;
  }

  private renderGroundStationCard_(gs: GroundStation): string {
    const loc = gs.state.location;
    const status = stationStatusLabel(gs);

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
              <span class="status-badge station-status-badge ${STATION_STATUS_BADGE[status]}">${status}</span>
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
                <span class="count-value">${gs.transmitters.reduce((n, tx) => n + tx.state.modems.length, 0)}</span>
                <span class="count-label">TX MODEMS</span>
              </div>
              <div class="equipment-count">
                <span class="count-value">${gs.receivers.reduce((n, rx) => n + rx.state.modems.length, 0)}</span>
                <span class="count-label">RX MODEMS</span>
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
    const activeTransponders = sat.transponders.filter((t) => t.isActive).length;

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
                  <span class="fw-bold font-monospace small sat-look-az">${sat.az.toFixed(1)}&deg;</span>
                </div>
              </div>
              <div class="col-6">
                <div class="d-flex justify-content-between align-items-center">
                  <span class="text-muted small">Elevation:</span>
                  <span class="fw-bold font-monospace small sat-look-el">${sat.el.toFixed(1)}&deg;</span>
                </div>
              </div>
              <div class="col-12">
                <span class="text-muted small sat-look-from">Reference look angles</span>
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
    this.bindCardClicks_(this.dom_);
  }

  private bindCardClicks_(root: Element): void {
    const assetCards = root.querySelectorAll('.asset-card');
    assetCards.forEach((card) => {
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
    EventBus.getInstance().off(Events.UPDATE, this.boundUpdate_);
    EventBus.getInstance().off(Events.ASSET_SELECTED, this.boundAssetSelected_);
    EventBus.getInstance().off(Events.SELECTION_CHANGED, this.boundSelectionChanged_);
    this.dom_?.remove();
  }
}
