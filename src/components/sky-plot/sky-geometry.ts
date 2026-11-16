/**
 * Pure sky-geometry helpers for SkyPlot (no DOM). Azimuth is degrees clockwise from north,
 * elevation is degrees above the horizon. Vectors are East-North-Up unit vectors.
 */

export interface SkyPoint {
  azDeg: number;
  elDeg: number;
}

export interface SkyPolygon {
  id: string;
  label?: string;
  points: SkyPoint[];
}

export interface PixelPoint {
  x: number;
  y: number;
}

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

type Vec3 = [number, number, number];

export function normalizeAz(azDeg: number): number {
  return ((azDeg % 360) + 360) % 360;
}

/** Map az/el to canvas pixels. North up, r = R(1 - el/90); el is clamped to [0, 90]. */
export function azElToXY(azDeg: number, elDeg: number, cx: number, cy: number, radius: number): PixelPoint {
  const el = Math.max(0, Math.min(90, elDeg));
  const r = radius * (1 - el / 90);
  const az = azDeg * D2R;

  return { x: cx + r * Math.sin(az), y: cy - r * Math.cos(az) };
}

/** Inverse of azElToXY. Returns null outside the horizon circle. */
export function xyToAzEl(x: number, y: number, cx: number, cy: number, radius: number): SkyPoint | null {
  const dx = x - cx;
  const dy = cy - y;
  const r = Math.hypot(dx, dy);

  if (r > radius) return null;

  return { azDeg: normalizeAz(Math.atan2(dx, dy) * R2D), elDeg: 90 * (1 - r / radius) };
}

export function azElToVec(azDeg: number, elDeg: number): Vec3 {
  const az = azDeg * D2R;
  const el = elDeg * D2R;
  const c = Math.cos(el);

  return [c * Math.sin(az), c * Math.cos(az), Math.sin(el)];
}

export function vecToAzEl(v: Vec3): SkyPoint {
  const el = Math.asin(Math.max(-1, Math.min(1, v[2]))) * R2D;

  return { azDeg: normalizeAz(Math.atan2(v[0], v[1]) * R2D), elDeg: el };
}

/** Great-circle angle between two sky directions, degrees. */
export function angularSeparationDeg(az1: number, el1: number, az2: number, el2: number): number {
  const a = azElToVec(az1, el1);
  const b = azElToVec(az2, el2);
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

  return Math.acos(Math.max(-1, Math.min(1, dot))) * R2D;
}

/** Panel normal direction from azimuth and tilt from zenith (0 = facing up). */
export function panelNormalAzEl(panelAzDeg: number, tiltDeg: number): SkyPoint {
  return { azDeg: normalizeAz(panelAzDeg), elDeg: 90 - tiltDeg };
}

/** Angle between a sky direction and a panel normal (az/tilt), degrees. */
export function scanAngleDeg(azDeg: number, elDeg: number, panelAzDeg: number, tiltDeg: number): number {
  const n = panelNormalAzEl(panelAzDeg, tiltDeg);

  return angularSeparationDeg(azDeg, elDeg, n.azDeg, n.elDeg);
}

/** True when the direction lies within maxScanDeg of the panel normal (and above the horizon). */
export function isWithinScan(azDeg: number, elDeg: number, panelAzDeg: number, tiltDeg: number, maxScanDeg: number): boolean {
  return elDeg >= 0 && scanAngleDeg(azDeg, elDeg, panelAzDeg, tiltDeg) <= maxScanDeg;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function norm(v: Vec3): Vec3 {
  const m = Math.hypot(v[0], v[1], v[2]) || 1;

  return [v[0] / m, v[1] / m, v[2] / m];
}

/**
 * Small circle of angular radius radiusDeg around a sky direction, as az/el points
 * (closed implicitly). Points below the horizon are clamped to el = 0.
 */
export function smallCircle(centerAz: number, centerEl: number, radiusDeg: number, segments = 72): SkyPoint[] {
  const n = azElToVec(centerAz, centerEl);
  // Basis perpendicular to n: pick the axis least aligned with n
  const ref: Vec3 = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0];
  const u = norm(cross(n, ref));
  const v = cross(n, u);
  const th = radiusDeg * D2R;
  const ct = Math.cos(th);
  const st = Math.sin(th);
  const out: SkyPoint[] = [];

  for (let i = 0; i < segments; i++) {
    const b = (i / segments) * 2 * Math.PI;
    const cb = Math.cos(b);
    const sb = Math.sin(b);
    const p: Vec3 = [n[0] * ct + (u[0] * cb + v[0] * sb) * st, n[1] * ct + (u[1] * cb + v[1] * sb) * st, n[2] * ct + (u[2] * cb + v[2] * sb) * st];
    const pt = vecToAzEl(p);

    out.push({ azDeg: pt.azDeg, elDeg: Math.max(0, pt.elDeg) });
  }

  return out;
}

