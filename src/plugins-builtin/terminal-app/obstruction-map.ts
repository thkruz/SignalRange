/**
 * @file obstruction-map - E4 obstruction accumulator (phase 40, WP5)
 * @description A sky grid (azimuth x elevation, above the terminal's mask) that fills over sim time
 * with served and blocked sky. Interim engine-side model until ootk #56 ships.
 *
 * Each update the beam direction marks the grid cells inside a small footprint around it. A cell
 * centre is blocked when snow covers the dish (the whole sky) or when it lies inside a tree-line
 * wedge (a partial block); otherwise it counts as served while the link carries service. Time with
 * no service and no block (boot, handover, sleep) marks nothing. Headless: it reads the world only
 * through `ObstructionReader`. State persists across reboots (D15) and has `reset()`.
 */

export interface ObstructionBlockage {
  /** Snow on the dish: nothing is visible */
  wholeSky: boolean;
  /** Ids of partial blocks (tree lines); each id maps to one fixed wedge */
  partialIds: readonly string[];
}

/** The narrow world surface the accumulator reads */
export interface ObstructionReader {
  nowS(): number;
  /** Beam direction in degrees (azimuth 0 = north, clockwise), or null when there is none */
  beam(): { az: number; el: number } | null;
  /** True while the dish looks at the sky (powered, booted, not asleep) */
  observing(): boolean;
  /** True while the link carries service */
  serving(): boolean;
  blockage(): ObstructionBlockage;
}

export type ObstructionCellState = 'unseen' | 'served' | 'blocked';

export interface ObstructionCell {
  azLoDeg: number;
  azHiDeg: number;
  elLoDeg: number;
  elHiDeg: number;
  state: ObstructionCellState;
  servedS: number;
  blockedS: number;
}

export interface ObstructionGrid {
  maskElDeg: number;
  azStepDeg: number;
  elStepDeg: number;
  azCells: number;
  elCells: number;
  /** Row-major by elevation row (lowest first), then azimuth */
  cells: readonly ObstructionCell[];
}

export interface ObstructionSummary {
  /** Blocked cells over seen cells, 0..1 (0 with nothing seen) */
  obstructionFraction: number;
  /** Seen cells over all cells, 0..1 */
  coverage: number;
}

export interface ObstructionState {
  servedS: number[];
  blockedS: number[];
  checkStartedS: number | null;
  lastS: number | null;
}

export interface ObstructionOptions {
  maskElDeg?: number;
  azStepDeg?: number;
  elStepDeg?: number;
  /** Cells whose centre is within this angle of the beam are marked */
  footprintDeg?: number;
}

/** A tree-line wedge: azimuths within `halfWidthDeg` of `centerAzDeg`, elevations up to `maxElDeg` */
export interface TreeLineWedge {
  centerAzDeg: number;
  halfWidthDeg: number;
  maxElDeg: number;
}

export const DEFAULT_MASK_EL_DEG = 25;
/** Seconds a cell needs before it counts as seen */
export const MIN_SEEN_S = 4;
/** Longest span one update may credit, so a clock skip cannot fill the map in one step */
export const MAX_STEP_S = 30;
/** Sim time the "Check for obstructions" flow asks for, seconds */
export const CHECK_DURATION_S = 15 * 60;

const D2R = Math.PI / 180;
const DEFAULT_AZ_STEP = 10;
const DEFAULT_EL_STEP = 5;
const DEFAULT_FOOTPRINT = 12;
const BLOCKED_SHARE = 0.5;
const WEDGE_MIN_HALF_WIDTH = 25;
const WEDGE_HALF_WIDTH_RANGE = 25;
const WEDGE_MIN_EL = 35;
const WEDGE_EL_RANGE = 25;

/** FNV-1a, so a fault id always gives the same wedge */
function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }

  return h >>> 0;
}

/** The fixed wedge for a partial-block id (center anywhere, 50 to 100 degrees wide, up to 35..60 degrees high) */
export function treeLineFor(id: string): TreeLineWedge {
  const h = hash32(id);

  return {
    centerAzDeg: h % 360,
    halfWidthDeg: WEDGE_MIN_HALF_WIDTH + (Math.floor(h / 360) % 1000) * (WEDGE_HALF_WIDTH_RANGE / 1000),
    maxElDeg: WEDGE_MIN_EL + (Math.floor(h / 360000) % 1000) * (WEDGE_EL_RANGE / 1000),
  };
}

