/**
 * Beam scheduler (P2): decides which satellite the single beam serves.
 *
 * Pure logic over a `SkySource`, so it is unit-testable without the
 * simulation. Work stays on the visible list the source hands over (the
 * scheduler warm set plus hydrated satellites, capped), never on the 11k
 * constellation.
 *
 * Modes:
 *  - auto:   serve the best eligible satellite (in the scan cone, outside every
 *            exclusion zone), preferring high elevation with hysteresis.
 *  - manual: `lock(norad)`; the lock is dropped if the satellite leaves the cone
 *            or enters an enabled exclusion zone.
 *  - stow:   the beam parks on the panel normal.
 */
import type { PanelGeometry } from './scan-geometry';

export type BeamMode = 'auto' | 'manual' | 'stow';

export interface SkyObject {
  norad: number;
  name: string;
  /** Degrees clockwise from north */
  az: number;
  /** Degrees above the horizon */
  el: number;
}

/** Where the scheduler gets satellites from. */
export interface SkySource {
  /** Satellites above the horizon the station can see at simMs, at most `max`. */
  list(simMs: number, max: number): SkyObject[];
  /** Direction of one satellite at a sim time (now or ahead); null when unknown. */
  positionOf(norad: number, simMs: number): { az: number; el: number } | null;
  /** Make a satellite hot so its signals reach the antenna. */
  touch?(norad: number): void;
}

export interface BeamSchedulerConfig {
  /** Hand over when a candidate beats the current satellite's elevation by more than this, degrees */
  hysteresisDeg: number;
  /** Beam dead time at every handover (and first acquisition), ms of sim time */
  handoverOutageMs: number;
  /** Visible list and selection refresh period, sim ms (about 1 Hz) */
  refreshMs: number;
  /** Visible list cap */
  maxVisible: number;
  /** Prediction horizon, sim ms (5 to 10 minutes) */
  predictHorizonMs: number;
  /** Prediction step, sim ms */
  predictStepMs: number;
  /** Satellites considered in a prediction (highest elevation now) */
  predictCandidates: number;
  /** Predictions are recomputed at most this often, sim ms */
  predictRefreshMs: number;
  /** Handovers kept in the prediction */
  maxPredicted: number;
}

export const DEFAULT_SCHEDULER_CONFIG: BeamSchedulerConfig = {
  hysteresisDeg: 8,
  handoverOutageMs: 100,
  refreshMs: 1000,
  maxVisible: 400,
  predictHorizonMs: 10 * 60_000,
  predictStepMs: 15_000,
  predictCandidates: 120,
  predictRefreshMs: 15_000,
  maxPredicted: 6,
};

export type HandoverReason = 'acquire' | 'better' | 'left-cone' | 'exclusion' | 'set' | 'lost';

export interface VisibleSatellite {
  norad: number;
  name: string;
  az: number;
  el: number;
  /** Inside the panel's scan cone (could be pointed at) */
  inScan: boolean;
  /** Inside an enabled exclusion zone */
  inExclusion: boolean;
}

export interface BeamTargetInfo {
  norad: number;
  name: string;
  az: number;
  el: number;
}

export interface PredictedHandover {
  /** Sim time of the handover, ms */
  atMs: number;
  fromNorad: number | null;
  toNorad: number | null;
  toName: string;
  reason: HandoverReason;
}

export interface HandoverRecord {
  atMs: number;
  fromNorad: number | null;
  toNorad: number | null;
  reason: HandoverReason;
}

/** What the scheduler publishes at about 1 Hz. */
export interface SchedulerSnapshot {
  simMs: number;
  mode: BeamMode;
  visible: readonly VisibleSatellite[];
  target: BeamTargetInfo | null;
  /** Best eligible satellite other than the target: the likely next handover */
  candidate: BeamTargetInfo | null;
  /** Next handovers over the prediction horizon (auto mode only) */
  handovers: readonly PredictedHandover[];
  handoverCount: number;
  lastHandover: HandoverRecord | null;
  /** Why a manual lock was last dropped, if it was */
  lockLostReason: HandoverReason | null;
}

