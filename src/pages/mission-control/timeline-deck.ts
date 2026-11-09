import { html } from '@app/engine/utils/development/formatter';
import { qs } from '@app/engine/utils/query-selector';
import { OrbitalSatellite } from '@app/equipment/satellite/orbital-satellite';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { SelectedStation } from '@app/pages/mission-control/selected-station';
import { type LightingSpan, lightingSpans } from '@app/services/ground-track-math';
import { DEFAULT_CONTACT_MIN_ELEVATION, PassPlannerService, type SatellitePass } from '@app/services/pass-planner-service';
import { predictSatellitePasses, usesWorkerSearch } from '@app/services/pass-prediction';
import type { VisibilityHandle } from '@app/simulation/propagation/propagation-service';
import { getProvidedTleSet } from '@app/simulation/satellite-registry';
import { laneOrbitalSatellites } from '@app/simulation/sim-queries';
import { getSimulatedNowMs } from '@app/simulation/sim-time';
import { SimulationManager } from '@app/simulation/simulation-manager';
import type { Degrees } from 'ootk';
import './timeline-deck.css';

/** Options supplied by the scenario's `settings.contactTimeline` block. */
export interface TimelineDeckConfig {
  horizonHours?: number;
  minElevation?: Degrees;
  showLighting?: boolean;
  startCollapsed?: boolean;
}

/** Horizons the operator can switch between, in hours. */
const HORIZON_OPTIONS = [2, 6, 24] as const;
/** Passes are re-predicted at most this often (sim ms) - SGP4 is not free. */
const REPREDICT_INTERVAL_MS = 60_000;
/** Playhead / clock refresh throttle (wall ms). */
const UPDATE_INTERVAL_MS = 1000;
/** Lighting sampling step (s). */
const LIGHTING_STEP_S = 60;
/** Look back this far so a pass already in progress keeps its true AOS */
const IN_PROGRESS_LOOKBACK_MS = 20 * 60 * 1000;

/** One satellite's row: its contact blocks plus the lighting behind them. */
/** Aggregate lane step (sim ms): members above the horizon are counted this often. */
const AGGREGATE_STEP_MS = 5 * 60 * 1000;
/** Aggregate lane repaint throttle while the worker fills it (wall ms). */
const AGGREGATE_RENDER_MS = 250;

/** One summary lane per top-level constellation set. */
interface GroupLane {
  refIndex: number;
  label: string;
  title: string;
  members: number;
}

interface DeckRow {
  noradId: number;
  name: string;
  passes: SatellitePass[];
  lighting: LightingSpan[];
  /** Passes are still being searched in the worker */
  isLoading?: boolean;
}

/**
 * TimelineDeck
 *
 * The access/contact timeline along the bottom of Mission Control: one row per
 * orbital satellite, contact windows (AOS→LOS) drawn as blocks over a lighting
 * background that shades sunlit vs eclipse, with a playhead at the current
 * scenario time.
 *
 * Lighting is the lane *background* rather than a lane of its own, because with
 * more than one satellite a single lighting lane would be ambiguous about which
 * bird it described — this way each row carries its own.
 *
 * Opt-in per scenario via `settings.contactTimeline`: `MissionControlPage` only
 * constructs the deck when that block is present, so campaigns without it
 * (Campaign 1's GEO work, where the link never breaks and a contact timeline
 * teaches nothing) are unaffected.
 *
 * Contact windows come from `PassPlannerService` — the same source the Pass
 * Schedule and Contact Plan tabs read, so the three cannot disagree.
 */
export class TimelineDeck {
  readonly id = 'timeline-deck-container';
  protected dom_: HTMLElement | null = null;

  private readonly config_: Required<TimelineDeckConfig>;
  private readonly planner_ = new PassPlannerService();
  /** Predict from the station the operator is looking at (multi-site LEO work) */
  private readonly station_ = new SelectedStation();
  private lastStationId_: string | null = null;
  private readonly boundUpdateHandler_: () => void;
  private readonly boundSelectionHandler_: () => void;

  /** Rows of the current window by NORAD id, reused when only the selection changes */
  private readonly rowCache_ = new Map<number, DeckRow>();
  /** Bumped per prediction so a late worker answer for an old window is dropped */
  private seq_ = 0;
  /** Members-above-horizon counts by grid time: counts[lane * stations + station] */
  private readonly aggregate_ = new Map<number, Uint16Array>();
  private aggregateHandle_: VisibilityHandle | null = null;
  private aggregateRange_: { from: number; to: number } | null = null;
  private lastAggregateRenderMs_ = 0;
  private lanes_: GroupLane[] | null = null;

