import type { Satellite } from '@app/equipment/satellite/satellite';
import { BOLTZMANN_DBM_PER_K_HZ, thermalNoiseDbm } from '@app/simulation/noise-model';
import type { PropagationSample } from '@app/simulation/propagation/propagation-service';
import { getRfTemplate, type RfBandEnvelope, type RfEnvelope } from '@app/simulation/satellite-rf-templates';
import type { TierScheduler } from '@app/simulation/tier-scheduler';

/**
 * RF candidate narrowing (Phase 3, P3-WP5, plan 2.4 and P3-D3).
 *
 * Per antenna, constellation members are narrowed in this order:
 *   1. Band: the member's RF template has a carrier band overlapping the
 *      antenna's receive or transmit range.
 *   2. Horizon: warm or hot members only (the scheduler's station circle),
 *      then elevation above the horizon.
 *   3. Beam cone: the angle between the boresight and the member is inside the
 *      cone half-angle plus a margin. The cone is the largest off-axis angle at
 *      which one carrier at the group's peak EIRP and minimum range could still
 *      clear `RX_DETECTION_FLOOR_DB` through the antenna's own pattern
 *      (main lobe, first-sidelobe plateau, ITU-R S.580/S.465 envelope).
 *
 * Members inside the cone are promoted (`registry.get`) and take part in the
 * normal signal chain exactly like any other satellite. Authored satellites
 * are never narrowed.
 *
 * Aggregate (P3-D3): members above the horizon, in band, outside the cone add
 * into one noise temperature rise per antenna and band:
 *
 *   dT = sum_m 10^((PSD_m - k_dBm/K/Hz) / 10)           [K]
 *   PSD_m = EIRPdens + duty - FSPL(f, r_m) - Latm(f, el_m) - Lfeed(f) + G_rx(theta_m, f)   [dBm/Hz]
 *   EIRPdens = peak carrier EIRP - 10 log10(carrier bandwidth)
 *
 * G_rx is the antenna pattern with the S.580-style sidelobe envelope. The
 * aggregate is added to the system noise temperature by AntennaCore. With the
 * aggregate on, the cone is capped at CONE_CAP so that a sky of far-sidelobe
 * carriers does not force hundreds of hot members.
 *
 * Cadence: the selection is recomputed once per sim second (and when the
 * boresight moves more than REFRESH_BORESIGHT_DEG), and the cone is widened by
 * the group's angular rate times that second, so membership only needs to
 * change at those points.
 */

export const RX_DETECTION_FLOOR_DB = -10;
/** Boresight movement that forces a re-selection before the next grid second, degrees */
export const REFRESH_BORESIGHT_DEG = 0.5;
export const REFRESH_PERIOD_MS = 1000;
/** Constant cone widening on top of the rate term, degrees (wind de-pointing, boresight tolerance, grid interpolation) */
export const CONE_MARGIN_DEG = 1;
/** How long a promoted member stays hydrated after it last needed to be, sim ms */
export const RF_HOLD_MS = 20_000;
/** Cone cap when the aggregate is on: 8 beamwidths, clamped to this range, degrees */
export const CONE_CAP_MIN_DEG = 5;
export const CONE_CAP_MAX_DEG = 25;

const RAD = Math.PI / 180;
const WGS84_A_KM = 6378.137;
const WGS84_E2 = 0.00669437999014;

/** What the selector needs from an antenna (kept as closures so tests can drive it and the antenna can keep its internals private). */
export interface RfAntennaPort {
  latDeg: number;
  lonDeg: number;
  altKm: number;
  rxBand: readonly [number, number];
  txBand: readonly [number, number];
  /** Boresight azimuth and elevation, degrees */
  boresight(): { az: number; el: number };
  /** Pattern gain at theta degrees off boresight, dBi */
  patternGainDbi(thetaDeg: number, fHz: number): number;
  beamwidth3dBDeg(fHz: number): number;
  fsplDb(fHz: number, rangeKm: number): number;
  atmosphericLossDb(fHz: number, elDeg: number): number;
  feedLossDb(fHz: number): number;
  /** Clear-sky system noise temperature (no aggregate), K */
  clearSkyNoiseK(fHz: number): number;
  /** Effective angle between boresight and a target at az/el, degrees */
  offAxisDeg(azDeg: number, elDeg: number): number;
  /** A hydrated satellite as this antenna's station sees it */
  viewOf(sat: Satellite): { az: number; el: number; rangeKm: number };
}

