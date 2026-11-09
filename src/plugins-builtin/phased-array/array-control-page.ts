/**
 * Array Control: the Mission Control page for `kind: 'phased-array'` antennas.
 *
 * Data flow (CLAUDE.md conventions):
 *  - a ~1 Hz timer reads `core.getReadModel()` (the core caches the scheduler output);
 *  - `Events.DRAW` pushes the model into the SkyPlot, and only when the model changed;
 *  - `Events.UPDATE` syncs the DOM panels, throttled to one pass per second, never over
 *    a focused input. Button clicks bypass the throttle.
 */
import type { GroundStation } from '@app/assets/ground-station/ground-station';
import { azElToXY, geoArcBand } from '@app/components/sky-plot/sky-geometry';
import { type SkyDot, type SkyDotStyle, SkyPlot } from '@app/components/sky-plot/sky-plot';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import type { AntennaPage, AntennaPageFactory } from '@app/pages/mission-control/antenna-page-registry';
import { SelectionService } from '@app/services/selection-service';
import { SimulationManager } from '@app/simulation/simulation-manager';
import type { LockResult } from './beam-scheduler';
import { PhasedArrayCore, type PhasedArrayReadModel } from './phased-array-core';

export const ARRAY_CONTROL_TAB_LABEL = 'Array Control';

const MODEL_INTERVAL_MS = 1000;
const DOM_INTERVAL_MS = 1000;
const STRIP_SPAN_MS = 10 * 60_000;
const GEO_COARSE_STEP = 5;
const GEO_FINE_STEP = 1;
const GEO_MAX_WIDTH = 30;

const LOCK_REFUSAL: Record<string, string> = {
  unknown: 'Lock refused: that satellite is not tracked.',
  'below-horizon': 'Lock refused: the satellite is below the horizon.',
  'out-of-scan': 'Lock refused: outside the panel scan limit.',
  'in-exclusion': 'Lock refused: inside the GEO protection band.',
};

const SEGMENT_COLOURS = ['var(--mc-sky-known)', 'var(--mc-sky-amber)'];

/** Short strip label: 'STARLINK-1234' becomes 'SL-1234'; a handover to nothing is a coverage gap. */
function handoverLabel(h: { toNorad: number | null; toName: string }): string {
  if (h.toNorad === null) {
    return 'no coverage';
  }

  return (h.toName || `NORAD ${h.toNorad}`).replace(/^STARLINK-/u, 'SL-');
}

function escapeHtml(text: string): string {
  return text.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;');
}

export interface DrawStats {
  draws: number;
  lastMs: number;
  maxMs: number;
  totalMs: number;
  dots: number;
}

export class ArrayControlPage implements AntennaPage {
  readonly tabLabel = ARRAY_CONTROL_TAB_LABEL;

  private dom_: HTMLElement | null = null;
  private readonly core_: PhasedArrayCore;
  private readonly p_: string;
  private readonly domCache_ = new Map<string, HTMLElement>();
  private plot_: SkyPlot | null = null;
  private active_ = false;
  private model_: PhasedArrayReadModel | null = null;
  private track_: { az: number; el: number }[] = [];
  private dirty_ = true;
  private lastSignature_ = '';
  private lastSyncTime_ = 0;
  private modelTimer_: ReturnType<typeof setInterval> | null = null;
  private stagedWidth_: number;
  private hoverDot_: SkyDot | null = null;
  private notice_: { text: string; level: 'warning' | 'success'; untilMs: number } | null = null;
  private dotCounts_: Record<SkyDotStyle, number> = { known: 0, dim: 0, target: 0, candidate: 0, pinned: 0 };
  private bandKey_ = '';
  private band_: ReturnType<typeof geoArcBand> = null;
  readonly drawStats: DrawStats = { draws: 0, lastMs: 0, maxMs: 0, totalMs: 0, dots: 0 };

  private readonly boundUpdate_ = this.throttledSync_.bind(this);
  private readonly boundDraw_ = this.onDraw_.bind(this);
  private readonly boundHandlers_: Array<{ el: Element; type: string; fn: EventListener }> = [];

