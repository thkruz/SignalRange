import { BaseElement } from '@app/components/base-element';
import { html } from '@app/engine/utils/development/formatter';
import { qs } from '@app/engine/utils/query-selector';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { type TelemetryBand, TelemetryManager, type TelemetryReading } from '@app/telemetry/telemetry-manager';
import './telemetry-tab.css';

const BAND_DISPLAY: Record<TelemetryBand, { label: string; cls: string }> = {
  green: { label: 'NOMINAL', cls: 'tlm-badge-good' },
  yellow: { label: 'YELLOW', cls: 'tlm-badge-warn' },
  red: { label: 'RED', cls: 'tlm-badge-bad' },
};

/**
 * TelemetryTab - read-only spacecraft state-of-health display (phase 18 E)
 *
 * Channels grouped by subsystem, each with its value, limit bands and band
 * badge; a frame counter and a LIVE / STALE link badge. Nothing here is a
 * control: the operator reads, and the telemetry-* conditions grade what was
 * read (pair them with requiresObservation on this tab).
 *
 * Only registered when the scenario declares settings.telemetry.
 */
export class TelemetryTab extends BaseElement {
  private static readonly UPDATE_INTERVAL_MS = 1000;

  private readonly boundUpdateHandler_: () => void;
  private lastSyncTime_ = 0;

  constructor(containerId: string) {
    super();
    this.init_(containerId, 'replace');
    this.dom_ = qs('.telemetry-tab');
    this.boundUpdateHandler_ = this.throttledSync_.bind(this);
    EventBus.getInstance().on(Events.UPDATE, this.boundUpdateHandler_);
    this.syncDomWithState_();
  }

  protected get html_(): string {
    const config = TelemetryManager.getInstance().getConfig();
    const subsystems = [...new Set(config.channels.map((c) => c.subsystem))];

    const groups = subsystems
      .map(
        (sub) => html`
      <div class="col-lg-6">
        <div class="card h-100">
          <div class="card-header"><h3 class="card-title">${sub}</h3></div>
          <div class="card-body p-0">
            <table class="table table-sm tlm-table mb-0">
              <thead><tr><th>Channel</th><th class="text-end">Value</th><th>Limits</th><th>State</th></tr></thead>
              <tbody>
                ${config.channels
                  .filter((c) => c.subsystem === sub)
                  .map(
                    (c) => html`
                  <tr data-channel-id="${c.id}">
                    <td>${c.label}<div class="text-muted small font-monospace">${c.id}</div></td>
                    <td class="text-end font-monospace tlm-value">--</td>
                    <td class="text-muted small font-monospace">${TelemetryTab.limitsLabel_(c)}</td>
                    <td><span class="tlm-badge tlm-badge-muted tlm-band">--</span></td>
                  </tr>`
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>`
      )
      .join('');

    return html`
      <div class="telemetry-tab">
        <div class="row g-2 pb-6">
          <div class="col-12">
            <div class="d-flex justify-content-between align-items-center">
              <h2 class="tlm-title">Spacecraft Telemetry</h2>
              <span class="text-muted small">NORAD ${config.satelliteNoradId} via ${config.groundStationId}</span>
            </div>
          </div>
          <div class="col-12">
            <div class="card">
              <div class="card-body d-flex flex-wrap gap-4 align-items-center">
                <div><span class="text-muted small">Link:</span> <span id="tlm-link-badge" class="tlm-badge tlm-badge-muted">NO LINK</span></div>
                <div><span class="text-muted small">Frames:</span> <span id="tlm-frames" class="fw-bold font-monospace">0</span></div>
                <div><span class="text-muted small">Last frame:</span> <span id="tlm-age" class="fw-bold font-monospace">--</span></div>
                <div><span class="text-muted small">State of health:</span> <span id="tlm-soh-badge" class="tlm-badge tlm-badge-muted">--</span></div>
              </div>
            </div>
          </div>
          ${groups}
        </div>
      </div>
    `;
  }