  private horizonHours_: number;
  private rows_: DeckRow[] = [];
  private lastPredictMs_ = Number.NEGATIVE_INFINITY;
  private lastSyncMs_ = 0;

  constructor(
    private readonly parentContainerId_: string,
    config: TimelineDeckConfig = {}
  ) {
    this.config_ = {
      horizonHours: config.horizonHours ?? 6,
      // Shared with the Pass Schedule tab via scenarioMinElevation(), so both
      // surfaces report identical AOS/LOS for the same pass.
      minElevation: config.minElevation ?? DEFAULT_CONTACT_MIN_ELEVATION,
      showLighting: config.showLighting ?? true,
      startCollapsed: config.startCollapsed ?? false,
    };
    this.horizonHours_ = this.config_.horizonHours;

    this.init_();

    this.boundUpdateHandler_ = this.throttledSync_.bind(this);
    EventBus.getInstance().on(Events.UPDATE, this.boundUpdateHandler_);
    this.boundSelectionHandler_ = this.handleSelectionChanged_.bind(this);
    EventBus.getInstance().on(Events.SELECTION_CHANGED, this.boundSelectionHandler_);
  }

  private get html_(): string {
    const zoomButtons = HORIZON_OPTIONS.map(
      (hours) => html`
      <button data-horizon="${hours}" class="${hours === this.horizonHours_ ? 'active' : ''}">${hours}H</button>
    `
    ).join('');

    return html`
      <footer id="${this.id}" class="app-shell-timeline ${this.config_.startCollapsed ? 'collapsed' : ''}">
        <div class="timeline-header">
          <div class="timeline-header-left">
            <span>Contact Timeline</span>
            <div class="timeline-zoom-controls">${zoomButtons}</div>
            <span class="timeline-legend">
              <span class="timeline-legend-item"><i class="timeline-swatch pass-good"></i>Good</span>
              <span class="timeline-legend-item"><i class="timeline-swatch pass-average"></i>Average</span>
              <span class="timeline-legend-item"><i class="timeline-swatch pass-marginal"></i>Marginal</span>
              <span class="timeline-legend-item"><i class="timeline-swatch lighting-eclipse"></i>Eclipse</span>
            </span>
          </div>
          <button class="timeline-collapse-btn ${this.config_.startCollapsed ? 'is-rotated' : ''}">
            <svg class="timeline-collapse-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
            </svg>
          </button>
        </div>
        <div class="timeline-content">
          <div class="timeline-grid">
            <div class="timeline-grid-line"></div>
            <div class="timeline-grid-line"></div>
            <div class="timeline-grid-line"></div>
            <div class="timeline-grid-line"></div>
          </div>
          <div class="timeline-tracks"></div>
          <div class="timeline-cursor"></div>
        </div>
        <div class="timeline-axis"></div>
      </footer>
    `;
  }

  private init_(): void {
    const parentDom = qs(`#${this.parentContainerId_}`);

    parentDom?.insertAdjacentHTML('beforeend', this.html_);
    this.dom_ = qs(`#${this.id}`, parentDom);
    this.addEventListeners_();
    this.predict_(getSimulatedNowMs());
    this.render_();
  }