  constructor(
    private readonly groundStation_: GroundStation,
    private readonly containerId_: string,
    antennaIndex: number
  ) {
    const core = groundStation_.antennas[antennaIndex];

    if (!(core instanceof PhasedArrayCore)) {
      throw new Error('ArrayControlPage needs a PhasedArrayCore antenna');
    }
    this.core_ = core;
    this.p_ = `array-${groundStation_.uuid}-ant${antennaIndex}-`;
    this.stagedWidth_ = core.geoArcWidthDeg;
  }

  get dom(): HTMLElement | null {
    return this.dom_;
  }

  /** Last read model (tests and e2e). */
  get model(): PhasedArrayReadModel | null {
    return this.model_;
  }

  /** Dots last pushed to the plot, by style (tests and e2e). */
  get plottedDotCounts(): Record<SkyDotStyle, number> {
    return { ...this.dotCounts_ };
  }

  /** Client-space centre of a dot on the canvas (test hook for e2e clicks); null when it is not plotted. */
  dotClientPos(norad: number): { x: number; y: number } | null {
    const canvas = this.dom_?.querySelector('.sky-plot-canvas');
    const dot = this.model_?.visible.find((v) => v.norad === norad);

    if (!canvas || !dot || !this.plot_) {
      return null;
    }
    const { cx, cy, radius } = this.plot_.getLayout();
    const { x, y } = azElToXY(dot.az, dot.el, cx, cy, radius);
    const rect = canvas.getBoundingClientRect();

    return { x: rect.left + x, y: rect.top + y };
  }

  activate(): void {
    if (!this.dom_ || !document.contains(this.dom_)) {
      this.build_();
    }
    if (!this.dom_) {
      return;
    }
    this.dom_.style.display = '';
    if (!this.active_) {
      this.active_ = true;
      EventBus.getInstance().on(Events.UPDATE, this.boundUpdate_);
      EventBus.getInstance().on(Events.DRAW, this.boundDraw_);
      if (process.env.NODE_ENV === 'development') {
        // Test hook for the Array Control e2e spec; dev builds only.
        (window as unknown as { __arrayControl?: ArrayControlPage }).__arrayControl = this;
      }
      this.modelTimer_ = setInterval(() => this.readModel_(), MODEL_INTERVAL_MS);
    }
    this.readModel_();
    this.syncDom_();
    this.plot_?.resize();
  }

  deactivate(): void {
    this.stopFeeds_();
    if (this.dom_) {
      this.dom_.style.display = 'none';
    }
  }

  dispose(): void {
    const hook = window as unknown as { __arrayControl?: ArrayControlPage };

    if (hook.__arrayControl === this) {
      delete hook.__arrayControl;
    }
    this.stopFeeds_();
    for (const { el, type, fn } of this.boundHandlers_) {
      el.removeEventListener(type, fn);
    }
    this.boundHandlers_.length = 0;
    this.plot_?.dispose();
    this.plot_ = null;
    this.dom_?.remove();
    this.dom_ = null;
    this.domCache_.clear();
  }

  // ---- build ----------------------------------------------------------------