/** True when the direction is inside the wedge */
export function wedgeContains(w: TreeLineWedge, azDeg: number, elDeg: number): boolean {
  const d = Math.abs(((((azDeg - w.centerAzDeg) % 360) + 540) % 360) - 180);

  return d <= w.halfWidthDeg && elDeg <= w.maxElDeg;
}

/** Angle between two sky directions, degrees */
export function skySeparationDeg(az1: number, el1: number, az2: number, el2: number): number {
  const a = el1 * D2R;
  const b = el2 * D2R;
  const c = Math.sin(a) * Math.sin(b) + Math.cos(a) * Math.cos(b) * Math.cos((az1 - az2) * D2R);

  return Math.acos(Math.min(1, Math.max(-1, c))) / D2R;
}

export class ObstructionAccumulator {
  readonly maskElDeg: number;
  private readonly azStep_: number;
  private readonly elStep_: number;
  private readonly footprintDeg_: number;
  private readonly azCells_: number;
  private readonly elCells_: number;
  private readonly reader_: ObstructionReader;
  private servedS_: number[];
  private blockedS_: number[];
  private checkStartedS_: number | null = null;
  private lastS_: number | null = null;
  private readonly wedgeCache_ = new Map<string, TreeLineWedge>();

  constructor(reader: ObstructionReader, options: ObstructionOptions = {}) {
    this.reader_ = reader;
    this.maskElDeg = options.maskElDeg ?? DEFAULT_MASK_EL_DEG;
    this.azStep_ = options.azStepDeg ?? DEFAULT_AZ_STEP;
    this.elStep_ = options.elStepDeg ?? DEFAULT_EL_STEP;
    this.footprintDeg_ = options.footprintDeg ?? DEFAULT_FOOTPRINT;
    this.azCells_ = Math.round(360 / this.azStep_);
    this.elCells_ = Math.max(1, Math.ceil((90 - this.maskElDeg) / this.elStep_));
    this.servedS_ = new Array<number>(this.azCells_ * this.elCells_).fill(0);
    this.blockedS_ = new Array<number>(this.azCells_ * this.elCells_).fill(0);
  }

  /** Credit the span since the last call. Call about once a second. */
  update(): void {
    const now = this.reader_.nowS();
    const dt = this.lastS_ === null ? 1 : Math.min(MAX_STEP_S, Math.max(0, now - this.lastS_));
    this.lastS_ = now;
    if (dt <= 0 || !this.reader_.observing()) {
      return;
    }
    const beam = this.reader_.beam();
    if (!beam || beam.el < this.maskElDeg) {
      return;
    }
    const blockage = this.reader_.blockage();
    const wedges = blockage.partialIds.map((id) => this.wedge_(id));
    this.creditAround_(beam.az, beam.el, dt, blockage.wholeSky, wedges, this.reader_.serving());
  }

  /** Mark the cells inside the footprint around a beam direction */
  private creditAround_(beamAz: number, beamEl: number, dt: number, wholeSky: boolean, wedges: readonly TreeLineWedge[], serving: boolean): void {
    for (let r = 0; r < this.elCells_; r++) {
      const el = this.cellEl_(r);
      for (let c = 0; c < this.azCells_; c++) {
        const az = this.cellAz_(c);
        if (skySeparationDeg(beamAz, beamEl, az, el) > this.footprintDeg_) {
          continue;
        }
        const i = r * this.azCells_ + c;
        if (wholeSky || wedges.some((w) => wedgeContains(w, az, el))) {
          this.blockedS_[i] += dt;
        } else if (serving) {
          this.servedS_[i] += dt;
        }
      }
    }
  }

  /**
   * Warm start (phase 40 backfill). The beam track of past hours cannot be replayed, so this is a
   * documented approximation: it credits `spanS` seconds of beams spread over the sky above the mask
   * (drawn from `rand`, a seeded 0..1 source; lower elevations are favoured, as satellites spend more
   * time there), judged against the world as it stands now (observing, serving, blockage). It never
   * touches the clock, the check flow or `lastS`.
   */
  backfill(spanS: number, rand: () => number, stepS = 15): void {
    if (spanS <= 0 || !this.reader_.observing()) {
      return;
    }
    const blockage = this.reader_.blockage();
    const wedges = blockage.partialIds.map((id) => this.wedge_(id));
    const serving = this.reader_.serving();
    const span = 90 - this.maskElDeg;
    for (let t = 0; t < spanS; t += stepS) {
      const az = rand() * 360;
      const el = this.maskElDeg + span * rand() ** 1.5;
      this.creditAround_(az, el, Math.min(stepS, spanS - t), blockage.wholeSky, wedges, serving);
    }
  }