export type LockResult = { ok: true } | { ok: false; reason: 'unknown' | 'below-horizon' | 'out-of-scan' | 'in-exclusion' };

export interface Eligible {
  norad: number;
  el: number;
}

/**
 * Pure selection rule. The best is the highest elevation (ties: lowest NORAD).
 * The current satellite is kept while it is eligible unless the best beats it by
 * more than `marginDeg`.
 */
export function selectTarget(eligible: readonly Eligible[], currentNorad: number | null, marginDeg: number): { norad: number; isHandover: boolean } | null {
  let best: Eligible | null = null;
  let current: Eligible | null = null;

  for (const c of eligible) {
    if (best === null || c.el > best.el || (c.el === best.el && c.norad < best.norad)) {
      best = c;
    }
    if (c.norad === currentNorad) {
      current = c;
    }
  }
  if (best === null) {
    return null;
  }
  if (current !== null && best.el - current.el <= marginDeg) {
    return { norad: current.norad, isHandover: false };
  }

  return { norad: best.norad, isHandover: best.norad !== currentNorad };
}

export class BeamScheduler {
  readonly config: BeamSchedulerConfig;

  private mode_: BeamMode = 'auto';
  private targetNorad_: number | null = null;
  private targetName_ = '';
  private beam_: { az: number; el: number };
  private outageUntilMs_ = -Infinity;
  private handoverCount_ = 0;
  private lastHandover_: HandoverRecord | null = null;
  private lockLostReason_: HandoverReason | null = null;
  /** Why the auto target was lost, used as the reason of the next acquisition */
  private pendingLossReason_: HandoverReason | null = null;

  private lastRefreshMs_ = -Infinity;
  private lastPredictMs_ = -Infinity;
  private predictDirty_ = true;
  private visible_: VisibleSatellite[] = [];
  private candidate_: BeamTargetInfo | null = null;
  private handovers_: PredictedHandover[] = [];
  private lastSimMs_ = 0;
  private readonly names_ = new Map<number, string>();

  constructor(
    private source_: SkySource,
    private readonly panel_: PanelGeometry,
    private readonly isExcluded_: (az: number, el: number) => boolean,
    config: Partial<BeamSchedulerConfig> = {}
  ) {
    this.config = { ...DEFAULT_SCHEDULER_CONFIG, ...config };
    this.beam_ = { ...panel_.normalAzEl };
  }

  setSource(source: SkySource): void {
    this.source_ = source;
    this.invalidate();
  }

  /** Sky path of one satellite from simMs over spanMs (above the horizon only), for the page's predicted track. */
  predictTrack(norad: number, simMs: number, spanMs: number, stepMs: number): { az: number; el: number }[] {
    const out: { az: number; el: number }[] = [];

    for (let t = 0; t <= spanMs; t += stepMs) {
      const p = this.source_.positionOf(norad, simMs + t);

      if (p && p.el >= 0) {
        out.push({ az: p.az, el: p.el });
      }
    }

    return out;
  }

  get mode(): BeamMode {
    return this.mode_;
  }

  get targetNorad(): number | null {
    return this.targetNorad_;
  }

  /** Where the beam points now. */
  get beam(): { az: number; el: number } {
    return this.beam_;
  }

  get handoverCount(): number {
    return this.handoverCount_;
  }

  /** True while the beam is dead after a handover. */
  isInOutage(simMs: number = this.lastSimMs_): boolean {
    return simMs < this.outageUntilMs_;
  }

  /** Dead time left at simMs, ms (0 when the beam is live). */
  outageRemainingMs(simMs: number = this.lastSimMs_): number {
    return Math.max(0, this.outageUntilMs_ - simMs);
  }

  /** Force the next update to re-select and re-predict (zone toggled, mode changed, time jumped). */
  invalidate(): void {
    this.lastRefreshMs_ = -Infinity;
    this.predictDirty_ = true;
  }

