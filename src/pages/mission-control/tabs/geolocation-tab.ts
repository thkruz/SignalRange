import { BaseElement } from '@app/components/base-element';
import { GeoMap, type GeoMapLayers, type GeoMarker } from '@app/components/geo-map/geo-map';
import { html } from '@app/engine/utils/development/formatter';
import { qs } from '@app/engine/utils/query-selector';
import {
  GeolocationConsoleCore,
  type ConsoleMeasurement,
  type GeolocationConsoleState,
} from '@app/equipment/geolocation-console/geolocation-console-core';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import './geolocation-tab.css';

/**
 * GeolocationTab - Two-satellite interference geolocation console (Campaign 5)
 *
 * Operator flow: pick an adjacent satellite, tune the correlator to the
 * interferer's uplink, CAPTURE while the jammer is transmitting (integration
 * only succeeds when the duty-cycled interferer is up), then COMPUTE FIX to
 * cross the accumulated TDOA/FDOA lines of position and drop an error ellipse
 * on the geographic map.
 *
 * Only registered when the scenario declares settings.geolocation, so
 * legacy campaigns never see this tab.
 */
export class GeolocationTab extends BaseElement {
  /** Throttle interval for passive DOM sync on the sim tick (ms) */
  private static readonly UPDATE_INTERVAL_MS = 500;

  private readonly core_: GeolocationConsoleCore;
  private readonly map_: GeoMap;
  private readonly boundUpdateHandler_: () => void;
  private readonly domCache_ = new Map<string, HTMLElement>();

  private lastSyncTime_ = 0;

  constructor(containerId: string) {
    super();
    this.core_ = GeolocationConsoleCore.getInstance();
    // Wide backing resolution so the full-width map stays crisp; CSS scales it
    // down to the card width (2:1 keeps the whole globe visible when zoomed out).
    this.map_ = new GeoMap('geo-map-fix', { width: 1000, height: 500 });

    this.init_(containerId, 'replace');
    // dom_ must be set before wiring DOM listeners: init_ -> addEventListeners_
    // runs while dom_ is still null, so listeners are wired here instead.
    this.dom_ = qs('.geolocation-tab');
    this.map_.attach(this.dom_);
    this.wireDomListeners_();

    this.boundUpdateHandler_ = this.throttledSync_.bind(this);
    EventBus.getInstance().on(Events.UPDATE, this.boundUpdateHandler_);

    this.syncDomWithState_();
    this.renderMap_();
  }

