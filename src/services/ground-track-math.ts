/**
 * @file ground-track-math - Pure geodetic math for the ground-track map and
 * the contact timeline's lighting lane.
 *
 * DOM-free and EventBus-free by design (like `pass-planner-service`), so the
 * whole layer is unit-testable without a browser. The canvas work lives in
 * `components/geo-map/geo-map.ts`; nothing here knows about pixels.
 *
 * The terminator / antimeridian routines are ported from the KeepTrack
 * Companion app's `src/track/map-math.ts`, which carries its own test suite for
 * the same formulas. The visibility-circle and eclipse helpers are new here:
 * ootk in this project does not export `SatMath`/`SunStatus`, so the shadow test
 * is implemented directly against `Sun.position`.
 */

import type { OrbitalSatellite } from '@app/equipment/satellite/orbital-satellite';
import { Degrees, EpochUTC, Kilometers, Sun } from 'ootk';

const DEG = Math.PI / 180;
/** Mean Earth radius (km) - matches the value ootk uses for its own geodesy. */
const EARTH_RADIUS_KM = 6371;

/** Geodetic point in degrees. */
export interface LonLat {
  lon: number;
  lat: number;
}

/** A time-stamped sub-satellite point. */
export interface GroundPoint extends LonLat {
  /** Unix ms (scenario clock, never wall clock) */
  t: number;
  /** Geodetic altitude in km - drives the visibility-circle radius */
  altKm: number;
}

/** Normalize any longitude to [-180, 180). */
export function normLon(lon: number): number {
  return ((lon + 540) % 360) - 180;
}

/**
 * Subsolar point (the lat/lon where the Sun is at zenith) from the standard
 * low-precision solar ephemeris (NOAA/Meeus truncation, good to ~0.01°) plus
 * GMST. Accurate far beyond what a 1000px-wide terminator can show.
 */
export function subsolarPoint(date: Date): LonLat {
  const n = date.getTime() / 86400000 + 2440587.5 - 2451545.0; // days since J2000

  const meanLon = (280.46 + 0.9856474 * n) % 360;
  const meanAnom = ((357.528 + 0.9856003 * n) % 360) * DEG;
  const eclLon = (meanLon + 1.915 * Math.sin(meanAnom) + 0.02 * Math.sin(2 * meanAnom)) * DEG;
  const obliquity = (23.439 - 0.0000004 * n) * DEG;

  const ra = Math.atan2(Math.cos(obliquity) * Math.sin(eclLon), Math.cos(eclLon)) / DEG;
  const dec = Math.asin(Math.sin(obliquity) * Math.sin(eclLon)) / DEG;
  const gmst = (280.46061837 + 360.98564736629 * n) % 360;

  return { lon: normLon(ra - gmst), lat: dec };
}

/** True when the point is on the night side (sun below the geometric horizon). */
export function isNight(point: LonLat, subsolar: LonLat): boolean {
  const cosC = Math.sin(point.lat * DEG) * Math.sin(subsolar.lat * DEG)
    + Math.cos(point.lat * DEG) * Math.cos(subsolar.lat * DEG) * Math.cos((point.lon - subsolar.lon) * DEG);

  return cosC < 0;
}

/**
 * The night side as a closed polygon in lon/lat space, ready to clip the night
 * basemap with: the terminator curve sampled across all longitudes, closed via
 * whichever pole is in darkness.
 *
 * On the terminator, sin(φ)sin(δ) + cos(φ)cos(δ)cos(H) = 0, so
 * φ = atan(-cos(H)/tan(δ)) with H the hour angle from the subsolar longitude.
 * δ is clamped away from 0 (the equinox instant) where the formula degenerates;
 * the visual error of the clamp is well under a pixel.
 */
export function nightPolygon(subsolar: LonLat, stepDeg = 2): LonLat[] {
  const minDec = subsolar.lat >= 0 ? 0.01 : -0.01;
  const dec = Math.abs(subsolar.lat) < 0.01 ? minDec : subsolar.lat;
  const tanDec = Math.tan(dec * DEG);
  const points: LonLat[] = [];

  for (let lon = -180; lon <= 180; lon += stepDeg) {
    const hourAngle = (lon - subsolar.lon) * DEG;

    points.push({ lon, lat: Math.atan(-Math.cos(hourAngle) / tanDec) / DEG });
  }

  // Close through the dark pole: northern summer (δ>0) puts the antarctic in
  // polar night, and vice versa.
  const darkPoleLat = dec > 0 ? -90 : 90;

  points.push({ lon: 180, lat: darkPoleLat }, { lon: -180, lat: darkPoleLat });

  return points;
}