  setMode(mode: BeamMode): void {
    if (mode === this.mode_) {
      return;
    }
    this.mode_ = mode;
    this.lockLostReason_ = null;
    if (mode === 'stow') {
      this.dropTarget_();
      this.beam_ = { ...this.panel_.normalAzEl };
    }
    this.invalidate();
  }

  /** Manual mode: lock the beam on a satellite. Refused outside the scan cone or inside an enabled exclusion zone. */
  lock(norad: number, simMs: number = this.lastSimMs_): LockResult {
    const pos = this.source_.positionOf(norad, simMs);

    if (!pos) {
      return { ok: false, reason: 'unknown' };
    }
    if (pos.el <= 0) {
      return { ok: false, reason: 'below-horizon' };
    }
    if (!this.panel_.isInScanCone(pos.az, pos.el)) {
      return { ok: false, reason: 'out-of-scan' };
    }
    if (this.isExcluded_(pos.az, pos.el)) {
      return { ok: false, reason: 'in-exclusion' };
    }
    this.mode_ = 'manual';
    this.lockLostReason_ = null;
    this.setTarget_(norad, simMs, 'acquire');
    this.beam_ = { az: pos.az, el: pos.el };
    this.invalidate();

    return { ok: true };
  }

  stow(): void {
    this.setMode('stow');
  }

  /** Advance to simMs. Cheap per frame; the visible list and selection run at refreshMs. */
  update(simMs: number): void {
    const jumped = simMs < this.lastSimMs_ || simMs - this.lastSimMs_ > 30_000;

    this.lastSimMs_ = simMs;
    if (jumped) {
      this.invalidate();
    }
    if (this.mode_ === 'stow') {
      this.beam_ = { ...this.panel_.normalAzEl };
      this.refreshIfDue_(simMs);

      return;
    }

    // Per frame: follow the target, and react at once if it can no longer be served
    if (this.targetNorad_ !== null) {
      const pos = this.source_.positionOf(this.targetNorad_, simMs);

      if (!pos || pos.el <= 0) {
        this.loseTarget_('set', simMs);
      } else if (!this.panel_.isInScanCone(pos.az, pos.el)) {
        this.loseTarget_('left-cone', simMs);
      } else if (this.isExcluded_(pos.az, pos.el)) {
        this.loseTarget_('exclusion', simMs);
      } else {
        this.beam_ = { az: pos.az, el: pos.el };
      }
    }
    this.refreshIfDue_(simMs);
    if (this.targetNorad_ === null) {
      this.beam_ = { ...this.panel_.normalAzEl };
    }
  }

