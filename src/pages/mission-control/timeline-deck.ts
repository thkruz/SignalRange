import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import { OrbitalSatellite } from "@app/equipment/satellite/orbital-satellite";
import { EventBus } from "@app/events/event-bus";
import { Events } from "@app/events/events";
import { lightingSpans, type LightingSpan } from "@app/services/ground-track-math";
import { DEFAULT_CONTACT_MIN_ELEVATION, PassPlannerService, type SatellitePass } from "@app/services/pass-planner-service";
import { getSimulatedNowMs } from "@app/simulation/sim-time";
import { SimulationManager } from "@app/simulation/simulation-manager";
import type { Degrees } from "ootk";
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

/** One satellite's row: its contact blocks plus the lighting behind them. */
interface DeckRow {
  noradId: number;
  name: string;
  passes: SatellitePass[];
  lighting: LightingSpan[];
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
  private readonly boundUpdateHandler_: () => void;

  private horizonHours_: number;
  private rows_: DeckRow[] = [];
  private lastPredictMs_ = Number.NEGATIVE_INFINITY;
  private lastSyncMs_ = 0;

  constructor(private readonly parentContainerId_: string, config: TimelineDeckConfig = {}) {
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
  }

  private get html_(): string {
    const zoomButtons = HORIZON_OPTIONS.map((hours) => html`
      <button data-horizon="${hours}" class="${hours === this.horizonHours_ ? 'active' : ''}">${hours}H</button>
    `).join('');

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
    return SimulationManager.getInstance().satellites.filter(
      (sat): sat is OrbitalSatellite => sat instanceof OrbitalSatellite,
    );
  }

  /** Re-run pass prediction and lighting sampling for the current window. */
  private predict_(nowMs: number): void {
    const endMs = nowMs + this.horizonHours_ * 3600 * 1000;

    this.rows_ = this.orbitalSatellites_().map((sat) => ({
      noradId: sat.noradId,
      name: sat.name ?? `NORAD ${sat.noradId}`,
      passes: this.planner_.getPasses(sat, nowMs, {
        horizonHours: this.horizonHours_,
        minElevation: this.config_.minElevation,
        maxPasses: 40,
      }),
      lighting: this.config_.showLighting ? lightingSpans(sat, nowMs, endMs, LIGHTING_STEP_S) : [],
    }));

    this.lastPredictMs_ = nowMs;
  }

  private throttledSync_(): void {
    const wallNow = Date.now();

    if (wallNow - this.lastSyncMs_ < UPDATE_INTERVAL_MS) {
      return;
    }
    this.lastSyncMs_ = wallNow;

    const simNowMs = getSimulatedNowMs();

    // Re-predict on a schedule, or whenever the clock jumps (advanceSimClock,
    // checkpoint restore) so the deck never shows a window already past.
    if (simNowMs - this.lastPredictMs_ > REPREDICT_INTERVAL_MS || simNowMs < this.lastPredictMs_) {
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

    if (this.rows_.length === 0) {
      tracks.innerHTML = html`<div class="timeline-empty">No orbital satellites in this scenario</div>`;
      axis.innerHTML = '';

      return;
    }

    tracks.innerHTML = this.rows_.map((row) => html`
      <div class="timeline-track">
        <div class="timeline-track-label" title="${row.name}">${row.name}</div>
        <div class="timeline-track-lane">
          ${this.lightingHtml_(row, startMs, spanMs)}
          ${this.passesHtml_(row, startMs, spanMs)}
        </div>
      </div>
    `).join('');

    // Axis labels line up with the grid lines plus both ends.
    const ticks = 5;

    axis.innerHTML = Array.from({ length: ticks }, (_, i) => {
      const t = new Date(startMs + (spanMs * i) / (ticks - 1));

      return html`<span>${t.toISOString().slice(11, 16)}Z</span>`;
    }).join('');

    this.renderPlayhead_(getSimulatedNowMs());
  }

  private lightingHtml_(row: DeckRow, startMs: number, spanMs: number): string {
    return row.lighting.map((span) => {
      const left = this.percent_(span.startMs, startMs, spanMs);
      const right = this.percent_(span.endMs, startMs, spanMs);

      if (right <= left) {
        return '';
      }

      return html`<div class="timeline-lighting ${span.isSunlit ? 'lighting-sun' : 'lighting-eclipse'}"
        style="left:${left.toFixed(2)}%;width:${(right - left).toFixed(2)}%"></div>`;
    }).join('');
  }

  private passesHtml_(row: DeckRow, startMs: number, spanMs: number): string {
    return row.passes.map((pass) => {
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
    }).join('');
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
    this.dom_?.remove();
    this.dom_ = null;
  }
}
