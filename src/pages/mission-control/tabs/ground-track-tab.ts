import { BaseElement } from '@app/components/base-element';
import { type GeoFootprint, GeoMap, type GeoMapLayers, type GeoMarker, type GeoTrack } from '@app/components/geo-map/geo-map';
import { html } from '@app/engine/utils/development/formatter';
import { qs } from '@app/engine/utils/query-selector';
import { OrbitalSatellite } from '@app/equipment/satellite/orbital-satellite';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { type GroundPoint, groundTrack, visibilityRadiusDeg } from '@app/services/ground-track-math';
import { type EmbedHostState, type EmbedMapCamera, type EmbedMapView, FOOTPRINT_MIN_ELEVATION_DEG, KeepTrackEmbedHost, TRACK_COLORS } from '@app/services/keeptrack-embed-host';
import { SettingsManager } from '@app/settings/settings-manager';
import { trackedOrbitalSatellites } from '@app/simulation/sim-queries';
import { getSimulatedNowMs } from '@app/simulation/sim-time';
import { SimulationManager } from '@app/simulation/simulation-manager';
import type { Degrees } from 'ootk';
import './ground-track-tab.css';

/** Track legs run this far either side of "now" (minutes). */
const TRACK_HALF_SPAN_MIN = 45;
/** Sub-point sampling step (s). 30 s ~ 220 km of LEO ground travel per sample. */
const TRACK_STEP_S = 30;
/** Elevation mask the visibility circles are drawn for. */
const FOOTPRINT_MIN_ELEVATION = FOOTPRINT_MIN_ELEVATION_DEG as Degrees;
/**
 * Track geometry is only re-propagated this often; the live sub-point marker is
 * interpolated between samples every draw, so the map still moves smoothly.
 */
const RETRACK_INTERVAL_MS = 30_000;