  /** Forget the map and any running check (the player's reset) */
  reset(): void {
    this.servedS_.fill(0);
    this.blockedS_.fill(0);
    this.checkStartedS_ = null;
  }

  /** Start the "Check for obstructions" flow now */
  startCheck(): void {
    this.checkStartedS_ = this.reader_.nowS();
  }

  /** Sim seconds since the check started, or null when no check is running */
  checkElapsedS(): number | null {
    return this.checkStartedS_ === null ? null : Math.max(0, this.reader_.nowS() - this.checkStartedS_);
  }

  checkDone(): boolean {
    const e = this.checkElapsedS();

    return e !== null && e >= CHECK_DURATION_S;
  }

  /** Close the check flow without touching the map */
  endCheck(): void {
    this.checkStartedS_ = null;
  }

  grid(): ObstructionGrid {
    const cells: ObstructionCell[] = [];
    for (let r = 0; r < this.elCells_; r++) {
      for (let c = 0; c < this.azCells_; c++) {
        const i = r * this.azCells_ + c;
        cells.push({
          azLoDeg: c * this.azStep_,
          azHiDeg: (c + 1) * this.azStep_,
          elLoDeg: this.maskElDeg + r * this.elStep_,
          elHiDeg: Math.min(90, this.maskElDeg + (r + 1) * this.elStep_),
          state: this.stateAt_(i),
          servedS: this.servedS_[i],
          blockedS: this.blockedS_[i],
        });
      }
    }

    return { maskElDeg: this.maskElDeg, azStepDeg: this.azStep_, elStepDeg: this.elStep_, azCells: this.azCells_, elCells: this.elCells_, cells };
  }

  summary(): ObstructionSummary {
    let seen = 0;
    let blocked = 0;
    for (let i = 0; i < this.servedS_.length; i++) {
      const s = this.stateAt_(i);
      if (s !== 'unseen') {
        seen++;
        if (s === 'blocked') {
          blocked++;
        }
      }
    }

    return { obstructionFraction: seen ? blocked / seen : 0, coverage: seen / this.servedS_.length };
  }

  /** Blocked share of the seen sky, 0..1 (Advanced screen) */
  obstructionFraction(): number {
    return this.summary().obstructionFraction;
  }

  getState(): ObstructionState {
    return { servedS: [...this.servedS_], blockedS: [...this.blockedS_], checkStartedS: this.checkStartedS_, lastS: this.lastS_ };
  }

  restoreState(state: ObstructionState): void {
    if (state.servedS.length === this.servedS_.length && state.blockedS.length === this.blockedS_.length) {
      this.servedS_ = [...state.servedS];
      this.blockedS_ = [...state.blockedS];
    }
    this.checkStartedS_ = state.checkStartedS;
    this.lastS_ = state.lastS;
  }

  private stateAt_(i: number): ObstructionCellState {
    const served = this.servedS_[i];
    const blocked = this.blockedS_[i];
    const total = served + blocked;
    if (total < MIN_SEEN_S) {
      return 'unseen';
    }

    return blocked / total >= BLOCKED_SHARE ? 'blocked' : 'served';
  }

  private wedge_(id: string): TreeLineWedge {
    let w = this.wedgeCache_.get(id);
    if (!w) {
      w = treeLineFor(id);
      this.wedgeCache_.set(id, w);
    }

    return w;
  }

  private cellAz_(c: number): number {
    return (c + 0.5) * this.azStep_;
  }

  private cellEl_(r: number): number {
    return Math.min(90, this.maskElDeg + (r + 0.5) * this.elStep_);
  }
}

/** Plant surface the plant reader uses */
export interface ObstructionPlant {
  getTimeSeconds(): number;
  skylinkStatus(): string;
  obstructionBlockage(): ObstructionBlockage;
}

const OBSERVING = new Set(['online', 'obstructed', 'heating', 'thermal-throttle']);
const SERVING = new Set(['online', 'thermal-throttle']);

/** Reader over the plant and the phased array read model slice (beam, inOutage) */
export function plantObstructionReader(plant: ObstructionPlant, array: () => { beam?: { az: number; el: number }; inOutage?: boolean } | null): ObstructionReader {
  return {
    nowS: () => plant.getTimeSeconds(),
    beam: () => array()?.beam ?? null,
    observing: () => OBSERVING.has(plant.skylinkStatus()),
    serving: () => SERVING.has(plant.skylinkStatus()) && !array()?.inOutage,
    blockage: () => plant.obstructionBlockage(),
  };
}