  private addEventListeners_(): void {
    const collapseBtn = qs('.timeline-collapse-btn', this.dom_);

    collapseBtn?.addEventListener('click', () => {
      this.dom_?.classList.toggle('collapsed');
      collapseBtn.classList.toggle('is-rotated', this.dom_?.classList.contains('collapsed'));
    });

    // Event delegation so the horizon buttons survive any future re-render.
    qs('.timeline-zoom-controls', this.dom_)?.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLElement>('[data-horizon]');

      if (!button) {
        return;
      }

      this.horizonHours_ = Number(button.dataset.horizon);
      this.dom_?.querySelectorAll('.timeline-zoom-controls button').forEach((el) => {
        el.classList.toggle('active', el === button);
      });

      this.predict_(getSimulatedNowMs());
      this.render_();
    });
  }

  private orbitalSatellites_(): OrbitalSatellite[] {
    return laneOrbitalSatellites(SimulationManager.getInstance());
  }

  /** Re-run pass prediction and lighting sampling for the current window. */
  private predict_(nowMs: number): void {
    this.seq_++;
    this.rowCache_.clear();
    this.lastStationId_ = this.station_.stationId;
    this.lastPredictMs_ = nowMs;
    this.buildRows_(nowMs);
    this.updateAggregate_(nowMs);
  }

  /**
   * Rows for the lane satellites (authored, pinned, selected). Rows already
   * built for this window are kept, so a selection change only searches the
   * newcomers. Authored satellites predict on this thread exactly as before;
   * constellation members are searched in the worker and fill in when it answers.
   */
  private buildRows_(nowMs: number): void {
    const endMs = nowMs + this.horizonHours_ * 3600 * 1000;
    const observer = this.station_.observer;
    const fromMs = nowMs - IN_PROGRESS_LOOKBACK_MS;
    const options = {
      horizonHours: this.horizonHours_ + IN_PROGRESS_LOOKBACK_MS / 3_600_000,
      aosElevation: 'receivable' as const,
      minPeakElevation: this.config_.minElevation,
      maxPasses: 40,
      observer,
    };
    const fresh: OrbitalSatellite[] = [];
    const seen = new Set<number>();

    this.rows_ = this.orbitalSatellites_().map((sat) => {
      seen.add(sat.noradId);
      const cached = this.rowCache_.get(sat.noradId);

      if (cached) {
        return cached;
      }

      const isMember = usesWorkerSearch(sat, observer);
      const row: DeckRow = {
        noradId: sat.noradId,
        name: sat.name ?? `NORAD ${sat.noradId}`,
        // From now - 20 min so a pass in progress keeps its true AOS (D7), at the
        // receivable horizon so the deck agrees with the first signal (D5).
        passes: isMember ? [] : this.planner_.getPasses(sat, fromMs, options).filter((pass) => pass.losMs > nowMs),
        // Member lanes skip lighting: it is main-thread SGP4 per lane
        lighting: this.config_.showLighting && !isMember ? lightingSpans(sat, nowMs, endMs, LIGHTING_STEP_S) : [],
        isLoading: isMember,
      };

      this.rowCache_.set(sat.noradId, row);

      if (isMember) {
        fresh.push(sat);
      }

      return row;
    });

    for (const norad of [...this.rowCache_.keys()]) {
      if (!seen.has(norad)) {
        this.rowCache_.delete(norad);
      }
    }

    if (fresh.length > 0) {
      this.searchMembers_(fresh, fromMs, nowMs, options);
    }
  }

  private searchMembers_(sats: OrbitalSatellite[], fromMs: number, nowMs: number, options: Parameters<typeof predictSatellitePasses>[3]): void {
    const seq = this.seq_;
    const { pending } = predictSatellitePasses(this.planner_, sats, fromMs, options);

    void pending?.then((passes) => {
      if (seq !== this.seq_ || !this.dom_) {
        return;
      }
      for (const sat of sats) {
        const row = this.rowCache_.get(sat.noradId);

        if (row) {
          row.passes = passes.filter((pass) => pass.noradId === sat.noradId && pass.losMs > nowMs);
          row.isLoading = false;
        }
      }
      this.render_();
    });
  }

  /** Selection or pins changed: lanes follow, reusing every row already built for this window. */
  private handleSelectionChanged_(): void {
    if (!this.dom_ || !this.hasGroupLanes_()) {
      return;
    }
    this.buildRows_(this.lastPredictMs_);
    this.render_();
  }

  // === Group summary lanes ===

  private groupLanes_(): GroupLane[] {
    if (this.lanes_) {
      return this.lanes_;
    }
    const registry = SimulationManager.getInstance().registry;
    const refs = registry.constellationRefs();
    const counts = new Array<number>(refs.length).fill(0);

    for (let i = 0; i < registry.memberCount; i++) {
      counts[registry.memberRefIndex(i)]++;
    }
    this.lanes_ = refs.map((ref, refIndex) => ({
      refIndex,
      label: ref.tleSet,
      title: getProvidedTleSet(ref.tleSet)?.title ?? ref.tleSet,
      members: counts[refIndex],
    }));

    return this.lanes_;
  }

  /** Station index (in the propagation service) of the station the deck predicts from, or -1. */
  private aggregateStation_(): number {
    const observer = this.station_.observer;

    return observer ? SimulationManager.getInstance().scheduler.stationIndexOf(observer.lat, observer.lon) : -1;
  }

  /**
   * Request any missing 5 minute grid times for the window from the worker.
   * Cached times survive slides of the window, so only the new tail is computed.
   */
  private updateAggregate_(nowMs: number): void {
    const sim = SimulationManager.getInstance();
    const service = this.hasGroupLanes_() ? sim.scheduler.service : null;

    if (!service?.hasBackend) {
      return;
    }
    const g0 = Math.floor(nowMs / AGGREGATE_STEP_MS) * AGGREGATE_STEP_MS;
    const count = Math.ceil((this.horizonHours_ * 3_600_000) / AGGREGATE_STEP_MS) + 1;
    const missing: number[] = [];

    for (let i = 0; i < count; i++) {
      if (!this.aggregate_.has(g0 + i * AGGREGATE_STEP_MS)) {
        missing.push(g0 + i * AGGREGATE_STEP_MS);
      }
    }
    for (const key of [...this.aggregate_.keys()]) {
      if (key < g0 - 3_600_000) {
        this.aggregate_.delete(key);
      }
    }
    if (missing.length === 0) {
      return;
    }
    const range = this.aggregateRange_;

    if (this.aggregateHandle_ && range && missing[0] >= range.from && missing[missing.length - 1] <= range.to) {
      return; // the running request already covers everything missing
    }
    this.aggregateHandle_?.cancel();
    const from = missing[0];
    const n = (missing[missing.length - 1] - from) / AGGREGATE_STEP_MS + 1;

    service.setGroups(sim.registry.memberRefIndices(), sim.registry.constellationRefs().length);
    this.aggregateRange_ = { from, to: from + (n - 1) * AGGREGATE_STEP_MS };
    const handle = service.visibility({ startMs: from, stepMs: AGGREGATE_STEP_MS, count: n, minEl: 0 }, (index, counts) => {
      this.aggregate_.set(from + index * AGGREGATE_STEP_MS, counts.slice());
      const wall = Date.now();

      if (wall - this.lastAggregateRenderMs_ > AGGREGATE_RENDER_MS || index === n - 1) {
        this.lastAggregateRenderMs_ = wall;
        this.renderGroups_();
      }
    });

    this.aggregateHandle_ = handle;
    void handle?.done.then(() => {
      if (this.aggregateHandle_ === handle) {
        this.aggregateHandle_ = null;
        this.aggregateRange_ = null;
      }
    });
  }

  private groupsHtml_(): string {
    if (!this.hasGroupLanes_()) {
      return '';
    }
    const { startMs, spanMs } = this.windowMs_();
    const station = this.aggregateStation_();
    const stations = SimulationManager.getInstance().scheduler.service?.stationCount ?? 0;

    if (station < 0 || stations === 0) {
      return '';
    }
    const grid = [...this.aggregate_.keys()].sort((a, b) => a - b);

    return this.groupLanes_()
      .map((lane) => {
        const at = (g: number): number => this.aggregate_.get(g)?.[lane.refIndex * stations + station] ?? 0;
        const max = grid.reduce((m, g) => Math.max(m, at(g)), 0);
        const cells = grid
          .map((g) => {
            const n = at(g);
            const left = this.percent_(g, startMs, spanMs);
            const right = this.percent_(g + AGGREGATE_STEP_MS, startMs, spanMs);

            if (n === 0 || right <= left) {
              return '';
            }

            return `<div class="timeline-agg-cell" style="left:${left.toFixed(2)}%;width:${(right - left).toFixed(2)}%;opacity:${(0.15 + (0.85 * n) / max).toFixed(2)}" title="${new Date(g).toISOString().slice(11, 16)}Z  ${n} of ${lane.members} above horizon"></div>`;
          })
          .join('');

        return `<div class="timeline-track timeline-track-group" data-lane="${lane.refIndex}">
        <div class="timeline-track-label" title="${lane.title}: members above the horizon, 5 min steps">${lane.label} (${max})</div>
        <div class="timeline-track-lane">${cells}</div>
      </div>`;
      })
      .join('');
  }

  private renderGroups_(): void {
    const el = this.dom_?.querySelector('.timeline-groups');

    if (el) {
      el.innerHTML = this.groupsHtml_();
    }
  }

  private throttledSync_(): void {
    const wallNow = Date.now();

    if (wallNow - this.lastSyncMs_ < UPDATE_INTERVAL_MS) {
      return;
    }
    this.lastSyncMs_ = wallNow;

    const simNowMs = getSimulatedNowMs();

    // Re-predict on a schedule, whenever the clock jumps (advanceSimClock,
    // checkpoint restore) so the deck never shows a window already past, or
    // when the operator switches station and the horizon moves.
    if (simNowMs - this.lastPredictMs_ > REPREDICT_INTERVAL_MS || simNowMs < this.lastPredictMs_ || this.station_.stationId !== this.lastStationId_) {
      this.predict_(simNowMs);
      this.render_();

      return;
    }

    // Between predictions only the playhead moves.
    this.renderPlayhead_(simNowMs);
  }

  /**
   * The plotted window. Anchored at the last prediction rather than "now" so
   * blocks don't creep leftward every tick; the playhead sweeps across instead,
   * and the window re-anchors on the next prediction.
   */
  private windowMs_(): { startMs: number; spanMs: number } {
    return { startMs: this.lastPredictMs_, spanMs: this.horizonHours_ * 3600 * 1000 };
  }

  /** Percent-of-window position, clamped so partial blocks stay in the lane. */
  private percent_(timeMs: number, startMs: number, spanMs: number): number {
    return Math.min(100, Math.max(0, ((timeMs - startMs) / spanMs) * 100));
  }

  private render_(): void {
    const tracks = qs('.timeline-tracks', this.dom_);
    const axis = qs('.timeline-axis', this.dom_);

    if (!tracks || !axis) {
      return;
    }

    const { startMs, spanMs } = this.windowMs_();

    const groups = this.groupsHtml_();

    if (this.rows_.length === 0 && groups === '') {
      tracks.innerHTML = html`<div class="timeline-empty">No orbital satellites in this scenario</div>`;
      axis.innerHTML = '';

      return;
    }

    tracks.innerHTML = this.rows_
      .map(
        (row) => html`
      <div class="timeline-track">
        <div class="timeline-track-label" title="${row.name}">${row.name}</div>
        <div class="timeline-track-lane">
          ${this.lightingHtml_(row, startMs, spanMs)}
          ${this.passesHtml_(row, startMs, spanMs)}
        </div>
      </div>
    `
      )
      .join('');

    if (this.hasGroupLanes_()) {
      tracks.insertAdjacentHTML('beforeend', `<div class="timeline-groups">${groups}</div>`);
    }

    // Axis labels line up with the grid lines plus both ends.
    const ticks = 5;

    axis.innerHTML = Array.from({ length: ticks }, (_, i) => {
      const t = new Date(startMs + (spanMs * i) / (ticks - 1));

      return html`<span>${t.toISOString().slice(11, 16)}Z</span>`;
    }).join('');

    this.renderPlayhead_(getSimulatedNowMs());
  }

  private hasGroupLanes_(): boolean {
    return (SimulationManager.getInstance().registry?.memberCount ?? 0) > 0;
  }

  private lightingHtml_(row: DeckRow, startMs: number, spanMs: number): string {
    return row.lighting
      .map((span) => {
        const left = this.percent_(span.startMs, startMs, spanMs);
        const right = this.percent_(span.endMs, startMs, spanMs);

        if (right <= left) {
          return '';
        }

        return html`<div class="timeline-lighting ${span.isSunlit ? 'lighting-sun' : 'lighting-eclipse'}"
        style="left:${left.toFixed(2)}%;width:${(right - left).toFixed(2)}%"></div>`;
      })
      .join('');
  }

  private passesHtml_(row: DeckRow, startMs: number, spanMs: number): string {
    return row.passes
      .map((pass) => {
        const left = this.percent_(pass.aosMs, startMs, spanMs);
        const right = this.percent_(pass.losMs, startMs, spanMs);

        if (right <= left) {
          return '';
        }

        const aos = new Date(pass.aosMs).toISOString().slice(11, 19);
        const los = new Date(pass.losMs).toISOString().slice(11, 19);
        const tooltip = `${row.name}  AOS ${aos}Z → LOS ${los}Z  ·  max el ${pass.maxEl.toFixed(1)}°  ·  ${Math.round(pass.durationS / 60)} min`;

        return html`<div class="timeline-block ${TimelineDeck.passClass_(pass.maxEl)}"
        style="left:${left.toFixed(2)}%;width:${(right - left).toFixed(2)}%"
        title="${tooltip}">${pass.maxEl.toFixed(0)}°</div>`;
      })
      .join('');
  }

  /**
   * Pass quality by max elevation, matching the operator intuition the
   * campaigns teach: below ~15° the pass is low and short (high path loss, more
   * multipath, tighter link margin); above ~40° it is a strong one.
   */
  private static passClass_(maxEl: Degrees): string {
    if (maxEl >= 40) {
      return 'pass-good';
    }

    return maxEl >= 15 ? 'pass-average' : 'pass-marginal';
  }

  private renderPlayhead_(nowMs: number): void {
    const cursor = qs('.timeline-cursor', this.dom_) as HTMLElement | null;

    if (!cursor) {
      return;
    }

    const { startMs, spanMs } = this.windowMs_();

    cursor.style.left = `${this.percent_(nowMs, startMs, spanMs).toFixed(3)}%`;
  }

  dispose(): void {
    EventBus.getInstance().off(Events.UPDATE, this.boundUpdateHandler_);
    EventBus.getInstance().off(Events.SELECTION_CHANGED, this.boundSelectionHandler_);
    this.aggregateHandle_?.cancel();
    this.seq_++;
    this.station_.destroy();
    this.dom_?.remove();
    this.dom_ = null;
  }
}