/** Outline of the reachable scan cone for a (possibly tilted) panel. */
export function scanLimitOutline(panelAzDeg: number, tiltDeg: number, maxScanDeg: number, segments = 72): SkyPoint[] {
  const n = panelNormalAzEl(panelAzDeg, tiltDeg);

  return smallCircle(n.azDeg, n.elDeg, maxScanDeg, segments);
}

// ---- GEO arc ----

const EARTH_RADIUS_KM = 6378.137;
const GEO_RADIUS_KM = 42164.17;

/** Look angle from a station to a geostationary satellite at subsatellite longitude (spherical Earth). */
export function geoLookAngle(stationLatDeg: number, stationLonDeg: number, satLonDeg: number): SkyPoint {
  const lat = stationLatDeg * D2R;
  const lon = stationLonDeg * D2R;
  const sl = satLonDeg * D2R;
  const dx = GEO_RADIUS_KM * Math.cos(sl) - EARTH_RADIUS_KM * Math.cos(lat) * Math.cos(lon);
  const dy = GEO_RADIUS_KM * Math.sin(sl) - EARTH_RADIUS_KM * Math.cos(lat) * Math.sin(lon);
  const dz = -EARTH_RADIUS_KM * Math.sin(lat);
  const e = -Math.sin(lon) * dx + Math.cos(lon) * dy;
  const n = -Math.sin(lat) * Math.cos(lon) * dx - Math.sin(lat) * Math.sin(lon) * dy + Math.cos(lat) * dz;
  const u = Math.cos(lat) * Math.cos(lon) * dx + Math.cos(lat) * Math.sin(lon) * dy + Math.sin(lat) * dz;

  return { azDeg: normalizeAz(Math.atan2(e, n) * R2D), elDeg: Math.atan2(u, Math.hypot(e, n)) * R2D };
}

/**
 * Visible GEO arc for a station as az/el points ordered west to east, sampled every stepDeg
 * of satellite longitude. Points with el < minElDeg are dropped.
 */
export function geoArcPoints(stationLatDeg: number, stationLonDeg: number, stepDeg = 1, minElDeg = 0): SkyPoint[] {
  const out: SkyPoint[] = [];

  for (let d = -90; d <= 90 + 1e-9; d += stepDeg) {
    const p = geoLookAngle(stationLatDeg, stationLonDeg, stationLonDeg + d);

    if (p.elDeg >= minElDeg) out.push(p);
  }

  return out;
}

/**
 * Exclusion band of +/- halfWidthDeg (angular distance on the sky) around the visible GEO arc.
 * Returned as one closed polygon; the part below the horizon is clamped to el = 0.
 * Returns null if no GEO arc is visible (polar stations).
 */
export function geoArcBand(stationLatDeg: number, stationLonDeg: number, halfWidthDeg: number, id = 'geo-belt', label = 'GEO protection band'): SkyPolygon | null {
  const arc = geoArcPoints(stationLatDeg, stationLonDeg, 1, -halfWidthDeg);

  if (arc.length < 2) return null;

  const vecs = arc.map((p) => azElToVec(p.azDeg, p.elDeg));
  const th = halfWidthDeg * D2R;
  const left: SkyPoint[] = [];
  const right: SkyPoint[] = [];

  for (let i = 0; i < vecs.length; i++) {
    const a = vecs[Math.max(0, i - 1)];
    const b = vecs[Math.min(vecs.length - 1, i + 1)];
    const t: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const p = norm(cross(vecs[i], t));
    const mk = (s: number): SkyPoint => {
      const v: Vec3 = [
        vecs[i][0] * Math.cos(th) + s * p[0] * Math.sin(th),
        vecs[i][1] * Math.cos(th) + s * p[1] * Math.sin(th),
        vecs[i][2] * Math.cos(th) + s * p[2] * Math.sin(th),
      ];
      const pt = vecToAzEl(v);

      return { azDeg: pt.azDeg, elDeg: Math.max(0, pt.elDeg) };
    };

    left.push(mk(1));
    right.push(mk(-1));
  }

  return { id, label, points: [...left, ...right.reverse()] };
}

// ---- Hit testing ----

/**
 * Index of the nearest dot within tolPx + its pad of (x, y), or -1.
 * Positions are parallel arrays for speed; pads are the per-dot radius added to the tolerance.
 */
export function nearestWithin(xs: ArrayLike<number>, ys: ArrayLike<number>, pads: ArrayLike<number>, count: number, x: number, y: number, tolPx: number): number {
  let best = -1;
  let bestD2 = Infinity;

  for (let i = 0; i < count; i++) {
    const dx = xs[i] - x;
    const dy = ys[i] - y;
    const d2 = dx * dx + dy * dy;
    const lim = tolPx + pads[i];

    if (d2 <= lim * lim && d2 < bestD2) {
      best = i;
      bestD2 = d2;
    }
  }

  return best;
}