  private build_(): void {
    const container = document.getElementById(this.containerId_);

    if (!container) {
      return;
    }
    this.plot_?.dispose();
    for (const { el, type, fn } of this.boundHandlers_) {
      el.removeEventListener(type, fn);
    }
    this.boundHandlers_.length = 0;
    this.domCache_.clear();

    const p = this.p_;
    const root = document.createElement('div') as unknown as HTMLElement;

    root.className = `array-control-tab array-control-tab-${p}`;
    this.plot_ = new SkyPlot(`${p}sky`, {
      size: 520,
      onHover: (dot, evt) => this.onHover_(dot, evt),
      onClick: (dot, evt) => this.onDotClick_(dot, evt),
    });
    root.innerHTML = `
      <div class="card mb-3">
        <div class="card-body py-2">
          <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
            <div>
              <span class="fw-bold">Phased array user terminal</span>
              <span id="${p}antenna-info" class="text-muted ms-2"></span>
            </div>
            <div class="btn-group" role="group" aria-label="Beam mode">
              <button type="button" class="btn btn-tracking" id="${p}mode-auto" data-mode="auto">AUTO</button>
              <button type="button" class="btn btn-tracking" id="${p}mode-manual" data-mode="manual">MANUAL</button>
              <button type="button" class="btn btn-tracking" id="${p}mode-stow" data-mode="stow">STOW</button>
            </div>
            <span id="${p}link-state" class="status-badge"></span>
          </div>
        </div>
      </div>
      <div class="row g-2 pb-6">
        <div class="col-xl-7">
          <div class="card h-100">
            <div class="card-header d-flex justify-content-between align-items-center">
              <h3 class="card-title mb-0">Sky view</h3>
              <span class="text-muted small">Click a dot to lock it. Shift-click or right-click pins it.</span>
            </div>
            <div class="card-body">
              <div id="${p}sky-wrap" style="position: relative; max-width: 540px; margin: 0 auto;">
                ${this.plot_.html}
                <div id="${p}tooltip" class="font-monospace small" style="display: none; position: absolute; pointer-events: none; z-index: 5; padding: 2px 6px; border-radius: 3px; background: var(--mc-equip-bg-raised, #1e1e1e); border: 1px solid var(--mc-equip-border-light, #444); white-space: nowrap;"></div>
              </div>
              <div id="${p}notice" class="alert py-2 mt-2 mb-0 small" style="display: none;" role="status"></div>
              <div class="d-flex flex-wrap gap-3 mt-2 small text-muted" id="${p}legend">
                <span><span style="color: var(--mc-sky-known)">&#9679;</span> visible</span>
                <span><span style="color: var(--mc-sky-dim)">&#9679;</span> outside scan cone</span>
                <span><span style="color: var(--mc-sky-target)">&#9679;</span> target</span>
                <span><span style="color: var(--mc-sky-candidate)">&#9711;</span> next handover</span>
                <span><span style="color: var(--mc-sky-zone)">&#9638;</span> GEO band</span>
              </div>
            </div>
          </div>
        </div>
        <div class="col-xl-5 d-flex flex-column gap-2">
          <div class="card">
            <div class="card-header"><h3 class="card-title mb-0">Beam</h3></div>
            <div class="card-body">
              <div class="mb-2">
                <div class="text-muted small">Target</div>
                <div id="${p}target" class="fw-bold font-monospace">No target</div>
              </div>
              <div class="row g-2 mb-2">
                <div class="col-6"><div class="text-muted small">Beam az / el</div><div id="${p}beam" class="font-monospace">--</div></div>
                <div class="col-6"><div class="text-muted small">Scan angle</div><div id="${p}scan-angle" class="font-monospace">--</div></div>
                <div class="col-6"><div class="text-muted small">Beamwidth now</div><div id="${p}beamwidth" class="font-monospace">--</div></div>
                <div class="col-6"><div class="text-muted small">G/T now</div><div id="${p}got" class="font-monospace">--</div></div>
              </div>
              <div class="mb-2">
                <div class="text-muted small">Last link drop</div>
                <div id="${p}last-drop" class="font-monospace small">None yet</div>
              </div>
              <div class="d-flex justify-content-between small"><span class="text-muted">Scan loss</span><span id="${p}scan-loss" class="font-monospace">--</span></div>
              <div class="progress" style="height: 8px;"><div id="${p}scan-loss-bar" class="progress-bar" role="progressbar" style="width: 0%; background: var(--mc-sky-amber);"></div></div>
            </div>
          </div>
          <div class="card">
            <div class="card-header"><h3 class="card-title mb-0">GEO protection zone</h3></div>
            <div class="card-body">
              <div class="form-check form-switch mb-2">
                <input class="form-check-input" type="checkbox" role="switch" id="${p}geo-switch">
                <label class="form-check-label" for="${p}geo-switch">Keep the beam out of the GEO arc</label>
              </div>
              <div class="equip-adjust-control">
                <label class="equip-adjust-label">BAND HALF-WIDTH</label>
                <div class="equip-adjust-row">
                  <div class="equip-adjust-buttons equip-adjust-decrease">
                    <button id="${p}geo-dec-coarse" class="btn-equip" type="button">-${GEO_COARSE_STEP}</button>
                    <button id="${p}geo-dec-fine" class="btn-equip" type="button">-${GEO_FINE_STEP}</button>
                  </div>
                  <div class="equip-adjust-display">
                    <input type="number" id="${p}geo-width" class="equip-adjust-input" min="0" max="${GEO_MAX_WIDTH}" step="1" />
                  </div>
                  <div class="equip-adjust-buttons equip-adjust-increase">
                    <button id="${p}geo-inc-fine" class="btn-equip" type="button">+${GEO_FINE_STEP}</button>
                    <button id="${p}geo-inc-coarse" class="btn-equip" type="button">+${GEO_COARSE_STEP}</button>
                  </div>
                  <span class="equip-adjust-unit">DEG</span>
                </div>
              </div>
              <div class="d-flex gap-2 mt-2">
                <button id="${p}geo-cancel" class="btn btn-sm btn-secondary" type="button" disabled>CANCEL</button>
                <button id="${p}geo-apply" class="btn btn-sm btn-apply" type="button" disabled>APPLY</button>
              </div>
              <div id="${p}geo-warning" class="alert alert-danger py-2 mt-2 mb-0 small" style="display: none;" role="alert">
                Beam is inside the GEO arc. It can interfere with geostationary links.
              </div>
            </div>
          </div>
          <div class="card">
            <div class="card-header d-flex justify-content-between align-items-center">
              <h3 class="card-title mb-0">GEO interference</h3>
              <span id="${p}geo-risk" class="status-badge"></span>
            </div>
            <div class="card-body">
              <div class="row g-2">
                <div class="col-6"><div class="text-muted small">Beam to GEO arc</div><div id="${p}geo-sep" class="font-monospace">--</div></div>
                <div class="col-6"><div class="text-muted small">Level toward the arc</div><div id="${p}geo-level" class="font-monospace">--</div></div>
              </div>
              <div class="text-muted small mt-2">This terminal has no transmit power model here, so the card shows geometry and the antenna pattern, not EIRP. Levels are typical values for a Ku flat-panel terminal, not measured Starlink figures.</div>
            </div>
          </div>
        </div>
        <div class="col-12">
          <div class="card">
            <div class="card-header d-flex justify-content-between align-items-center">
              <h3 class="card-title mb-0">Handovers, next 10 minutes</h3>
              <span id="${p}handover-count" class="text-muted small"></span>
            </div>
            <div class="card-body">
              <div id="${p}strip" class="array-handover-strip" style="position: relative; display: flex; height: 34px; border: 1px solid var(--mc-equip-border-light, #444); border-radius: 4px; overflow: hidden;"></div>
              <div class="d-flex justify-content-between small text-muted mt-1"><span>now</span><span>+5 min</span><span>+10 min</span></div>
              <div id="${p}strip-note" class="small text-muted mt-1"></div>
            </div>
          </div>
        </div>
      </div>`;
    container.appendChild(root);
    this.dom_ = root;
    this.plot_.onDomReady();
    this.hookDrawTiming_(this.plot_);
    this.attachHandlers_();
    const cfg = this.core_.phasedArrayConfig;

    this.cache_('antenna-info').textContent = `| ${cfg.band}-Band flat panel, scan limit ${cfg.maxScanDeg} deg`;
    this.dirty_ = true;
    this.lastSignature_ = '';
  }

