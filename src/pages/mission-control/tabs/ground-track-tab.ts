import { BaseElement } from '@app/components/base-element';
import { GeoMap, type GeoFootprint, type GeoMapLayers, type GeoMarker, type GeoTrack } from '@app/components/geo-map/geo-map';
import { html } from '@app/engine/utils/development/formatter';
import { qs } from '@app/engine/utils/query-selector';
import { OrbitalSatellite } from '@app/equipment/satellite/orbital-satellite';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { groundTrack, visibilityRadiusDeg, type GroundPoint } from '@app/services/ground-track-math';
import { getSimulatedNowMs } from '@app/simulation/sim-time';
import { SimulationManager } from '@app/simulation/simulation-manager';
import type { Degrees } from 'ootk';
import './ground-track-tab.css';

/** Track legs run this far either side of "now" (minutes). */
const TRACK_HALF_SPAN_MIN = 45;
/** Sub-point sampling step (s). 30 s ~ 220 km of LEO ground travel per sample. */
const TRACK_STEP_S = 30;
/** Elevation mask the visibility circles are drawn for. */
const FOOTPRINT_MIN_ELEVATION = 5 as Degrees;
/**
 * Track geometry is only re-propagated this often; the live sub-point marker is
 * interpolated between samples every draw, so the map still moves smoothly.
 */
const RETRACK_INTERVAL_MS = 30_000;

/** Distinct track colors, assigned by catalog order so they stay stable. */
const TRACK_COLORS = ['#e8ebee', '#7ad0ff', '#ffd07a', '#8fe388', '#ff9ecb', '#c3a6ff'];

/**
 * GroundTrackTab - live 2D world map of where the satellites actually are.
 *
 * Renders every orbital satellite's sub-point, ground track (solid behind,
 * dotted ahead) and coverage footprint at a 5 deg mask, each ground station as
 * a marker, and the day/night terminator for the current *scenario* time.
 *
 * Two visibility circles are available and mean different things. Coverage
 * (blue, on by default) rides the satellite: everywhere that can work this
 * bird. Station access (amber, opt-in) rides the station: everywhere the bird
 * could be and still clear the mask. The second is only offered on the focused
 * satellite tab, because its radius depends on which satellite you mean - an
 * unlabeled station-centered circle is what made a GEO target look like the
 * site could see to northern Japan.
 *
 * The same component serves two placements: with a `focusSatellite` it is the
 * per-satellite tab in the satellite asset tab set (that bird highlighted and
 * centered on first paint); without one it is the mission-overview world map,
 * where every asset is drawn equally.
 *
 * Only registered when the scenario has SGP4 satellites — a GEO-only scenario
 * has nothing worth tracking.
 */
export class GroundTrackTab extends BaseElement {
  /** Throttle interval for passive DOM sync on the sim tick (ms) */
  private static readonly UPDATE_INTERVAL_MS = 1000;

  private readonly map_: GeoMap;
  private readonly focusNoradId_: number | null;
  private readonly boundUpdateHandler_: () => void;
  private readonly domCache_ = new Map<string, HTMLElement>();

  private lastSyncTime_ = 0;
  private lastTrackBuildMs_ = 0;
  private tracks_ = new Map<number, GroundPoint[]>();
  private showFootprints_ = true;
  /**
   * Station access circles. Off by default and only offered on the focused
   * satellite tab: the radius depends on which bird you mean, so on the
   * all-assets overview map there is no honest answer to draw.
   */
  private showAccess_ = false;
  private showTerminator_ = true;
  private hasCentered_ = false;

  constructor(containerId: string, focusSatellite?: OrbitalSatellite) {
    super();
    this.focusNoradId_ = focusSatellite?.noradId ?? null;
    // Wide backing resolution so the full-width map stays crisp; CSS scales it
    // down to the card width (2:1 fits the whole globe when zoomed out).
    this.map_ = new GeoMap(`ground-track-map-${this.focusNoradId_ ?? 'all'}`, { width: 1200, height: 600 });

    this.init_(containerId, 'replace');
    // dom_ must be set before wiring DOM listeners: init_ -> addEventListeners_
    // runs while dom_ is still null, so listeners are wired here instead.
    this.dom_ = qs('.ground-track-tab');
    this.map_.attach(this.dom_);
    this.wireDomListeners_();

    this.boundUpdateHandler_ = this.throttledSync_.bind(this);
    EventBus.getInstance().on(Events.UPDATE, this.boundUpdateHandler_);

    this.rebuildTracks_(getSimulatedNowMs());
    this.renderMap_();
    this.syncDomWithState_();
  }