/**
 * Split a polyline into drawable segments wherever it crosses the antimeridian,
 * inserting interpolated edge points at ±180° so each segment runs cleanly to
 * the map edge instead of streaking back across the world.
 */
export function splitAtAntimeridian<T extends LonLat>(points: T[]): T[][] {
  const segments: T[][] = [];
  let current: T[] = [];

  for (const point of points) {
    if (current.length > 0) {
      const prev = current[current.length - 1];
      const dLon = point.lon - prev.lon;

      if (Math.abs(dLon) > 180) {
        // Unwrap to prev's side to find where the segment hits the edge, then
        // interpolate every other field linearly at that fraction.
        const unwrapped = point.lon - Math.sign(dLon) * 360;
        const span = unwrapped - prev.lon;
        const edge = prev.lon < 0 || (prev.lon === 0 && span < 0) ? -180 : 180;
        const f = Math.abs(span) < 1e-9 ? 0 : (edge - prev.lon) / span;
        const lerped = lerpPoint_(prev, point, f);

        current.push({ ...lerped, lon: edge });
        segments.push(current);
        current = [{ ...lerped, lon: -edge }];
      }
    }
    current.push(point);
  }

  if (current.length > 1 || (current.length === 1 && segments.length === 0)) {
    segments.push(current);
  }

  return segments;
}

/** Linear blend of every numeric field between two points (lon handled by caller). */
function lerpPoint_<T extends LonLat>(a: T, b: T, f: number): T {
  const out = { ...a };

  for (const key of Object.keys(a) as Array<keyof T>) {
    const av = a[key];
    const bv = b[key];

    if (typeof av === 'number' && typeof bv === 'number') {
      out[key] = (av + (bv - av) * f) as T[keyof T];
    }
  }

  return out;
}

/**
 * Interpolate the sub-point at `timeMs` from a ground track (for the live
 * marker between samples). Longitude interpolates on the unwrapped
 * (shortest-path) difference so the marker doesn't teleport at the map edge.
 */
export function interpolateGroundPoint(points: GroundPoint[], timeMs: number): LonLat | null {
  if (points.length === 0) {
    return null;
  }
  if (timeMs <= points[0].t) {
    return { lon: points[0].lon, lat: points[0].lat };
  }

  const last = points[points.length - 1];

  if (timeMs >= last.t) {
    return { lon: last.lon, lat: last.lat };
  }

  for (let i = 1; i < points.length; i++) {
    if (points[i].t >= timeMs) {
      const a = points[i - 1];
      const b = points[i];
      const f = (timeMs - a.t) / (b.t - a.t);
      let dLon = b.lon - a.lon;

      if (dLon > 180) {
        dLon -= 360;
      } else if (dLon < -180) {
        dLon += 360;
      }

      return { lon: normLon(a.lon + dLon * f), lat: a.lat + (b.lat - a.lat) * f };
    }
  }

  return { lon: last.lon, lat: last.lat };
}

/**
 * Sub-satellite track over a time window, propagated through the satellite's
 * own ootk record — the same path `OrbitalSatellite` uses for its live position,
 * so the map can never disagree with the physics.
 */
export function groundTrack(
  satellite: OrbitalSatellite,
  startMs: number,
  endMs: number,
  stepS = 30,
): GroundPoint[] {
  const points: GroundPoint[] = [];
  const stepMs = Math.max(1, stepS) * 1000;

  for (let t = startMs; t <= endMs; t += stepMs) {
    const lla = satellite.ootkSatellite.lla(new Date(t));

    if (lla && Number.isFinite(lla.lat) && Number.isFinite(lla.lon)) {
      points.push({ t, lat: lla.lat, lon: normLon(lla.lon), altKm: lla.alt });
    }
  }

  return points;
}

/**
 * Angular radius (degrees of great-circle arc) of the region on the ground from
 * which a satellite at `altKm` appears at or above `minElevation`.
 *
 * λ = acos( Re/(Re+h) · cos(el) ) − el
 *
 * At el = 0 this is the full geometric horizon circle; raising the mask shrinks
 * it, which is why a 5° mask visibly clips the ends of a pass.
 */
