/**
 * Exclusion zones: parts of the sky the beam must not point into.
 *
 * The default zone is a GEO arc protection band, as real non-geostationary
 * terminals keep: the beam stays at least `widthDeg` away from the arc of
 * geostationary satellites visible from the station. Computed here from the
 * station position; it does not depend on any other component.
 */
import { enuToAzEl, enuUnit, separationDeg, type Vec3 } from './scan-geometry';

const D2R = Math.PI / 180;
const WGS84_A_KM = 6378.137;
const WGS84_E2 = 0.00669437999014;
const GEO_RADIUS_KM = 42164.17;
/** Visible-arc sampling step in GEO longitude, degrees */
const ARC_STEP_DEG = 0.5;
/** Arc points below this elevation are not part of the visible arc */
const ARC_MIN_EL_DEG = 0;

export interface ExclusionZone {
  readonly id: string;
  readonly label: string;
  enabled: boolean;
  /** True when the direction is inside this zone (ignores `enabled`). */
  contains(azDeg: number, elDeg: number): boolean;
}

/**
 * Az/el points of the GEO belt visible from a station (elevation above
 * the horizon), ordered by GEO longitude. Station geodetic degrees, altitude km.
 */
export function visibleGeoArc(latDeg: number, lonDeg: number, altKm = 0): { az: number; el: number }[] {
  const lat = latDeg * D2R;
  const lon = lonDeg * D2R;
  const sl = Math.sin(lat);
  const cl = Math.cos(lat);
  const so = Math.sin(lon);
  const co = Math.cos(lon);
  const n = WGS84_A_KM / Math.sqrt(1 - WGS84_E2 * sl * sl);
  const sx = (n + altKm) * cl * co;
  const sy = (n + altKm) * cl * so;
  const sz = (n * (1 - WGS84_E2) + altKm) * sl;
  const out: { az: number; el: number }[] = [];

  for (let g = 0; g < 360; g += ARC_STEP_DEG) {
    const gl = g * D2R;
    const dx = GEO_RADIUS_KM * Math.cos(gl) - sx;
    const dy = GEO_RADIUS_KM * Math.sin(gl) - sy;
    const dz = -sz;
    const east = -so * dx + co * dy;
    const north = -sl * co * dx - sl * so * dy + cl * dz;
    const up = cl * co * dx + cl * so * dy + sl * dz;
    const p = enuToAzEl(east, north, up);

    if (p.el > ARC_MIN_EL_DEG) {
      out.push({ az: p.az, el: p.el });
    }
  }

  return out;
}

/** Protection band of +/- widthDeg around the visible GEO arc. */
export class GeoArcExclusionZone implements ExclusionZone {
  static readonly DEFAULT_WIDTH_DEG = 8;
  static readonly MIN_WIDTH_DEG = 0;
  static readonly MAX_WIDTH_DEG = 30;

  readonly id = 'geo-arc';
  readonly label = 'GEO arc protection band';
  enabled = true;

  private widthDeg_: number = GeoArcExclusionZone.DEFAULT_WIDTH_DEG;
  private readonly arc_: { az: number; el: number }[];
  private readonly arcUnits_: Vec3[];

  constructor(latDeg: number, lonDeg: number, altKm = 0) {
    this.arc_ = visibleGeoArc(latDeg, lonDeg, altKm);
    this.arcUnits_ = this.arc_.map((p) => enuUnit(p.az, p.el));
  }

  get widthDeg(): number {
    return this.widthDeg_;
  }

  setWidthDeg(deg: number): void {
    if (!Number.isFinite(deg)) {
      return;
    }
    this.widthDeg_ = Math.max(GeoArcExclusionZone.MIN_WIDTH_DEG, Math.min(GeoArcExclusionZone.MAX_WIDTH_DEG, deg));
  }

  /** Visible arc points (az/el), for drawing the band. Empty when no GEO satellite is visible. */
  get arc(): readonly { az: number; el: number }[] {
    return this.arc_;
  }

  /** Smallest angular distance from a direction to the visible arc, degrees (Infinity when no arc). */
  distanceToArcDeg(azDeg: number, elDeg: number): number {
    const v = enuUnit(azDeg, elDeg);
    let best = Infinity;

    for (const a of this.arcUnits_) {
      const d = separationDeg(v, a);

      if (d < best) {
        best = d;
      }
    }

    return best;
  }

  contains(azDeg: number, elDeg: number): boolean {
    return this.distanceToArcDeg(azDeg, elDeg) <= this.widthDeg_;
  }
}

/** The zones active on one array. */
export class ExclusionZoneSet {
  private readonly zones_: ExclusionZone[] = [];

  add(zone: ExclusionZone): void {
    this.zones_.push(zone);
  }

  /** Add a zone, replacing any zone with the same id. */
  replace(zone: ExclusionZone): void {
    const i = this.zones_.findIndex((z) => z.id === zone.id);

    if (i >= 0) {
      this.zones_.splice(i, 1);
    }
    this.zones_.push(zone);
  }

  get zones(): readonly ExclusionZone[] {
    return this.zones_;
  }

  get(id: string): ExclusionZone | undefined {
    return this.zones_.find((z) => z.id === id);
  }

  /** True when any ENABLED zone contains the direction. */
  isExcluded(azDeg: number, elDeg: number): boolean {
    return this.zones_.some((z) => z.enabled && z.contains(azDeg, elDeg));
  }
}