  protected get html_(): string {
    return html`
      <div class="ground-track-tab">
        <div class="row g-2 pb-6">
          <div class="col-12">
            <div class="d-flex justify-content-between align-items-center">
              <h2 class="gt-title">Ground Track</h2>
              <span class="text-muted small">Sub-satellite point · coverage footprint · station access · day/night</span>
            </div>
          </div>

          <div class="col-12">
            <div class="card">
              <div class="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
                <h3 class="card-title">World View</h3>
                <div class="d-flex align-items-center gap-3">
                  <label class="form-check form-switch mb-0">
                    <input class="form-check-input" type="checkbox" id="gt-toggle-footprints" checked />
                    <span class="form-check-label small">Sat coverage</span>
                  </label>
                  ${this.focusNoradId_ === null ? '' : html`
                    <label class="form-check form-switch mb-0">
                      <input class="form-check-input" type="checkbox" id="gt-toggle-access" />
                      <span class="form-check-label small">Station access</span>
                    </label>
                  `}
                  <label class="form-check form-switch mb-0">
                    <input class="form-check-input" type="checkbox" id="gt-toggle-terminator" checked />
                    <span class="form-check-label small">Day/night</span>
                  </label>
                  <span id="gt-clock" class="font-monospace small text-muted"></span>
                </div>
              </div>
              <div class="card-body text-center">
                <div id="gt-map-mount" class="gt-map-mount">${this.map_.outerHtml}</div>
                <div class="text-muted small mt-2">Scroll to zoom, drag to pan. Solid track is where the satellite has been; dotted is where it is going.</div>
              </div>
            </div>
          </div>

          <div class="col-12">
            <div class="card">
              <div class="card-header"><h3 class="card-title">Sub-Satellite Points</h3></div>
              <div class="card-body p-0">
                <div class="table-responsive">
                  <table class="table table-sm card-table font-monospace mb-0">
                    <thead>
                      <tr>
                        <th>Satellite</th>
                        <th class="text-end">Latitude</th>
                        <th class="text-end">Longitude</th>
                        <th class="text-end">Altitude</th>
                      </tr>
                    </thead>
                    <tbody id="gt-subpoint-rows"></tbody>
                  </table>
                </div>
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
    const footprints = this.cache_('gt-toggle-footprints') as HTMLInputElement;

    footprints?.addEventListener('change', () => {
      this.showFootprints_ = footprints.checked;
      this.renderMap_();
    });

    const access = this.cache_('gt-toggle-access') as HTMLInputElement | null;

    access?.addEventListener('change', () => {
      this.showAccess_ = access.checked;
      this.renderMap_();
    });

    const terminator = this.cache_('gt-toggle-terminator') as HTMLInputElement;

    terminator?.addEventListener('change', () => {
      this.showTerminator_ = terminator.checked;
      this.renderMap_();
    });
  }

  private cache_(id: string): HTMLElement | null {
    if (!this.domCache_.has(id)) {
      const el = this.dom_?.querySelector(`#${id}`);

      if (el) {
        this.domCache_.set(id, el as HTMLElement);
      }
    }