  private static limitsLabel_(c: { yellowLow?: number; yellowHigh?: number; redLow?: number; redHigh?: number; unit: string }): string {
    const y = c.yellowLow !== undefined || c.yellowHigh !== undefined ? `Y ${c.yellowLow ?? '-'}..${c.yellowHigh ?? '-'}` : '';
    const r = c.redLow !== undefined || c.redHigh !== undefined ? `R ${c.redLow ?? '-'}..${c.redHigh ?? '-'}` : '';

    return [y, r].filter(Boolean).join(' / ') || 'none';
  }

  protected addEventListeners_(): void {
    // Read-only console: nothing to wire
  }

  private throttledSync_(): void {
    const now = Date.now();
    if (now - this.lastSyncTime_ < TelemetryTab.UPDATE_INTERVAL_MS) return;
    this.lastSyncTime_ = now;
    this.syncDomWithState_();
  }

  private syncDomWithState_(): void {
    if (!this.dom_) return;
    const mgr = TelemetryManager.getInstance();
    const stale = mgr.isStale;

    const link = this.dom_.querySelector<HTMLElement>('#tlm-link-badge');
    if (link) {
      const linked = mgr.isLinked();
      link.textContent = stale ? (linked ? 'ACQUIRING' : 'STALE') : 'LIVE';
      link.className = `tlm-badge ${stale ? (linked ? 'tlm-badge-warn' : 'tlm-badge-bad') : 'tlm-badge-good'}`;
    }
    const frames = this.dom_.querySelector<HTMLElement>('#tlm-frames');
    if (frames) frames.textContent = String(mgr.frameCount);
    const age = this.dom_.querySelector<HTMLElement>('#tlm-age');
    if (age) age.textContent = Number.isFinite(mgr.secondsSinceFrame) ? `${mgr.secondsSinceFrame.toFixed(0)} s ago` : '--';

    const soh = this.dom_.querySelector<HTMLElement>('#tlm-soh-badge');
    if (soh) {
      const worst: TelemetryBand = mgr.hasBand('red') ? 'red' : mgr.hasBand('yellow') ? 'yellow' : 'green';
      if (stale) {
        soh.textContent = 'UNKNOWN';
        soh.className = 'tlm-badge tlm-badge-muted';
      } else {
        soh.textContent = BAND_DISPLAY[worst].label;
        soh.className = `tlm-badge ${BAND_DISPLAY[worst].cls}`;
      }
    }

    for (const reading of mgr.getReadings()) this.syncRow_(reading, stale);
  }

  private syncRow_(reading: TelemetryReading, stale: boolean): void {
    const row = this.dom_?.querySelector<HTMLElement>(`tr[data-channel-id="${reading.id}"]`);
    if (!row) return;
    const value = row.querySelector<HTMLElement>('.tlm-value');
    const band = row.querySelector<HTMLElement>('.tlm-band');
    const hasFrame = Number.isFinite(TelemetryManager.getInstance().secondsSinceFrame);
    if (value) value.textContent = hasFrame ? `${reading.value.toFixed(reading.decimals)} ${reading.unit}` : '--';
    if (band) {
      if (!hasFrame) {
        band.textContent = '--';
        band.className = 'tlm-badge tlm-badge-muted tlm-band';
      } else {
        const display = BAND_DISPLAY[reading.band];
        band.textContent = stale ? `${display.label} (STALE)` : display.label;
        band.className = `tlm-badge ${display.cls} tlm-band${stale ? ' tlm-stale' : ''}`;
      }
    }
  }

  public activate(): void {
    if (this.dom_) this.dom_.style.display = 'block';
    this.syncDomWithState_();
  }

  public deactivate(): void {
    if (this.dom_) this.dom_.style.display = 'none';
  }

  public dispose(): void {
    EventBus.getInstance().off(Events.UPDATE, this.boundUpdateHandler_);
    this.dom_?.remove();
  }
}
