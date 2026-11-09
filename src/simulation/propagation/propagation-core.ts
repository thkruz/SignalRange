/**
 * Batch SGP4 shared by the propagation worker and the main-thread fallback.
 *
 * Both sides run exactly this code on the same ootk `Satellite`, so a worker
 * sample and a fallback sample for the same (member, grid time) are bitwise
 * equal. Frame: TEME ECI, km and km/s (what `Satellite.eci()` returns, the
 * same state the hot path in orbital-satellite.ts uses).
 *
 * Output layout (structure-of-arrays, one slot per grid time):
 *   pos  Float64Array(count * POS_STRIDE): x y z vx vy vz
 *   look Float64Array(count * stations * 2): per station elevation deg, range km
 * A failed propagation writes NaN.
 */
import { type Degrees, GroundStation, type Kilometers, Satellite as OotkSatellite, type TleLine1, type TleLine2 } from 'ootk';

export const POS_STRIDE = 6;

/** Station as lat/lon degrees and altitude km, packed [lat, lon, alt] per station. */
export const STATION_STRIDE = 3;

const DEG = 180 / Math.PI;

export class PropagatorCore {
  private readonly sats_: (OotkSatellite | null)[];
  private readonly grounds_: GroundStation[] = [];
  private readonly latRad_: Float64Array;
  private readonly lonRad_: Float64Array;

  constructor(
    private readonly tle1_: readonly string[],
    private readonly tle2_: readonly string[],
    stations_: Float64Array
  ) {
    this.sats_ = new Array<OotkSatellite | null>(tle1_.length).fill(null);
    const s = stations_.length / STATION_STRIDE;
    this.latRad_ = new Float64Array(s);
    this.lonRad_ = new Float64Array(s);
    for (let i = 0; i < s; i++) {
      const lat = stations_[i * STATION_STRIDE];
      const lon = stations_[i * STATION_STRIDE + 1];
      this.latRad_[i] = lat / DEG;
      this.lonRad_[i] = lon / DEG;
      this.grounds_.push(new GroundStation({ name: `st${i}`, lat: lat as Degrees, lon: lon as Degrees, alt: stations_[i * STATION_STRIDE + 2] as Kilometers }));
    }
  }

  get memberCount(): number {
    return this.tle1_.length;
  }

  get stationCount(): number {
    return this.grounds_.length;
  }

  private sat_(index: number): OotkSatellite {
    let sat = this.sats_[index];
    if (!sat) {
      sat = new OotkSatellite({ name: `m${index}`, tle1: this.tle1_[index] as TleLine1, tle2: this.tle2_[index] as TleLine2 });
      this.sats_[index] = sat;
    }
    return sat;
  }

  /** Per-station ECI position (km) and geodetic-up unit vector in TEME at `date`. */
  private stationFrames_(date: Date): Float64Array {
    const n = this.grounds_.length;
    const out = new Float64Array(n * 6);
    for (let i = 0; i < n; i++) {
      const g = this.grounds_[i];
      const eci = g.eci(date);
      const ecef = g.ecef();
      // GMST = angle(eci) - angle(ecef) about z
      const gmst = Math.atan2(eci.y, eci.x) - Math.atan2(ecef.y, ecef.x);
      const lat = this.latRad_[i];
      const lon = this.lonRad_[i] + gmst;
      out[i * 6] = eci.x;
      out[i * 6 + 1] = eci.y;
      out[i * 6 + 2] = eci.z;
      out[i * 6 + 3] = Math.cos(lat) * Math.cos(lon);
      out[i * 6 + 4] = Math.cos(lat) * Math.sin(lon);
      out[i * 6 + 5] = Math.sin(lat);
    }
    return out;
  }

  /**
   * Propagate members to `gridMs`. `indices` null means all members in order;
   * otherwise slot k holds member indices[k]. Writes into pos/look.
   */
  compute(gridMs: number, indices: Int32Array | null, pos: Float64Array, look: Float64Array): void {
    const count = indices ? indices.length : this.tle1_.length;
    const stations = this.grounds_.length;
    const date = new Date(gridMs);
    const frames = this.stationFrames_(date);
    for (let k = 0; k < count; k++) {
      this.computeOne_(this.sat_(indices ? indices[k] : k), date, frames, stations, pos, k * POS_STRIDE, look, k * stations * 2);
    }
  }

  /** One member at one grid time (the fallback path). `look` may be shorter-lived scratch. */
  computeOne(index: number, gridMs: number, pos: Float64Array, look: Float64Array): void {
    const date = new Date(gridMs);
    this.computeOne_(this.sat_(index), date, this.stationFrames_(date), this.grounds_.length, pos, 0, look, 0);
  }

  private computeOne_(sat: OotkSatellite, date: Date, frames: Float64Array, stations: number, pos: Float64Array, po: number, look: Float64Array, lo: number): void {
    let pv: ReturnType<OotkSatellite['eci']> = null;
    try {
      pv = sat.eci(date);
    } catch {
      pv = null;
    }
    if (!pv) {
      for (let i = 0; i < POS_STRIDE; i++) pos[po + i] = Number.NaN;
      for (let i = 0; i < stations * 2; i++) look[lo + i] = Number.NaN;
      return;
    }
    const p = pv.position;
    const v = pv.velocity;
    pos[po] = p.x;
    pos[po + 1] = p.y;
    pos[po + 2] = p.z;
    pos[po + 3] = v.x;
    pos[po + 4] = v.y;
    pos[po + 5] = v.z;
    for (let s = 0; s < stations; s++) {
      const dx = p.x - frames[s * 6];
      const dy = p.y - frames[s * 6 + 1];
      const dz = p.z - frames[s * 6 + 2];
      const rng = Math.hypot(dx, dy, dz);
      const up = dx * frames[s * 6 + 3] + dy * frames[s * 6 + 4] + dz * frames[s * 6 + 5];
      look[lo + s * 2] = Math.asin(Math.max(-1, Math.min(1, up / rng))) * DEG;
      look[lo + s * 2 + 1] = rng;
    }
  }
}