  private cache_(key: string): HTMLElement {
    let el = this.domCache_.get(key);

    if (!el) {
      el = this.dom_!.querySelector<HTMLElement>(`#${this.p_}${key}`)!;
      this.domCache_.set(key, el);
    }

    return el;
  }

  private on_(el: Element, type: string, fn: EventListener): void {
    el.addEventListener(type, fn);
    this.boundHandlers_.push({ el, type, fn });
  }

  private attachHandlers_(): void {
    for (const mode of ['auto', 'manual', 'stow'] as const) {
      this.on_(this.cache_(`mode-${mode}`), 'click', () => this.setMode_(mode));
    }
    this.on_(this.cache_('geo-switch'), 'change', () => this.onGeoToggle_());
    this.on_(this.cache_('geo-dec-coarse'), 'click', () => this.adjustWidth_(-GEO_COARSE_STEP));
    this.on_(this.cache_('geo-dec-fine'), 'click', () => this.adjustWidth_(-GEO_FINE_STEP));
    this.on_(this.cache_('geo-inc-fine'), 'click', () => this.adjustWidth_(GEO_FINE_STEP));
    this.on_(this.cache_('geo-inc-coarse'), 'click', () => this.adjustWidth_(GEO_COARSE_STEP));
    this.on_(this.cache_('geo-width'), 'input', () => this.onWidthInput_());
    this.on_(this.cache_('geo-apply'), 'click', () => this.applyWidth_());
    this.on_(this.cache_('geo-cancel'), 'click', () => this.cancelWidth_());
    const canvas = this.dom_!.querySelector('.sky-plot-canvas');

    if (canvas) {
      this.on_(canvas, 'contextmenu', (evt) => {
        evt.preventDefault();
        if (this.hoverDot_) {
          this.pin_(this.hoverDot_);
        }
      });
    }
  }