  snapshot(): SchedulerSnapshot {
    const target = this.targetNorad_ === null ? null : { norad: this.targetNorad_, name: this.targetName_, az: this.beam_.az, el: this.beam_.el };

    return {
      simMs: this.lastSimMs_,
      mode: this.mode_,
      visible: this.visible_,
      target,
      candidate: this.mode_ === 'stow' ? null : this.candidate_,
      handovers: this.mode_ === 'auto' ? this.handovers_ : [],
      handoverCount: this.handoverCount_,
      lastHandover: this.lastHandover_,
      lockLostReason: this.lockLostReason_,
    };
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private dropTarget_(): void {
    this.targetNorad_ = null;
    this.targetName_ = '';
  }

  private setTarget_(norad: number, simMs: number, reason: HandoverReason): void {
    if (norad === this.targetNorad_) {
      return;
    }
    // After a loss the target is already null; the handover still came from the lost satellite
    const from = this.targetNorad_ ?? (this.pendingLossReason_ !== null ? (this.lastHandover_?.fromNorad ?? null) : null);

    this.targetNorad_ = norad;
    this.targetName_ = this.names_.get(norad) ?? `NORAD ${norad}`;
    this.outageUntilMs_ = simMs + this.config.handoverOutageMs;
    this.source_.touch?.(norad);
    if (from !== null) {
      this.handoverCount_++;
    }
    this.lastHandover_ = { atMs: simMs, fromNorad: from, toNorad: norad, reason };
    this.predictDirty_ = true;
  }

  /** The target can no longer be served: auto re-selects at once, manual drops the lock. */
  private loseTarget_(reason: HandoverReason, simMs: number): void {
    this.lastHandover_ = { atMs: simMs, fromNorad: this.targetNorad_, toNorad: null, reason };
    this.dropTarget_();
    this.predictDirty_ = true;
    if (this.mode_ === 'manual') {
      this.lockLostReason_ = reason;
    } else {
      this.pendingLossReason_ = reason;
      this.lastRefreshMs_ = -Infinity;
    }
  }

  private refreshIfDue_(simMs: number): void {
    if (simMs - this.lastRefreshMs_ < this.config.refreshMs) {
      return;
    }
    this.lastRefreshMs_ = simMs;

    const list = this.source_.list(simMs, this.config.maxVisible);
    const visible: VisibleSatellite[] = [];

    for (const s of list) {
      if (s.el <= 0) {
        continue;
      }
      this.names_.set(s.norad, s.name);
      visible.push({ norad: s.norad, name: s.name, az: s.az, el: s.el, inScan: this.panel_.isInScanCone(s.az, s.el), inExclusion: this.isExcluded_(s.az, s.el) });
    }
    visible.sort((a, b) => b.el - a.el || a.norad - b.norad);
    this.visible_ = visible;

    const eligible = visible.filter((v) => v.inScan && !v.inExclusion);

    if (this.mode_ === 'auto') {
      const pick = selectTarget(eligible, this.targetNorad_, this.config.hysteresisDeg);

      if (pick?.isHandover) {
        const reason: HandoverReason = this.targetNorad_ === null ? (this.pendingLossReason_ ?? 'acquire') : 'better';

        this.setTarget_(pick.norad, simMs, reason);
        this.pendingLossReason_ = null;
        const v = visible.find((x) => x.norad === pick.norad);

        if (v) {
          this.beam_ = { az: v.az, el: v.el };
        }
      }
    }

    const other = eligible.find((v) => v.norad !== this.targetNorad_);

    this.candidate_ = other ? { norad: other.norad, name: other.name, az: other.az, el: other.el } : null;

    if (this.mode_ === 'auto' && (this.predictDirty_ || simMs - this.lastPredictMs_ >= this.config.predictRefreshMs)) {
      this.predict_(simMs, visible);
    }
  }

  /** Run the selection rule forward on source positions (worker samples through the source; no propagation here). */
  private predict_(simMs: number, visible: readonly VisibleSatellite[]): void {
    this.lastPredictMs_ = simMs;
    this.predictDirty_ = false;

    const cfg = this.config;
    const ids = visible.slice(0, cfg.predictCandidates).map((v) => v.norad);

    if (this.targetNorad_ !== null && !ids.includes(this.targetNorad_)) {
      ids.push(this.targetNorad_);
    }
    const out: PredictedHandover[] = [];
    let current = this.targetNorad_;

    for (let t = simMs + cfg.predictStepMs; t <= simMs + cfg.predictHorizonMs && out.length < cfg.maxPredicted; t += cfg.predictStepMs) {
      const eligible: Eligible[] = [];
      let currentState: HandoverReason | null = null;

      for (const id of ids) {
        const p = this.source_.positionOf(id, t);
        let state: HandoverReason | null = null;

        if (!p || p.el <= 0) {
          state = 'set';
        } else if (!this.panel_.isInScanCone(p.az, p.el)) {
          state = 'left-cone';
        } else if (this.isExcluded_(p.az, p.el)) {
          state = 'exclusion';
        }
        if (state !== null) {
          if (id === current) {
            currentState = state;
          }
          continue;
        }
        eligible.push({ norad: id, el: (p as { el: number }).el });
      }
      const pick = selectTarget(eligible, current, cfg.hysteresisDeg);
      const next = pick ? pick.norad : null;

      if (next !== current) {
        out.push({
          atMs: t,
          fromNorad: current,
          toNorad: next,
          toName: next === null ? '' : (this.names_.get(next) ?? `NORAD ${next}`),
          reason: current === null ? 'acquire' : (currentState ?? 'better'),
        });
        current = next;
      }
    }
    this.handovers_ = out;
  }
}