/** Greenwich mean sidereal time, radians, from UTC milliseconds. */
export function gmstRad(ms: number): number {
  const jd = ms / 86_400_000 + 2_440_587.5;
  const d = jd - 2_451_545;
  const t = d / 36_525;
  const deg = 280.46061837 + 360.98564736629 * d + 0.000387933 * t * t - (t * t * t) / 38_710_000;
  const wrapped = ((deg % 360) + 360) % 360;

  return wrapped * RAD;
}

export interface StationFrame {
  /** Station position, TEME-like ECI, km */
  x: number;
  y: number;
  z: number;
  east: [number, number, number];
  north: [number, number, number];
  up: [number, number, number];
}

export function stationFrame(latDeg: number, lonDeg: number, altKm: number, ms: number): StationFrame {
  const lat = latDeg * RAD;
  const lon = lonDeg * RAD + gmstRad(ms);
  const sl = Math.sin(lat);
  const cl = Math.cos(lat);
  const n = WGS84_A_KM / Math.sqrt(1 - WGS84_E2 * sl * sl);
  const r = (n + altKm) * cl;
  const so = Math.sin(lon);
  const co = Math.cos(lon);

  return {
    x: r * co,
    y: r * so,
    z: (n * (1 - WGS84_E2) + altKm) * sl,
    east: [-so, co, 0],
    north: [-sl * co, -sl * so, cl],
    up: [cl * co, cl * so, sl],
  };
}

/** Unit vector of a horizontal direction in the frame's ECI axes. */
export function directionEci(frame: StationFrame, azDeg: number, elDeg: number): [number, number, number] {
  const az = azDeg * RAD;
  const el = elDeg * RAD;
  const ce = Math.cos(el);
  const se = Math.sin(el);
  const sa = Math.sin(az) * ce;
  const ca = Math.cos(az) * ce;

  return [
    sa * frame.east[0] + ca * frame.north[0] + se * frame.up[0],
    sa * frame.east[1] + ca * frame.north[1] + se * frame.up[1],
    sa * frame.east[2] + ca * frame.north[2] + se * frame.up[2],
  ];
}

interface ConeEntry {
  uncappedDeg: number;
  cappedDeg: number;
}

interface AggregateBand {
  loHz: number;
  hiHz: number;
  k: number;
}

export interface RfSelectionStats {
  refreshes: number;
  promoted: number;
  lastInCone: number;
  lastAggregated: number;
  lastRefreshMs: number;
}