  private hookDrawTiming_(plot: SkyPlot): void {
    const original = plot.draw.bind(plot);
    const stats = this.drawStats;

    plot.draw = (): void => {
      const t0 = performance.now();

      original();
      const dt = performance.now() - t0;

      stats.draws++;
      stats.lastMs = dt;
      stats.totalMs += dt;
      stats.maxMs = Math.max(stats.maxMs, dt);
    };
  }

  // ---- user actions ---------------------------------------------------------

  private setMode_(mode: 'auto' | 'manual' | 'stow'): void {
    if (mode === 'stow') {
      this.core_.stow();
    } else {
      this.core_.setBeamMode(mode);
    }
    this.afterAction_();
  }

  private onGeoToggle_(): void {
    const input = this.cache_('geo-switch') as HTMLInputElement;

    if (this.core_.geoArcEnabled !== input.checked) {
      this.core_.setGeoArcEnabled(input.checked);
    }
    this.afterAction_();
  }

  private adjustWidth_(delta: number): void {
    this.stagedWidth_ = Math.max(0, Math.min(GEO_MAX_WIDTH, this.stagedWidth_ + delta));
    (this.cache_('geo-width') as HTMLInputElement).value = this.stagedWidth_.toString();
    this.updateWidthButtons_();
  }

  private onWidthInput_(): void {
    const value = Number.parseFloat((this.cache_('geo-width') as HTMLInputElement).value);

    if (Number.isFinite(value)) {
      this.stagedWidth_ = Math.max(0, Math.min(GEO_MAX_WIDTH, value));
    }
    this.updateWidthButtons_();
  }

  private applyWidth_(): void {
    this.core_.setGeoArcWidthDeg(this.stagedWidth_);
    this.stagedWidth_ = this.core_.geoArcWidthDeg;
    (this.cache_('geo-width') as HTMLInputElement).value = this.stagedWidth_.toString();
    this.afterAction_();
  }

  private cancelWidth_(): void {
    this.stagedWidth_ = this.core_.geoArcWidthDeg;
    (this.cache_('geo-width') as HTMLInputElement).value = this.stagedWidth_.toString();
    this.updateWidthButtons_();
  }

  private updateWidthButtons_(): void {
    const changed = this.stagedWidth_ !== this.core_.geoArcWidthDeg;

    (this.cache_('geo-apply') as HTMLButtonElement).disabled = !changed;
    (this.cache_('geo-cancel') as HTMLButtonElement).disabled = !changed;
  }

  private onDotClick_(dot: SkyDot, evt: PointerEvent | MouseEvent): void {
    if (evt.shiftKey) {
      this.pin_(dot);

      return;
    }
    this.lock_(Number(dot.id));
  }

  /** Manual lock on a satellite; shows the refusal reason when the core says no. */
  lock_(norad: number): LockResult {
    const result = this.core_.lock(norad);

    if ('reason' in result) {
      this.notice_ = { text: LOCK_REFUSAL[result.reason] ?? `Lock refused (${result.reason}).`, level: 'warning', untilMs: Date.now() + 6000 };
    } else {
      this.notice_ = null;
    }
    this.afterAction_();

    return result;
  }

  private pin_(dot: SkyDot): void {
    const norad = Number(dot.id);
    const ok = SelectionService.getInstance().pin(norad);

    this.notice_ = {
      text: ok ? `Pinned NORAD ${norad}.` : `Cannot pin NORAD ${norad} (not a constellation member, or the pinned set is full).`,
      level: ok ? 'success' : 'warning',
      untilMs: Date.now() + 4000,
    };
    this.afterAction_();
  }

  /** Direct user actions skip the throttle: refresh the model and DOM at once. */
  private afterAction_(): void {
    this.readModel_();
    this.syncDom_();
  }

  // ---- hover ----------------------------------------------------------------