/** Zoom of the shared embed camera on the first paint of the per-satellite tab / the world map. */
const EMBED_FOCUS_ZOOM = 2;
const EMBED_WORLD_ZOOM = 1;

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

  /** Fallback renderer; built only when the embed is not used or fails. */
  private map_: GeoMap | null = null;
  private mode_: 'embed' | 'geomap' = 'geomap';
  private shown_ = false;
  private unsubscribeHost_: (() => void) | null = null;
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
    const host = KeepTrackEmbedHost.getInstance();

    this.mode_ = SettingsManager.getInstance().groundTrackRenderer === 'embed' && host.isUsable ? 'embed' : 'geomap';
    if (this.mode_ === 'geomap') {
      this.map_ = this.createGeoMap_();
    }

    this.init_(containerId, 'replace');
    // dom_ must be set before wiring DOM listeners: init_ -> addEventListeners_
    // runs while dom_ is still null, so listeners are wired here instead.
    this.dom_ = qs('.ground-track-tab');
    this.map_?.attach(this.dom_);
    this.wireDomListeners_();
    if (this.mode_ === 'embed') {
      this.unsubscribeHost_ = host.onStateChange((state) => this.onHostState_(state));
    }

    this.boundUpdateHandler_ = this.throttledSync_.bind(this);
    EventBus.getInstance().on(Events.UPDATE, this.boundUpdateHandler_);

    if (this.mode_ === 'geomap') {
      this.rebuildTracks_(getSimulatedNowMs());
      this.renderMap_();
    }
    this.syncDomWithState_();
  }

  /** Wide backing resolution so the full-width map stays crisp; CSS scales it down (2:1 fits the whole globe). */
  private createGeoMap_(): GeoMap {
    return new GeoMap(`ground-track-map-${this.focusNoradId_ ?? 'all'}`, { width: 1200, height: 600 });
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
                <div class="d-flex align-items-center gap-3 flex-wrap">
                  ${this.constellationSwitches_()}
                  <label for="gt-toggle-footprints" class="form-check form-switch mb-0">
                    <input class="form-check-input" type="checkbox" id="gt-toggle-footprints" checked />
                    <span class="form-check-label small">Sat coverage</span>
                  </label>
                  ${
                    this.focusNoradId_ === null
                      ? ''
                      : html`
                    <label for="gt-toggle-access" class="form-check form-switch mb-0">
                      <input class="form-check-input" type="checkbox" id="gt-toggle-access" />
                      <span class="form-check-label small">Station access</span>
                    </label>
                  `
                  }
                  <label for="gt-toggle-terminator" class="form-check form-switch mb-0">
                    <input class="form-check-input" type="checkbox" id="gt-toggle-terminator" checked />
                    <span class="form-check-label small">Day/night</span>
                  </label>
                  <span id="gt-clock" class="font-monospace small text-muted"></span>
                </div>
              </div>
              <div class="card-body text-center">
                <div id="gt-fallback-banner" class="alert alert-warning py-2 small text-start ${this.mode_ === 'geomap' && this.hasConstellations_() ? '' : 'd-none'}">
                  The full constellation needs the KeepTrack renderer. This map shows authored, pinned and active satellites only.
                </div>
                <div id="gt-map-mount" class="gt-map-mount">${this.mode_ === 'embed' ? '<div id="gt-embed-anchor" class="gt-embed-anchor"></div>' : (this.map_?.outerHtml ?? '')}</div>
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
    this.dom_?.querySelectorAll<HTMLInputElement>('input[data-gt-constellation]').forEach((input) => {
      input.addEventListener('change', () => {
        KeepTrackEmbedHost.getInstance().setConstellationVisible(input.dataset.gtConstellation ?? '', input.checked);
      });
    });

    const footprints = this.cache_('gt-toggle-footprints') as HTMLInputElement;

    footprints?.addEventListener('change', () => {
      this.showFootprints_ = footprints.checked;
      this.refreshMap_();
    });

    const access = this.cache_('gt-toggle-access') as HTMLInputElement | null;

    access?.addEventListener('change', () => {
      this.showAccess_ = access.checked;
      this.refreshMap_();
    });

    const terminator = this.cache_('gt-toggle-terminator') as HTMLInputElement;

    terminator?.addEventListener('change', () => {
      this.showTerminator_ = terminator.checked;
      this.refreshMap_();
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
    // The embed propagates and draws on its own; only GeoMap needs this.
    if (this.mode_ === 'geomap') {
      if (simNowMs - this.lastTrackBuildMs_ > RETRACK_INTERVAL_MS || simNowMs < this.lastTrackBuildMs_) {
        this.rebuildTracks_(simNowMs);
      }

      this.renderMap_();
    }
    this.syncDomWithState_();
  }

  /** Authored and pinned satellites, plus the hot (hydrated) members the sim is working on. */
  private orbitalSatellites_(): OrbitalSatellite[] {
    const sim = SimulationManager.getInstance();
    const out = trackedOrbitalSatellites(sim);
    const seen = new Set(out.map((sat) => sat.noradId));

    for (const sat of (sim as { registry?: { hot(): unknown[] } }).registry?.hot() ?? []) {
      if (sat instanceof OrbitalSatellite && !seen.has(sat.noradId)) {
        out.push(sat);
      }
    }

    return out;
  }

  private hasConstellations_(): boolean {
    return KeepTrackEmbedHost.getInstance().constellationLayers().length > 0;
  }

  /** One Tabler switch per top-level constellation (embed renderer only; none for authored-only scenarios). */
  private constellationSwitches_(): string {
    if (this.mode_ !== 'embed') {
      return '';
    }

    return KeepTrackEmbedHost.getInstance()
      .constellationLayers()
      .map(
        (layer) => `
                  <label class="form-check form-switch mb-0">
                    <input class="form-check-input" type="checkbox" data-gt-constellation="${layer.id}" ${layer.visible ? 'checked' : ''} />
                    <span class="form-check-label small">${layer.label}</span>
                  </label>`
      )
      .join('');
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

  /** Push toggle changes to whichever renderer is active. */
  private refreshMap_(): void {
    if (this.mode_ === 'embed') {
      KeepTrackEmbedHost.getInstance().setView(this.embedView_());
    } else {
      this.renderMap_();
    }
  }

  private embedView_(): EmbedMapView {
    return {
      focusNoradId: this.focusNoradId_,
      showCoverage: this.showFootprints_,
      showAccess: this.showAccess_ && this.focusNoradId_ !== null,
      showDayNight: this.showTerminator_,
    };
  }

  /** Put the persistent embed over this tab's map placeholder. */
  private showEmbed_(): void {
    const anchor = this.cache_('gt-embed-anchor');

    if (!anchor) {
      return;
    }
    let camera: EmbedMapCamera | undefined;

    if (!this.hasCentered_) {
      const focus = this.orbitalSatellites_().find((sat) => sat.noradId === this.focusNoradId_);

      camera = focus?.lla ? { center: { lat: focus.lla.lat, lon: focus.lla.lon }, zoom: EMBED_FOCUS_ZOOM } : { zoom: EMBED_WORLD_ZOOM };
      this.hasCentered_ = this.focusNoradId_ === null || Boolean(focus?.lla);
    }
    this.shown_ = true;
    KeepTrackEmbedHost.getInstance().show(anchor, this.embedView_(), camera);
  }

  private onHostState_(state: EmbedHostState): void {
    if (this.mode_ !== 'embed' || (state !== 'failed' && state !== 'destroyed')) {
      return;
    }
    this.unsubscribeHost_?.();
    this.unsubscribeHost_ = null;
    this.shown_ = false;
    if (state === 'failed') {
      this.switchToGeoMap_();
    }
  }

  /** The embed could not boot: swap the placeholder for the built-in canvas. */
  private switchToGeoMap_(): void {
    const mount = this.cache_('gt-map-mount');

    if (!mount || !this.dom_) {
      return;
    }
    this.domCache_.delete('gt-embed-anchor');
    this.mode_ = 'geomap';
    this.dom_?.querySelectorAll('input[data-gt-constellation]').forEach((input) => {
      input.closest('label')?.remove();
    });
    this.cache_('gt-fallback-banner')?.classList.toggle('d-none', !this.hasConstellations_());
    this.map_ = this.createGeoMap_();
    mount.innerHTML = this.map_.outerHtml;
    this.map_.attach(this.dom_);
    this.hasCentered_ = false;
    this.rebuildTracks_(getSimulatedNowMs());
    this.renderMap_();
  }

  private renderMap_(): void {
    const map = this.map_;

    if (!map) {
      return;
    }
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
    // Only the selected satellite gets one: past a few dozen the circles cannot be told apart.
    if (this.showFootprints_ && focus?.lla && focusAltKm > 0) {
      footprints.push({
        lat: focus.lla.lat,
        lon: focus.lla.lon,
        radiusDeg: visibilityRadiusDeg(focusAltKm, FOOTPRINT_MIN_ELEVATION),
        label: focus.name,
        kind: 'coverage',
      });
    }

    const layers: GeoMapLayers = {
      markers,
      lops: [],
      tracks,
      footprints,
      terminator: this.showTerminator_ ? new Date(simNowMs) : null,
    };

    map.setLayers(layers);

    // Open centered on the focused satellite so the operator does not have to
    // hunt for it; afterwards the view is theirs to pan.
    if (!this.hasCentered_ && this.focusNoradId_ !== null) {
      const focus = satellites.find((sat) => sat.noradId === this.focusNoradId_);

      if (focus?.lla) {
        map.centerOn(focus.lla.lat, focus.lla.lon);
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

    rows.innerHTML = satellites
      .map((sat, index) => {
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
      })
      .join('');
  }

  public activate(): void {
    if (this.dom_) {
      this.dom_.style.display = 'block';
    }
    if (this.mode_ === 'embed') {
      this.showEmbed_();
    } else {
      // The clock may have jumped while this tab was hidden (advanceSimClock,
      // checkpoint restore), so rebuild rather than showing a stale track.
      this.rebuildTracks_(getSimulatedNowMs());
      this.renderMap_();
    }
    this.syncDomWithState_();
  }

  public deactivate(): void {
    this.releaseEmbed_();
    if (this.dom_) {
      this.dom_.style.display = 'none';
    }
  }

  /** Park the shared embed if this tab is the one showing it. */
  private releaseEmbed_(): void {
    if (this.shown_) {
      this.shown_ = false;
      KeepTrackEmbedHost.getInstance().hide();
    }
  }

  public dispose(): void {
    this.releaseEmbed_();
    this.unsubscribeHost_?.();
    this.unsubscribeHost_ = null;
    EventBus.getInstance().off(Events.UPDATE, this.boundUpdateHandler_);
    this.map_?.dispose();
    this.domCache_.clear();
    this.dom_?.remove();
  }
}
