import { BaseElement } from "@app/components/base-element";
import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import { OrbitalSatellite } from "@app/equipment/satellite/orbital-satellite";
import { EventBus } from "@app/events/event-bus";
import { Events, SimulatedTimeTickData } from "@app/events/events";
import { ScenarioManager } from "@app/scenario-manager";
import { PassPlannerService, SatellitePass, scenarioMinElevation } from "@app/services/pass-planner-service";
import { SpaceEventManager } from "@app/space-events/space-event-manager";
import { getSimulatedNowMs } from "@app/simulation/sim-time";
import { SimulationManager } from "@app/simulation/simulation-manager";
import './pass-schedule-tab.css';

/**
 * PassScheduleTab - Multi-contact mission planning (Campaign 2+)
 *
 * Displays predicted contact windows (AOS/LOS/max elevation) for all
 * SGP4-propagated satellites in the scenario, with a live countdown to the
 * next contact. Only registered when the scenario contains orbital
 * satellites, so legacy campaigns never see it.
 */
export class PassScheduleTab extends BaseElement {
  /** Recompute the schedule at most this often (simulated ms) */
  private static readonly RECOMPUTE_INTERVAL_MS = 60_000;

  /** Throttle for the ephemeris repaint on the raw update tick (ms) */
  private static readonly EPHEMERIS_SYNC_INTERVAL_MS = 1000;

  private readonly satellites_: OrbitalSatellite[];
  private readonly passPlanner_ = new PassPlannerService();
  /**
   * Amateur (backyard) scenarios reuse this tab as "Observations" and get
   * hobbyist copy - TLEs and rotators, not ephemeris and program-track.
   * Professional campaigns keep the original strings byte-identical.
   */
  private readonly isBackyard_ =
    ScenarioManager.getInstance().settings.groundStations?.some(
      (gs) => gs.stationClass === 'backyard') ?? false;
  private readonly boundTimeTickHandler_: (data: SimulatedTimeTickData) => void;
  private readonly boundUpdateHandler_: () => void;

  private passes_: SatellitePass[] = [];
  private lastComputeMs_: number = 0;
  private lastEphemerisSyncMs_ = 0;

  constructor(containerId: string) {
    super();
    this.satellites_ = SimulationManager.getInstance().satellites
      .filter((sat): sat is OrbitalSatellite => sat instanceof OrbitalSatellite);
    this.init_(containerId, 'replace');
    this.dom_ = qs('.pass-schedule-tab');

    this.boundTimeTickHandler_ = this.handleTimeTick_.bind(this);
    EventBus.getInstance().on(Events.SIMULATED_TIME_TICK, this.boundTimeTickHandler_);

    // The ephemeris notice must ALSO repaint on the raw update tick. A maneuver
    // fires on wall-clock time inside SpaceEventManager, but the scenario clock
    // (and therefore SIMULATED_TIME_TICK) is paused while a
    // freezesScenarioTimer objective is open - which is exactly when the
    // operator is reading the brief that tells them a burn happened.
    this.boundUpdateHandler_ = this.throttledEphemerisSync_.bind(this);
    EventBus.getInstance().on(Events.UPDATE, this.boundUpdateHandler_);

    this.wireEphemerisPanel_();
    this.refreshSchedule_(getSimulatedNowMs());
    this.renderRows_(getSimulatedNowMs());
  }