  private onHover_(dot: SkyDot | null, evt: PointerEvent): void {
    this.hoverDot_ = dot;
    const tip = this.cache_('tooltip');

    if (!dot) {
      tip.style.display = 'none';

      return;
    }
    const wrap = this.cache_('sky-wrap').getBoundingClientRect();

    tip.textContent = `${this.nameOf_(Number(dot.id))} | NORAD ${dot.id} | el ${dot.elDeg.toFixed(1)} deg`;
    tip.style.left = `${Math.min(Math.max(0, evt.clientX - wrap.left + 12), Math.max(0, wrap.width - 230))}px`;
    tip.style.top = `${Math.max(0, evt.clientY - wrap.top - 26)}px`;
    tip.style.display = 'block';
  }

  private nameOf_(norad: number): string {
    const fromModel = this.model_?.visible.find((v) => v.norad === norad)?.name;

    if (fromModel && !fromModel.startsWith('NORAD')) {
      return fromModel;
    }
    try {
      const registry = SimulationManager.getInstance().registry;
      const idx = registry.memberIndexOf(norad);

      if (idx >= 0) {
        return registry.memberName(idx);
      }
    } catch {
      // registry not ready: fall through
    }

    return fromModel ?? `NORAD ${norad}`;
  }

  // ---- feeds ----------------------------------------------------------------

  private stopFeeds_(): void {
    if (this.active_) {
      EventBus.getInstance().off(Events.UPDATE, this.boundUpdate_);
      EventBus.getInstance().off(Events.DRAW, this.boundDraw_);
    }
    if (this.modelTimer_ !== null) {
      clearInterval(this.modelTimer_);
      this.modelTimer_ = null;
    }
    this.active_ = false;
  }

  /** Timer (and user actions): read the core's cached model and decide whether the sky changed. */
  private readModel_(): void {
    const m = this.core_.getReadModel();

    this.model_ = m;
    this.track_ = m.target ? this.core_.getTargetTrack() : [];
    const pinned = SelectionService.getInstance().pinnedNorads.join(',');
    const sig = [m.simMs, m.mode, m.target?.norad, m.candidate?.norad, m.visible.length, m.geoArc.enabled, m.geoArc.widthDeg, m.beamwidthDeg.toFixed(2), pinned].join('|');

    if (sig !== this.lastSignature_) {
      this.lastSignature_ = sig;
      this.dirty_ = true;
    }
  }

  /** Events.DRAW: canvas only, and only when the data changed. */
  private onDraw_(): void {
    if (!this.dirty_ || !this.model_ || !this.plot_) {
      return;
    }
    this.dirty_ = false;
    this.pushToPlot_(this.model_, this.plot_);
  }

  private pushToPlot_(m: PhasedArrayReadModel, plot: SkyPlot): void {
    const selection = SelectionService.getInstance();
    const dots: SkyDot[] = [];

    for (const v of m.visible) {
      let style: SkyDotStyle = v.inScan && !v.inExclusion ? 'known' : 'dim';

      if (v.norad === m.target?.norad) {
        style = 'target';
      } else if (v.norad === m.candidate?.norad) {
        style = 'candidate';
      } else if (selection.isPinned(v.norad)) {
        style = 'pinned';
      }
      dots.push({ id: String(v.norad), azDeg: v.az, elDeg: v.el, style });
    }
    this.drawStats.dots = dots.length;
    this.dotCounts_ = { known: 0, dim: 0, target: 0, candidate: 0, pinned: 0 };
    for (const d of dots) {
      this.dotCounts_[d.style]++;
    }
    plot.setDots(dots);
    plot.setBeam({ azDeg: m.beam.az, elDeg: m.beam.el, beamwidthDeg: m.beamwidthDeg });
    plot.setTrack(this.track_.length > 1 ? this.track_.map((p) => ({ azDeg: p.az, elDeg: p.el })) : null);
    plot.setScanMask({ panelAzDeg: m.panel.azDeg, tiltDeg: m.panel.tiltDeg, maxScanDeg: m.maxScanDeg });
    // The band stays drawn with the protection off, so the player can see where the arc is
    plot.setZones(this.geoBand_(m.geoArc.widthDeg) ? [this.geoBand_(m.geoArc.widthDeg)!] : []);
  }