export class RfSelector {
  private readonly stats_: RfSelectionStats = { refreshes: 0, promoted: 0, lastInCone: 0, lastAggregated: 0, lastRefreshMs: Number.NaN };
  private lastMs_ = Number.NaN;
  private lastAz_ = Number.NaN;
  private lastEl_ = Number.NaN;
  private lastAggregateFlag_: boolean | null = null;
  private candidates_: Satellite[] = [];
  private readonly inCone_ = new Set<number>();
  private aggregate_: AggregateBand[] = [];
  private readonly sample_: PropagationSample = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, elDeg: new Float64Array(16), rangeKm: new Float64Array(16), gridMs: 0 };

  constructor(
    readonly scheduler: TierScheduler,
    readonly stationIndex: number,
    private readonly port_: RfAntennaPort
  ) {}

  get stats(): Readonly<RfSelectionStats> {
    return this.stats_;
  }

  /** Authored satellites plus the members inside the cone, refreshed on the 1 s sim grid. */
  candidates(): readonly Satellite[] {
    this.refresh(false);

    return this.candidates_;
  }

  /** True when a member NORAD id is in the current cone set (authored satellites are not tracked here). */
  isInCone(norad: number): boolean {
    return this.inCone_.has(norad);
  }

  /** Aggregate noise temperature rise at `fHz`, K (0 when off or nothing contributes). */
  aggregateK(fHz: number): number {
    let sum = 0;
    for (const b of this.aggregate_) {
      if (fHz >= b.loHz && fHz <= b.hiHz) sum += b.k;
    }

    return sum;
  }

  /** Cone half-angle in degrees (margin and rate allowance included) a member is promoted at, for tests and diagnostics. */
  coneLimitDeg(norad: number): number {
    const env = getRfTemplate(this.scheduler.registry.rfTemplateIdOf(norad) ?? '')?.envelope;
    if (!env) return 180;
    const cone = this.coneFor_(env);

    return (this.scheduler.rfAggregate ? cone.cappedDeg : cone.uncappedDeg) + CONE_MARGIN_DEG + env.maxRateDegS * (REFRESH_PERIOD_MS / 1000);
  }

  private coneFor_(env: RfEnvelope): ConeEntry {
    const port = this.port_;
    let uncapped = 0;
    let capped = 0;
    for (const band of env.bands) {
      const f = bandCentre_(band, port.rxBand, port.txBand);
      if (f === null) continue;
      const noiseDbm = thermalNoiseDbm(port.clearSkyNoiseK(f), band.carrierBwHz);
      const best = band.maxEirpDbm - port.fsplDb(f, env.minRangeKm);
      // Gain the pattern must still deliver for the carrier to clear the floor (losses other than FSPL ignored: conservative)
      const need = RX_DETECTION_FLOOR_DB + noiseDbm - best;
      let theta: number;
      if (port.patternGainDbi(180, f) >= need) {
        theta = 180;
      } else if (port.patternGainDbi(0, f) < need) {
        theta = 0;
      } else {
        let lo = 0;
        let hi = 180;
        for (let i = 0; i < 28; i++) {
          const mid = (lo + hi) / 2;
          if (port.patternGainDbi(mid, f) >= need) lo = mid;
          else hi = mid;
        }
        theta = lo;
      }
      uncapped = Math.max(uncapped, theta);
      const cap = Math.min(CONE_CAP_MAX_DEG, Math.max(CONE_CAP_MIN_DEG, 8 * port.beamwidth3dBDeg(f)));
      capped = Math.max(capped, Math.min(theta, cap));
    }

    return { uncappedDeg: uncapped, cappedDeg: capped };
  }

  /** Re-select now (tests) or when the grid second, the boresight or the flags say so. */
  refresh(force: boolean): void {
    const sch = this.scheduler;
    const now = sch.nowMs();
    const bore = this.port_.boresight();
    const aggregateOn = sch.rfAggregate;
    const moved = Math.abs(bore.az - this.lastAz_) > REFRESH_BORESIGHT_DEG || Math.abs(bore.el - this.lastEl_) > REFRESH_BORESIGHT_DEG;
    const due = !(now >= this.lastMs_ && now - this.lastMs_ < REFRESH_PERIOD_MS);
    if (!force && !due && !moved && aggregateOn === this.lastAggregateFlag_) {
      return;
    }
    this.lastMs_ = now;
    this.lastAz_ = bore.az;
    this.lastEl_ = bore.el;
    this.lastAggregateFlag_ = aggregateOn;
    this.stats_.refreshes++;
    this.stats_.lastRefreshMs = now;

    const port = this.port_;
    const registry = sch.registry;
    const frame = stationFrame(port.latDeg, port.lonDeg, port.altKm, now);
    const b = directionEci(frame, bore.az, bore.el);
    const cones = new Map<string, ConeEntry>();
    const envOf = (norad: number): { env: RfEnvelope | undefined; cone: ConeEntry } => {
      const id = registry.rfTemplateIdOf(norad) ?? '';
      const env = getRfTemplate(id)?.envelope;
      if (!env) return { env, cone: { uncappedDeg: 180, cappedDeg: 180 } };
      let cone = cones.get(id);
      if (!cone) {
        cone = this.coneFor_(env);
        cones.set(id, cone);
      }

      return { env, cone };
    };

    const acc = new Map<string, AggregateBand>();
    const atmCache = new Map<number, number>();
    const inCone: Satellite[] = [];
    const nextIds = new Set<number>();
    let aggregated = 0;
    const holdUntil = now + RF_HOLD_MS;
    const seen = new Set<number>();

    const handle = (norad: number, thetaDeg: number, elDeg: number, rangeKm: number, hydrated: Satellite | undefined): void => {
      const { env, cone } = envOf(norad);
      if (env && !env.bands.some((band) => bandCentre_(band, port.rxBand, port.txBand) !== null)) return; // 1. band
      if (elDeg <= 0) return; // 2. horizon
      const limit = (aggregateOn ? cone.cappedDeg : cone.uncappedDeg) + CONE_MARGIN_DEG + (env ? env.maxRateDegS * (REFRESH_PERIOD_MS / 1000) : 0);
      if (thetaDeg <= limit) {
        // 3. cone
        const sat = hydrated ?? registry.get(norad);
        if (sat) {
          inCone.push(sat);
          nextIds.add(norad);
          sch.holdRf(norad, holdUntil);
          if (!hydrated) this.stats_.promoted++;
        }

        return;
      }
      if (!aggregateOn || !env) return;
      aggregated++;
      for (const band of env.bands) {
        const f = bandCentre_(band, port.rxBand, null);
        if (f === null) continue;
        const el1 = Math.max(1, elDeg);
        const key = Math.round(el1 * 4) + (f > 1e10 ? 1e6 : 0);
        let atm = atmCache.get(key);
        if (atm === undefined) {
          atm = port.atmosphericLossDb(f, el1);
          atmCache.set(key, atm);
        }
        const psd =
          band.maxEirpDbm - 10 * Math.log10(band.carrierBwHz) + env.aggregateDutyDb - port.fsplDb(f, rangeKm) - atm - port.feedLossDb(f) + port.patternGainDbi(thetaDeg, f);
        const k = 10 ** ((psd - BOLTZMANN_DBM_PER_K_HZ) / 10);
        const id = `${band.loHz}-${band.hiHz}`;
        const entry = acc.get(id);
        if (entry) entry.k += k;
        else acc.set(id, { loHz: band.loHz, hiHz: band.hiHz, k });
      }
    };

    // Hydrated members first (exact geometry from the antenna's own view)
    const hydrated = registry.hydrated;
    for (let i = registry.authoredCount; i < hydrated.length; i++) {
      const sat = hydrated[i];
      seen.add(sat.noradId);
      const v = port.viewOf(sat);
      handle(sat.noradId, port.offAxisDeg(v.az, v.el), v.el, v.rangeKm, sat);
    }

    // Warm members of this station from the 1 s grid (not hydrated; a member promoted below is hydrated by `handle`)
    if (this.stationIndex >= 0) {
      for (const norad of sch.warmFor(this.stationIndex)) {
        if (seen.has(norad) || registry.isHydrated(norad)) continue;
        if (!sch.sampleAt(norad, now, this.sample_)) continue;
        const el = this.sample_.elDeg[this.stationIndex];
        const range = this.sample_.rangeKm[this.stationIndex];
        if (!(range > 0) || Number.isNaN(el)) continue;
        const dx = (this.sample_.x - frame.x) / range;
        const dy = (this.sample_.y - frame.y) / range;
        const dz = (this.sample_.z - frame.z) / range;
        const cosT = Math.max(-1, Math.min(1, dx * b[0] + dy * b[1] + dz * b[2]));
        handle(norad, Math.acos(cosT) / RAD, el, range, undefined);
      }
    }

    // Authored satellites first, then the cone members by NORAD id (the order the scheduler updates them in)
    inCone.sort((a, c) => a.noradId - c.noradId);
    const authored = registry.hydrated.slice(0, registry.authoredCount);
    this.candidates_ = authored.concat(inCone);
    this.inCone_.clear();
    for (const id of nextIds) this.inCone_.add(id);
    this.aggregate_ = [...acc.values()];
    this.stats_.lastInCone = inCone.length;
    this.stats_.lastAggregated = aggregated;
    sch.releaseRfExpired(now);
  }
}

/** Centre of the overlap of a band with the antenna's rx (or tx) range, or null when there is none. */
function bandCentre_(band: RfBandEnvelope, rx: readonly [number, number], tx: readonly [number, number] | null): number | null {
  const lo = Math.max(band.loHz, rx[0]);
  const hi = Math.min(band.hiHz, rx[1]);
  if (lo <= hi) return (lo + hi) / 2;
  if (tx) {
    const tlo = Math.max(band.loHz, tx[0]);
    const thi = Math.min(band.hiHz, tx[1]);
    if (tlo <= thi) return (tlo + thi) / 2;
  }

  return null;
}