    return this.domCache_.get(id) ?? null;
  }

  private throttledSync_(): void {
    const now = Date.now();

    if (now - this.lastSyncTime_ < GroundTrackTab.UPDATE_INTERVAL_MS) {
      return;
    }
    this.lastSyncTime_ = now;

    const simNowMs = getSimulatedNowMs();

    // Re-propagating every tick is wasteful (and the geometry barely moves);
    // the live marker interpolates between samples in the meantime.
    if (simNowMs - this.lastTrackBuildMs_ > RETRACK_INTERVAL_MS || simNowMs < this.lastTrackBuildMs_) {
      this.rebuildTracks_(simNowMs);
    }

    this.renderMap_();
    this.syncDomWithState_();
  }

  private orbitalSatellites_(): OrbitalSatellite[] {
    return SimulationManager.getInstance().satellites.filter(
      (sat): sat is OrbitalSatellite => sat instanceof OrbitalSatellite,
    );
  }

  /**
   * Re-propagate every satellite's track window around `simNowMs`. Also called
   * when the clock jumps backwards (checkpoint restore, advanceSimClock).
   */
  private rebuildTracks_(simNowMs: number): void {
    const halfSpanMs = TRACK_HALF_SPAN_MIN * 60 * 1000;
    const next = new Map<number, GroundPoint[]>();

    for (const sat of this.orbitalSatellites_()) {
      next.set(sat.noradId, groundTrack(sat, simNowMs - halfSpanMs, simNowMs + halfSpanMs, TRACK_STEP_S));
    }

    this.tracks_ = next;
    this.lastTrackBuildMs_ = simNowMs;
  }

  private renderMap_(): void {
    const simNowMs = getSimulatedNowMs();
    const satellites = this.orbitalSatellites_();
    const tracks: GeoTrack[] = [];
    const markers: GeoMarker[] = [];
    const footprints: GeoFootprint[] = [];

    satellites.forEach((sat, index) => {
      const points = this.tracks_.get(sat.noradId);

      if (!points || points.length === 0) {
        return;
      }

      tracks.push({
        points,
        nowMs: simNowMs,
        label: sat.name,
        color: TRACK_COLORS[index % TRACK_COLORS.length],
        isHighlighted: this.focusNoradId_ === null || sat.noradId === this.focusNoradId_,
      });
    });

    // The focused bird, if this is the per-satellite placement. Its altitude is
    // what makes a station access circle answerable.
    const focus = satellites.find((sat) => sat.noradId === this.focusNoradId_);
    const focusAltKm = focus?.lla?.alt ?? 0;

    for (const station of SimulationManager.getInstance().groundStations) {
      const { latitude, longitude } = station.state.location;

      markers.push({ lat: latitude, lon: longitude, label: station.state.id, kind: 'station' });

      if (this.showAccess_ && focus && focusAltKm > 0) {
        footprints.push({
          lat: latitude,
          lon: longitude,
          radiusDeg: visibilityRadiusDeg(focusAltKm, FOOTPRINT_MIN_ELEVATION),
          label: `${station.state.id} access to ${focus.name}`,
          kind: 'access',
        });
      }
    }

    // Coverage circles ride the satellites, not the stations. Drawn around a
    // station the circle is the region a bird at that altitude would clear the
    // mask from - true, but for a GEO target it is a fixed 76 deg blob centered
    // on the site, which reads as "this station can see to northern Japan".
    // Centered on the sub-point it is the ordinary satellite footprint: the
    // area that can work the bird, with the station either inside it or not.
    if (this.showFootprints_) {
      for (const sat of satellites) {
        const altKm = sat.lla?.alt ?? 0;

        if (!sat.lla || altKm <= 0) {
          continue;
        }

        footprints.push({
          lat: sat.lla.lat,
          lon: sat.lla.lon,
          radiusDeg: visibilityRadiusDeg(altKm, FOOTPRINT_MIN_ELEVATION),
          label: sat.name,
          kind: 'coverage',
        });
      }
    }

    const layers: GeoMapLayers = {
      markers,
      lops: [],
      tracks,
      footprints,
      terminator: this.showTerminator_ ? new Date(simNowMs) : null,
    };

    this.map_.setLayers(layers);

    // Open centered on the focused satellite so the operator does not have to
    // hunt for it; afterwards the view is theirs to pan.
    if (!this.hasCentered_ && this.focusNoradId_ !== null) {
      const focus = satellites.find((sat) => sat.noradId === this.focusNoradId_);

      if (focus?.lla) {
        this.map_.centerOn(focus.lla.lat, focus.lla.lon);
        this.hasCentered_ = true;
      }
    }
  }

  private syncDomWithState_(): void {
    const clock = this.cache_('gt-clock');

    if (clock) {
      clock.textContent = `${new Date(getSimulatedNowMs()).toISOString().slice(11, 19)}Z`;
    }

    const rows = this.cache_('gt-subpoint-rows');

    if (!rows) {
      return;
    }

    const satellites = this.orbitalSatellites_();

    rows.innerHTML = satellites.map((sat, index) => {
      const lla = sat.lla;
      const color = TRACK_COLORS[index % TRACK_COLORS.length];
      const isFocus = sat.noradId === this.focusNoradId_;

      if (!lla) {
        return html`
          <tr class="${isFocus ? 'gt-row-focus' : ''}">
            <td><span class="gt-swatch" style="background:${color}"></span>${sat.name}</td>
            <td class="text-end text-muted" colspan="3">No solution</td>
          </tr>
        `;
      }

      return html`
        <tr class="${isFocus ? 'gt-row-focus' : ''}">
          <td><span class="gt-swatch" style="background:${color}"></span>${sat.name}</td>
          <td class="text-end">${lla.lat.toFixed(2)}°</td>
          <td class="text-end">${lla.lon.toFixed(2)}°</td>
          <td class="text-end">${lla.alt.toFixed(0)} km</td>
        </tr>
      `;
    }).join('');
  }

  public activate(): void {
    if (this.dom_) {
      this.dom_.style.display = 'block';
    }
    // The clock may have jumped while this tab was hidden (advanceSimClock,
    // checkpoint restore), so rebuild rather than showing a stale track.
    this.rebuildTracks_(getSimulatedNowMs());
    this.renderMap_();
    this.syncDomWithState_();
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