export function visibilityRadiusDeg(altKm: number, minElevation: Degrees = 0 as Degrees): number {
  if (!Number.isFinite(altKm) || altKm <= 0) {
    return 0;
  }

  const el = minElevation * DEG;
  const ratio = (EARTH_RADIUS_KM / (EARTH_RADIUS_KM + altKm)) * Math.cos(el);

  // ratio > 1 would mean the satellite is below the surface; clamp to a point.
  return Math.max(0, (Math.acos(Math.min(1, ratio)) - el) / DEG);
}

/**
 * A visibility circle as a lon/lat ring, walked as a great-circle at constant
 * angular radius from `center`. Returned unsegmented — pass through
 * `splitAtAntimeridian` before drawing.
 */
export function visibilityCircle(center: LonLat, radiusDeg: number, stepDeg = 5): LonLat[] {
  const ring: LonLat[] = [];

  if (radiusDeg <= 0) {
    return ring;
  }

  const lat0 = center.lat * DEG;
  const lon0 = center.lon * DEG;
  const r = Math.min(179.9, radiusDeg) * DEG;
  const sinLat0 = Math.sin(lat0);
  const cosLat0 = Math.cos(lat0);
  const sinR = Math.sin(r);
  const cosR = Math.cos(r);

  for (let bearing = 0; bearing <= 360; bearing += stepDeg) {
    const b = bearing * DEG;
    const lat = Math.asin(sinLat0 * cosR + cosLat0 * sinR * Math.cos(b));
    const lon = lon0 + Math.atan2(
      Math.sin(b) * sinR * cosLat0,
      cosR - sinLat0 * Math.sin(lat),
    );

    ring.push({ lat: lat / DEG, lon: normLon(lon / DEG) });
  }

  return ring;
}

/**
 * Cylindrical-shadow sunlight test: the satellite is eclipsed when it sits on
 * the anti-sun side of Earth *and* its distance from the Earth-Sun axis is less
 * than one Earth radius.
 *
 * This is the umbra-only simplification of KeepTrack's `SatMath.calculateIsInSun`
 * (which additionally separates penumbra). For a lighting lane on a timeline the
 * penumbra is a few seconds of a multi-minute band — below the pixel resolution
 * of the deck, so the extra term would be invisible.
 *
 * Frame note: the satellite vector is TEME (from SGP4) and the Sun vector is
 * ECI. The two differ by precession/nutation — well under a degree — which moves
 * a terminator crossing by a couple of seconds. Irrelevant at deck resolution.
 */
export function isSunlit(eciKm: { x: number; y: number; z: number }, date: Date): boolean {
  const sun = Sun.position(EpochUTC.fromDateTime(date));
  const sunMag = Math.hypot(sun.x, sun.y, sun.z);

  if (!Number.isFinite(sunMag) || sunMag === 0) {
    return true;
  }

  // Component of the satellite vector along the Earth→Sun direction.
  const along = (eciKm.x * sun.x + eciKm.y * sun.y + eciKm.z * sun.z) / sunMag;

  if (along >= 0) {
    return true; // sunward hemisphere - never in shadow
  }

  const satMag2 = eciKm.x ** 2 + eciKm.y ** 2 + eciKm.z ** 2;
  // Perpendicular distance from the Earth-Sun axis.
  const perp = Math.sqrt(Math.max(0, satMag2 - along * along));

  return perp > EARTH_RADIUS_KM;
}

/** A contiguous lighting span for the timeline's lighting lane. */
export interface LightingSpan {
  startMs: number;
  endMs: number;
  isSunlit: boolean;
}

/**
 * Collapse a sampled sunlit/eclipse sequence into contiguous spans. Sampling at
 * `stepS` and merging is far cheaper than root-finding each terminator crossing,
 * and the deck draws at ~1 px per sample anyway.
 */
export function lightingSpans(
  satellite: OrbitalSatellite,
  startMs: number,
  endMs: number,
  stepS = 60,
): LightingSpan[] {
  const spans: LightingSpan[] = [];
  const stepMs = Math.max(1, stepS) * 1000;

  for (let t = startMs; t <= endMs; t += stepMs) {
    const date = new Date(t);
    const eci = satellite.ootkSatellite.eci(date)?.position as
      { x: Kilometers; y: Kilometers; z: Kilometers } | undefined;

    if (!eci) {
      continue;
    }

    const lit = isSunlit(eci, date);
    const last = spans[spans.length - 1];

    if (last?.isSunlit === lit) {
      last.endMs = t;
    } else {
      spans.push({ startMs: t, endMs: t, isSunlit: lit });
    }
  }

  return spans;
}
