import { BaseElement } from "@app/components/base-element";
import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import { OrbitalSatellite } from "@app/equipment/satellite/orbital-satellite";
import { EventBus } from "@app/events/event-bus";
import { Events, SimulatedTimeTickData } from "@app/events/events";
import { ScenarioManager } from "@app/scenario-manager";
import { PassPlannerService, SatellitePass, scenarioMinElevation } from "@app/services/pass-planner-service";
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

  private readonly satellites_: OrbitalSatellite[];
  private readonly passPlanner_ = new PassPlannerService();
  private readonly boundTimeTickHandler_: (data: SimulatedTimeTickData) => void;

  private passes_: SatellitePass[] = [];
  private lastComputeMs_: number = 0;

  constructor(containerId: string) {
    super();
    this.satellites_ = SimulationManager.getInstance().satellites
      .filter((sat): sat is OrbitalSatellite => sat instanceof OrbitalSatellite);
    this.init_(containerId, 'replace');
    this.dom_ = qs('.pass-schedule-tab');

    this.boundTimeTickHandler_ = this.handleTimeTick_.bind(this);
    EventBus.getInstance().on(Events.SIMULATED_TIME_TICK, this.boundTimeTickHandler_);

    this.refreshSchedule_(getSimulatedNowMs());
    this.renderRows_(getSimulatedNowMs());
  }

  protected get html_(): string {
    return html`
      <div class="pass-schedule-tab">
        <div class="row g-2 pb-6">
          <div class="col-12">
            <div class="d-flex justify-content-between align-items-center">
              <h2 class="pass-schedule-title">Pass Schedule</h2>
              <span class="text-muted small">Next 12 hours &middot; all times UTC</span>
            </div>
          </div>
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

  private handleTimeTick_(data: SimulatedTimeTickData): void {
    if (Math.abs(data.timestampMs - this.lastComputeMs_) >= PassScheduleTab.RECOMPUTE_INTERVAL_MS) {
      this.refreshSchedule_(data.timestampMs);
    }
    this.renderRows_(data.timestampMs);
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
    this.dom_?.remove();
  }
}