  protected get html_(): string {
    const adjacentOptions = this.core_.adjacentSatellites
      .map((sat) => html`<option value="${sat.noradId}">${sat.name}</option>`)
      .join('');

    return html`
      <div class="geolocation-tab">
        <div class="row g-2 pb-6">
          <div class="col-12">
            <div class="d-flex justify-content-between align-items-center">
              <h2 class="geo-title">Interference Geolocation</h2>
              <span class="text-muted small">Two-satellite TDOA / FDOA cross-fix</span>
            </div>
          </div>

          <div class="col-lg-6">
            <div class="card h-100">
              <div class="card-header"><h3 class="card-title">Correlator</h3></div>
              <div class="card-body">
                <div class="mb-3">
                  <label class="form-label geo-label">ADJACENT SATELLITE</label>
                  <select id="geo-adjacent-select" class="form-select">${adjacentOptions}</select>
                  <div class="text-muted small mt-1">
                    Primary (victim): <span id="geo-primary-name" class="font-monospace"></span>
                  </div>
                </div>

                <div class="equip-adjust-control">
                  <label class="equip-adjust-label">TARGET FREQUENCY</label>
                  <div class="equip-adjust-row">
                    <div class="equip-adjust-buttons equip-adjust-decrease">
                      <button id="geo-freq-dec-coarse" class="btn-equip" title="-10 MHz">-10</button>
                      <button id="geo-freq-dec-fine" class="btn-equip" title="-1 MHz">-1</button>
                    </div>
                    <div class="equip-adjust-display">
                      <input type="number" id="geo-freq-value" class="equip-adjust-input" step="any" />
                    </div>
                    <div class="equip-adjust-buttons equip-adjust-increase">
                      <button id="geo-freq-inc-fine" class="btn-equip" title="+1 MHz">+1</button>
                      <button id="geo-freq-inc-coarse" class="btn-equip" title="+10 MHz">+10</button>
                    </div>
                    <span class="equip-adjust-unit">MHz</span>
                  </div>
                </div>

                <div class="equip-adjust-control">
                  <label class="equip-adjust-label">CORRELATION BANDWIDTH</label>
                  <div class="equip-adjust-row">
                    <div class="equip-adjust-buttons equip-adjust-decrease">
                      <button id="geo-bw-dec-coarse" class="btn-equip" title="-1 MHz">-1</button>
                      <button id="geo-bw-dec-fine" class="btn-equip" title="-0.5 MHz">-.5</button>
                    </div>
                    <div class="equip-adjust-display">
                      <input type="number" id="geo-bw-value" class="equip-adjust-input" step="any" />
                    </div>
                    <div class="equip-adjust-buttons equip-adjust-increase">
                      <button id="geo-bw-inc-fine" class="btn-equip" title="+0.5 MHz">+.5</button>
                      <button id="geo-bw-inc-coarse" class="btn-equip" title="+1 MHz">+1</button>
                    </div>
                    <span class="equip-adjust-unit">MHz</span>
                  </div>
                </div>

                <div class="geo-capture-row">
                  <button id="geo-capture-btn" class="btn btn-primary">CAPTURE</button>
                  <button id="geo-auto-btn" class="btn btn-outline-primary" title="Keep capturing through the interferer's on/off cycle">AUTO</button>
                  <button id="geo-compute-btn" class="btn btn-outline-primary">COMPUTE FIX</button>
                  <button id="geo-clear-btn" class="btn btn-ghost-secondary">CLEAR</button>
                </div>
                <div class="geo-progress">
                  <div id="geo-progress-bar" class="geo-progress-bar"></div>
                </div>
                <div id="geo-capture-msg" class="geo-capture-msg font-monospace"></div>
              </div>
            </div>
          </div>

          <div class="col-lg-6">
            <div class="card h-100">
              <div class="card-header"><h3 class="card-title">Captured Measurements</h3></div>
              <div class="card-body p-0 geo-measurement-scroll">
                <table class="table table-sm mb-0 geo-measurement-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>TIME</th>
                      <th>ADJACENT</th>
                      <th>TDOA (µs)</th>
                      <th>FDOA (Hz)</th>
                    </tr>
                  </thead>
                  <tbody id="geo-measurement-rows"></tbody>
                </table>
              </div>
            </div>
          </div>

          <div class="col-12">
            <div class="card">
              <div class="card-header d-flex justify-content-between align-items-center">
                <h3 class="card-title">Emitter Fix</h3>
                <span id="geo-fix-summary" class="font-monospace small text-muted">No fix computed</span>
              </div>
              <div class="card-body text-center">
                <div id="geo-map-mount" class="geo-map-mount">${this.map_.outerHtml}</div>
                <div class="text-muted small mt-2">Scroll to zoom, drag to pan — zoom in where the TDOA and FDOA lines cross.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  protected addEventListeners_(): void {
    // DOM listeners are wired in wireDomListeners_ after this.dom_ is assigned
    // (init_ calls this hook while dom_ is still null).
  }

  private wireDomListeners_(): void {
    const select = this.cache_('geo-adjacent-select') as HTMLSelectElement;
    select?.addEventListener('change', () => {
      this.core_.selectAdjacent(parseInt(select.value, 10));
      this.syncDomWithState_();
      this.renderMap_();
    });

    this.wireAdjust_('geo-freq-dec-coarse', () => this.core_.adjustStagedFrequencyMHz(-10));
    this.wireAdjust_('geo-freq-dec-fine', () => this.core_.adjustStagedFrequencyMHz(-1));
    this.wireAdjust_('geo-freq-inc-fine', () => this.core_.adjustStagedFrequencyMHz(1));
    this.wireAdjust_('geo-freq-inc-coarse', () => this.core_.adjustStagedFrequencyMHz(10));
    this.wireAdjust_('geo-bw-dec-coarse', () => this.core_.adjustStagedBandwidthMHz(-1));
    this.wireAdjust_('geo-bw-dec-fine', () => this.core_.adjustStagedBandwidthMHz(-0.5));
    this.wireAdjust_('geo-bw-inc-fine', () => this.core_.adjustStagedBandwidthMHz(0.5));
    this.wireAdjust_('geo-bw-inc-coarse', () => this.core_.adjustStagedBandwidthMHz(1));

    const freqInput = this.cache_('geo-freq-value') as HTMLInputElement;
    freqInput?.addEventListener('change', () => {
      this.core_.setStagedFrequencyMHz(parseFloat(freqInput.value) || 0);
    });
    const bwInput = this.cache_('geo-bw-value') as HTMLInputElement;
    bwInput?.addEventListener('change', () => {
      this.core_.setStagedBandwidthMHz(parseFloat(bwInput.value) || 0);
    });

    this.cache_('geo-capture-btn')?.addEventListener('click', () => {
      this.core_.startCapture();
      this.syncDomWithState_();
    });
    this.cache_('geo-auto-btn')?.addEventListener('click', () => {
      this.core_.toggleAutoCapture();
      this.syncDomWithState_();
    });
    this.cache_('geo-compute-btn')?.addEventListener('click', () => {
      this.core_.computeFix();
      this.syncDomWithState_();
      this.renderMap_();
    });
    this.cache_('geo-clear-btn')?.addEventListener('click', () => {
      this.core_.clearMeasurements();
      this.syncDomWithState_();
      this.renderMap_();
    });
  }

  private wireAdjust_(id: string, action: () => void): void {
    this.cache_(id)?.addEventListener('click', () => {
      action();
      this.syncStagedInputs_();
    });
  }

  private throttledSync_(): void {
    const now = Date.now();
    if (now - this.lastSyncTime_ < GeolocationTab.UPDATE_INTERVAL_MS) {
      return;
    }
    this.lastSyncTime_ = now;
    this.syncDomWithState_();
    const state = this.core_.state;
    if (state.captureStatus === 'success' || state.autoCapture) {
      this.renderMap_();
    }
  }

  private syncDomWithState_(): void {
    const state = this.core_.state;

    const primaryName = this.cache_('geo-primary-name');
    if (primaryName) {
      primaryName.textContent = this.core_.primarySatellite?.name ?? 'N/A';
    }

    const select = this.cache_('geo-adjacent-select') as HTMLSelectElement;
    if (select && document.activeElement !== select) {
      select.value = String(state.selectedAdjacentNoradId);
    }

    this.syncStagedInputs_();

    const progressBar = this.cache_('geo-progress-bar');
    if (progressBar) {
      progressBar.style.width = `${Math.round(state.captureProgress * 100)}%`;
      progressBar.classList.toggle('is-integrating', state.captureStatus === 'integrating');
    }

    const msg = this.cache_('geo-capture-msg');
    if (msg) {
      msg.textContent = state.lastCaptureMessage;
      msg.className = `geo-capture-msg font-monospace geo-msg-${state.captureStatus}`;
    }

    const captureBtn = this.cache_('geo-capture-btn') as HTMLButtonElement;
    if (captureBtn) {
      // Manual capture is driven by the auto loop while it's running
      captureBtn.disabled = state.captureStatus === 'integrating' || state.autoCapture;
    }

    const autoBtn = this.cache_('geo-auto-btn') as HTMLButtonElement;
    if (autoBtn) {
      autoBtn.classList.toggle('is-active', state.autoCapture);
      autoBtn.textContent = state.autoCapture ? 'AUTO ●' : 'AUTO';
    }

    this.renderMeasurementRows_(state.measurements);
    this.renderFixSummary_(state);
  }

  private syncStagedInputs_(): void {
    const state = this.core_.state;
    const freqInput = this.cache_('geo-freq-value') as HTMLInputElement;
    if (freqInput && document.activeElement !== freqInput) {
      freqInput.value = state.stagedFrequencyMHz.toString();
    }
    const bwInput = this.cache_('geo-bw-value') as HTMLInputElement;
    if (bwInput && document.activeElement !== bwInput) {
      bwInput.value = state.stagedBandwidthMHz.toString();
    }
  }

  private renderMeasurementRows_(measurements: ConsoleMeasurement[]): void {
    const tbody = this.dom_?.querySelector('#geo-measurement-rows');
    if (!tbody) {
      return;
    }
    if (measurements.length === 0) {
      tbody.innerHTML = html`<tr><td colspan="5" class="text-muted">No captures yet. Tune to the interferer and CAPTURE while it transmits.</td></tr>`;
      return;
    }

    const nameFor = (noradId: number): string =>
      this.core_.adjacentSatellites.find((sat) => sat.noradId === noradId)?.name ?? String(noradId);

    tbody.innerHTML = measurements
      .map((m) => html`
        <tr>
          <td class="font-monospace">${m.measurement.id}</td>
          <td class="font-monospace">${GeolocationTab.formatTime_(m.measurement.timestampMs)}</td>
          <td class="font-monospace">${nameFor(m.adjacentNoradId)}</td>
          <td class="font-monospace">${(m.measurement.tdoaS * 1e6).toFixed(2)}</td>
          <td class="font-monospace">${m.measurement.fdoaHz.toFixed(1)}</td>
        </tr>
      `)
      .join('');
  }

  private renderFixSummary_(state: GeolocationConsoleState): void {
    const summary = this.cache_('geo-fix-summary');
    if (!summary) {
      return;
    }
    if (!state.fix) {
      summary.textContent = 'No fix computed';
      return;
    }

    const ellipse = state.fix.errorEllipse;
    const ellipseText = ellipse
      ? ` · ±${ellipse.semiMajorKm.toFixed(0)}×${ellipse.semiMinorKm.toFixed(0)} km (95%)`
      : ' · geometry singular';
    summary.textContent =
      `${state.fix.lat.toFixed(3)}°, ${state.fix.lon.toFixed(3)}°${ellipseText}`;
  }

  private renderMap_(): void {
    const state = this.core_.state;
    const markers: GeoMarker[] = [];

    const now = state.measurements.length > 0
      ? state.measurements[state.measurements.length - 1].measurement.timestampMs
      : Date.now();
    const primary = this.core_.primarySatellite;
    if (primary) {
      const lla = primary.ootkSatellite.lla(new Date(now));
      markers.push({ lat: lla.lat, lon: lla.lon, label: primary.name, kind: 'satellite' });
    }
    const adjacent = this.core_.adjacentSatellites.find((sat) => sat.noradId === state.selectedAdjacentNoradId);
    if (adjacent) {
      const lla = adjacent.ootkSatellite.lla(new Date(now));
      markers.push({ lat: lla.lat, lon: lla.lon, label: adjacent.name, kind: 'satellite' });
    }

    if (state.fix) {
      markers.push({ lat: state.fix.lat, lon: state.fix.lon, label: 'FIX', kind: 'fix' });
    }

    const layers: GeoMapLayers = {
      markers,
      lops: this.core_.getLopDescriptors(),
      fix: state.fix ? { lat: state.fix.lat, lon: state.fix.lon, ellipse: state.fix.errorEllipse } : null,
    };
    this.map_.setLayers(layers);
  }

  private cache_(id: string): HTMLElement | null {
    const cached = this.domCache_.get(id);
    if (cached) {
      return cached;
    }
    const el = this.dom_?.querySelector<HTMLElement>(`#${id}`) ?? null;
    if (el) {
      this.domCache_.set(id, el);
    }
    return el;
  }

  private static formatTime_(timestampMs: number): string {
    const d = new Date(timestampMs);
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    const ss = String(d.getUTCSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }

  public activate(): void {
    if (this.dom_) {
      this.dom_.style.display = 'block';
    }
    this.renderMap_();
  }

  public deactivate(): void {
    if (this.dom_) {
      this.dom_.style.display = 'none';
    }
  }

  public dispose(): void {
    EventBus.getInstance().off(Events.UPDATE, this.boundUpdateHandler_);
    this.map_.dispose();
    this.domCache_.clear();
    this.dom_?.remove();
  }
}