  protected get html_(): string {
    return html`
      <div class="pass-schedule-tab">
        <div class="row g-2 pb-6">
          <div class="col-12">
            <div class="d-flex justify-content-between align-items-center">
              <h2 class="pass-schedule-title">${this.isBackyard_ ? 'Observations' : 'Pass Schedule'}</h2>
              <span class="text-muted small">Next 12 hours &middot; all times UTC</span>
            </div>
          </div>
          <div class="col-12" id="ephemeris-panel"></div>
          <div class="col-12">
            <div class="card">
              <div class="card-body p-0">
                <table class="table table-sm mb-0 pass-schedule-table">
                  <thead>
                    <tr>
                      <th>SATELLITE</th>
                      <th>AOS</th>
                      <th>LOS</th>
                      <th>DURATION</th>
                      <th>MAX EL</th>
                      <th>AOS AZ</th>
                      <th>STATUS</th>
                    </tr>
                  </thead>
                  <tbody id="pass-schedule-rows"></tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  protected addEventListeners_(): void {
    // Listeners registered in constructor (need bound reference for dispose)
  }

  /**
   * Wire the ephemeris panel's Load button. Event delegation on the panel
   * container, so re-rendering rows never orphans the listener.
   */
  private wireEphemerisPanel_(): void {
    this.dom_?.querySelector('#ephemeris-panel')?.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLElement>('[data-ephemeris-event]');

      if (!button || !SpaceEventManager.isInitialized()) {
        return;
      }

      // Reloads the satellite's TLE, which immediately corrects pass
      // predictions and program-track pointing.
      SpaceEventManager.getInstance().applyEphemerisUpdate(button.dataset.ephemerisEvent!);
      this.refreshSchedule_(getSimulatedNowMs());
      this.renderRows_(getSimulatedNowMs());
    });
  }

  private throttledEphemerisSync_(): void {
    const now = Date.now();

    if (now - this.lastEphemerisSyncMs_ < PassScheduleTab.EPHEMERIS_SYNC_INTERVAL_MS) {
      return;
    }
    this.lastEphemerisSyncMs_ = now;
    this.renderEphemerisPanel_();
  }

  private handleTimeTick_(data: SimulatedTimeTickData): void {
    if (Math.abs(data.timestampMs - this.lastComputeMs_) >= PassScheduleTab.RECOMPUTE_INTERVAL_MS) {
      this.refreshSchedule_(data.timestampMs);
    }
    this.renderRows_(data.timestampMs);
  }

  /**
   * Operator-facing surface for M4 (space-domain events). Without this the
   * `ephemeris-updated` objective condition is unreachable in-app: the manager
   * only ever went stale on the mission clock and nothing could clear it.
   *
   * Renders nothing at all unless the scenario declares settings.spaceEvents.
   */
  private renderEphemerisPanel_(): void {
    const panel = this.dom_?.querySelector('#ephemeris-panel');

    if (!panel) {
      return;
    }

    if (!SpaceEventManager.isInitialized() || SpaceEventManager.getInstance().getEvents().length === 0) {
      panel.innerHTML = '';

      return;
    }

    const manager = SpaceEventManager.getInstance();
    const rows = manager.getEvents().map((event) => {
      const phase = manager.getPhase(event.id);
      const satellite = this.satellites_.find((sat) => sat.noradId === event.satelliteNoradId);
      const name = satellite?.name ?? `NORAD ${event.satelliteNoradId}`;
      const label = event.label ?? 'On-orbit maneuver';

      if (phase === 'stale') {
        const staleBadge = this.isBackyard_ ? 'TLE SUSPECT' : 'EPHEMERIS STALE';
        const staleDetail = this.isBackyard_
          ? `${label} — predictions and rotator tracking are running on your saved TLE, and the sky disagrees with it.`
          : `${label} — pass predictions and program-track are computed from a pre-maneuver element set.`;
        const buttonText = this.isBackyard_ ? 'Fetch Fresh Elements' : 'Load Updated Ephemeris';

        return html`
          <div class="ephemeris-row ephemeris-stale">
            <div>
              <span class="ephemeris-badge ephemeris-badge-stale">${staleBadge}</span>
              <span class="ephemeris-name">${name}</span>
              <div class="ephemeris-detail">${staleDetail}</div>
            </div>
            <button class="btn btn-sm btn-ephemeris" data-ephemeris-event="${event.id}">${buttonText}</button>
          </div>
        `;
      }

      const badge = phase === 'updated'
        ? html`<span class="ephemeris-badge ephemeris-badge-updated">UPDATED</span>`
        : html`<span class="ephemeris-badge ephemeris-badge-nominal">NOMINAL</span>`;
      const updatedDetail = this.isBackyard_
        ? 'Fresh elements loaded from the network. Predictions are current.'
        : 'Post-maneuver element set loaded. Predictions are current.';
      const nominalDetail = this.isBackyard_ ? 'Elements current.' : 'Element set current.';

      return html`
        <div class="ephemeris-row">
          <div>
            ${badge}
            <span class="ephemeris-name">${name}</span>
            <div class="ephemeris-detail">${phase === 'updated' ? updatedDetail : nominalDetail}</div>
          </div>
        </div>
      `;
    }).join('');

    panel.innerHTML = html`
      <div class="card">
        <div class="card-header"><h3 class="card-title">${this.isBackyard_ ? 'Element Sets (TLEs)' : 'Ephemeris Status'}</h3></div>
        <div class="card-body p-0">${rows}</div>
      </div>
    `;
  }

  private refreshSchedule_(nowMs: number): void {
    this.lastComputeMs_ = nowMs;
    // Include a pass that is already in progress by searching from 20 min ago
    // Same elevation mask the contact timeline deck uses, so the two surfaces
    // never show different AOS/LOS for the same pass.
    this.passes_ = this.passPlanner_.getContactSchedule(this.satellites_, nowMs - 20 * 60 * 1000, {
      minElevation: scenarioMinElevation(ScenarioManager.getInstance().settings),
    }).filter((pass) => pass.losMs > nowMs);
  }

  private renderRows_(nowMs: number): void {
    // The ephemeris notice shares this tab's refresh cadence: a maneuver fires
    // on the mission clock, so the panel must repaint on the tick, not only on
    // operator action.
    this.renderEphemerisPanel_();

    const tbody = this.dom_?.querySelector('#pass-schedule-rows');
    if (!tbody) {
      return;
    }

    if (this.satellites_.length === 0) {
      tbody.innerHTML = html`<tr><td colspan="7" class="text-muted">No orbital satellites in this scenario.</td></tr>`;
      return;
    }

    const upcoming = this.passes_.filter((pass) => pass.losMs > nowMs);

    if (upcoming.length === 0) {
      tbody.innerHTML = html`<tr><td colspan="7" class="text-muted">No contacts predicted in the planning horizon.</td></tr>`;
      return;
    }

    tbody.innerHTML = upcoming.map((pass) => this.renderRow_(pass, nowMs)).join('');
  }

  private renderRow_(pass: SatellitePass, nowMs: number): string {
    const isActive = nowMs >= pass.aosMs && nowMs <= pass.losMs;
    let status: string;
    let statusClass: string;

    if (isActive) {
      status = `IN CONTACT (LOS -${PassScheduleTab.formatCountdown_(pass.losMs - nowMs)})`;
      statusClass = 'pass-status-active';
    } else {
      status = `AOS -${PassScheduleTab.formatCountdown_(pass.aosMs - nowMs)}`;
      statusClass = 'pass-status-upcoming';
    }

    return html`
      <tr class="${isActive ? 'pass-row-active' : ''}">
        <td class="fw-bold">${pass.satelliteName}</td>
        <td class="font-monospace">${PassScheduleTab.formatTime_(pass.aosMs)}</td>
        <td class="font-monospace">${PassScheduleTab.formatTime_(pass.losMs)}</td>
        <td class="font-monospace">${PassScheduleTab.formatCountdown_(pass.durationS * 1000)}</td>
        <td class="font-monospace">${pass.maxEl.toFixed(1)}&deg;</td>
        <td class="font-monospace">${pass.aosAz.toFixed(0)}&deg;</td>
        <td><span class="${statusClass} font-monospace">${status}</span></td>
      </tr>
    `;
  }

  private static formatTime_(timestampMs: number): string {
    const d = new Date(timestampMs);
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    const ss = String(d.getUTCSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }

  private static formatCountdown_(deltaMs: number): string {
    const totalS = Math.max(0, Math.floor(deltaMs / 1000));
    const h = Math.floor(totalS / 3600);
    const m = Math.floor((totalS % 3600) / 60);
    const s = totalS % 60;
    if (h > 0) {
      return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${m}:${String(s).padStart(2, '0')}`;
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
    EventBus.getInstance().off(Events.SIMULATED_TIME_TICK, this.boundTimeTickHandler_);
    EventBus.getInstance().off(Events.UPDATE, this.boundUpdateHandler_);
    this.dom_?.remove();
  }
}