  private geoBand_(widthDeg: number): ReturnType<typeof geoArcBand> {
    const loc = this.groundStation_.state.location;
    const key = `${loc.latitude}|${loc.longitude}|${widthDeg}`;

    if (key !== this.bandKey_) {
      this.bandKey_ = key;
      this.band_ = geoArcBand(loc.latitude, loc.longitude, widthDeg);
    }

    return this.band_;
  }

  private throttledSync_(): void {
    const now = Date.now();

    if (now - this.lastSyncTime_ < DOM_INTERVAL_MS) {
      return;
    }
    this.lastSyncTime_ = now;
    this.syncDom_();
  }

  // ---- DOM sync -------------------------------------------------------------

  private syncDom_(): void {
    const m = this.model_;

    if (!m || !this.dom_) {
      return;
    }
    for (const mode of ['auto', 'manual', 'stow'] as const) {
      this.cache_(`mode-${mode}`).classList.toggle('active', m.mode === mode);
    }
    this.cache_('target').textContent = m.target ? `${this.nameOf_(m.target.norad)} (NORAD ${m.target.norad})` : m.mode === 'stow' ? 'Stowed' : 'No target';
    this.cache_('beam').textContent = `${m.beam.az.toFixed(1)} / ${m.beam.el.toFixed(1)} deg`;
    this.cache_('scan-angle').textContent = `${m.scanAngleDeg.toFixed(1)} deg (limit ${m.maxScanDeg})`;
    this.cache_('beamwidth').textContent = `${m.beamwidthDeg.toFixed(2)} deg`;
    this.cache_('got').textContent = Number.isFinite(m.gOverTDbK) ? `${m.gOverTDbK.toFixed(1)} dB/K` : '--';
    this.cache_('scan-loss').textContent = `${m.scanLossDb.toFixed(2)} dB`;
    const maxLoss = Math.max(0.01, this.core_.scanLossDbAt(m.maxScanDeg));

    this.cache_('scan-loss-bar').style.width = `${Math.min(100, (m.scanLossDb / maxLoss) * 100).toFixed(0)}%`;

    const link = this.cache_('link-state');

    link.textContent = m.inOutage ? 'HANDOVER OUTAGE' : m.target ? 'LINK UP' : 'NO LINK';
    link.className = `status-badge ${m.inOutage ? 'status-badge-amber' : m.target ? 'status-badge-green' : 'status-badge-red'}`;

    const sw = this.cache_('geo-switch') as HTMLInputElement;

    if (document.activeElement !== sw) {
      sw.checked = m.geoArc.enabled;
    }
    const widthInput = this.cache_('geo-width') as HTMLInputElement;

    if (document.activeElement !== widthInput && (this.cache_('geo-apply') as HTMLButtonElement).disabled) {
      this.stagedWidth_ = m.geoArc.widthDeg;
      widthInput.value = this.stagedWidth_.toString();
    }
    this.updateWidthButtons_();
    this.cache_('geo-warning').style.display = m.geoArc.beamInGeoArc ? '' : 'none';
    this.syncGeoInterference_(m);
    const drop = m.lastLinkDrop;

    this.cache_('last-drop').textContent = drop
      ? `${new Date(drop.atMs).toISOString().slice(11, 19)} UTC, was serving ${this.nameOf_(drop.servingNorad).replace(/^STARLINK-/u, 'SL-')} (NORAD ${drop.servingNorad})`
      : 'None yet';

    this.syncNotice_(m);
    this.renderStrip_(m);
  }

  private syncGeoInterference_(m: PhasedArrayReadModel): void {
    const g = m.geoArc;
    const has = Number.isFinite(g.separationDeg);
    const risk = this.cache_('geo-risk');

    this.cache_('geo-sep').textContent = has ? `${g.separationDeg.toFixed(1)} deg (band ${g.widthDeg.toFixed(0)})` : 'no arc in view';
    this.cache_('geo-level').textContent = has ? `${g.levelTowardArcDb.toFixed(1)} dB from peak` : '--';
    let text = 'CLEAR';
    let cls = 'status-badge-green';

    if (m.mode !== 'stow' && m.target && has) {
      if (g.levelTowardArcDb > -3) {
        text = 'MAIN BEAM ON ARC';
        cls = 'status-badge-red';
      } else if (g.beamInGeoArc) {
        text = 'IN GEO ARC';
        cls = 'status-badge-red';
      } else if (g.separationDeg <= g.widthDeg * 2) {
        text = 'NEAR GEO ARC';
        cls = 'status-badge-amber';
      }
    }
    risk.textContent = text;
    risk.className = `status-badge ${cls}`;
  }

  private syncNotice_(m: PhasedArrayReadModel): void {
    const el = this.cache_('notice');
    let text = '';
    let level: 'warning' | 'success' = 'warning';

    if (this.notice_ && Date.now() < this.notice_.untilMs) {
      ({ text, level } = this.notice_);
    } else if (m.lockLostReason) {
      text = `Manual lock dropped (${m.lockLostReason}).`;
    }
    el.style.display = text ? '' : 'none';
    el.className = `alert py-2 mt-2 mb-0 small alert-${level}`;
    el.textContent = text;
  }

  private renderStrip_(m: PhasedArrayReadModel): void {
    const strip = this.cache_('strip');
    const note = this.cache_('strip-note');
    const count = this.cache_('handover-count');

    count.textContent = `${m.handoverCount} handovers so far`;
    if (m.mode !== 'auto') {
      strip.innerHTML = '';
      note.textContent = m.mode === 'manual' ? 'Manual lock: the beam holds this satellite and no handovers are scheduled.' : 'Stowed: the beam is parked on the panel normal.';

      return;
    }
    const nowMs = m.simMs;
    const segs: Array<{ label: string; from: number; to: number; first: boolean; unknown?: boolean }> = [];
    let cursor = 0;
    let label = m.target ? this.nameOf_(m.target.norad).replace(/^STARLINK-/u, 'SL-') : 'no target';

    const knownMs = Math.min(STRIP_SPAN_MS, Math.max(0, m.predictedUntilMs - nowMs));

    for (const h of m.handovers) {
      const at = Math.max(cursor, Math.min(STRIP_SPAN_MS, h.atMs - nowMs));

      segs.push({ label, from: cursor, to: at, first: segs.length === 0 });
      cursor = at;
      label = handoverLabel(h);
    }
    segs.push({ label, from: cursor, to: Math.max(cursor, knownMs), first: segs.length === 0 });
    if (knownMs < STRIP_SPAN_MS) {
      segs.push({ label: 'not predicted', from: Math.max(cursor, knownMs), to: STRIP_SPAN_MS, first: false, unknown: true });
    }

    strip.innerHTML = segs
      .filter((s) => s.to > s.from)
      .map((s, i) => {
        const w = (((s.to - s.from) / STRIP_SPAN_MS) * 100).toFixed(2);
        const bg = s.unknown ? 'var(--mc-grid-line, #3a3a3a)' : s.first ? 'var(--mc-sky-target)' : SEGMENT_COLOURS[i % SEGMENT_COLOURS.length];

        return `<div class="array-strip-seg" title="${escapeHtml(s.label)}" style="flex: 0 0 ${w}%; min-width: 0; background: ${bg}; color: #0b0b0b; border-left: ${i === 0 ? '0' : '2px solid var(--mc-equip-bg, #1a1a1a)'}; padding: 0 4px; font-size: 0.72rem; line-height: 34px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(s.label)}</div>`;
      })
      .join('');
    strip.insertAdjacentHTML(
      'beforeend',
      '<div class="array-strip-now" title="now" style="position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--mc-accent-red-bright, #ff2827);"></div>'
    );
    const next = m.handovers[0];

    const cut = knownMs < STRIP_SPAN_MS - 15_000;
    const until = cut ? ` Prediction to +${Math.floor(knownMs / 60_000)} min${knownMs % 60_000 ? ` ${Math.round((knownMs % 60_000) / 1000)} s` : ''}.` : '';

    note.textContent = next
      ? `Next handover in ${Math.max(0, Math.round((next.atMs - nowMs) / 1000))} s to ${handoverLabel(next)} (${next.reason}).${until}`
      : cut
        ? `No handover predicted.${until}`
        : 'No handover predicted in the next 10 minutes.';
  }
}

export const createArrayControlPage: AntennaPageFactory = (groundStation, containerId, antennaIndex) => new ArrayControlPage(groundStation, containerId, antennaIndex);
