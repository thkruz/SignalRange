/**
 * Geostationary look angles and polarization skew (phase 19.4).
 *
 * Legacy GEO satellites carry authored az/el, written for one station. A
 * satellite that names that reference station (`SatelliteState.lookAnglesFrom`)
 * gets a slot longitude derived from its authored azimuth there, and every
 * other station then sees it at the authored angles shifted by the geometric
 * difference between the two sites. The reference station keeps the authored
 * numbers exactly, so content written against them still holds; a second site
 * 150 km away no longer sees the same az/el (nats-s03-F2). Full GEO-by-longitude
 * (authored slots, real slant range) is Phase 20.2.
 */

/** WGS-84 equatorial radius, km */
const WGS84_A_KM = 6378.137;
/** WGS-84 first eccentricity squared */
const WGS84_E2 = 0.00669437999014;
/** Geostationary orbit radius, km */
export const GEO_RADIUS_KM = 42164.17;

const D2R = Math.PI / 180;

/** A station on the WGS-84 ellipsoid */
export interface GeoSite {
  latitude: number;
  longitude: number;
  /** Height above the ellipsoid, m (default 0) */
  elevationM?: number;
}

export interface GeoLookAngles {
  /** Azimuth, degrees true, 0-360 */
  az: number;
  /** Elevation, degrees */
  el: number;
  /** Slant range, km */
  rangeKm: number;
}

/** Topocentric az/el/range of a GEO slot (longitude, degrees east) from a site */
export function geoLookAngles(site: GeoSite, satLongitudeDeg: number): GeoLookAngles {
  const lat = site.latitude * D2R;
  const lon = site.longitude * D2R;
  const hKm = (site.elevationM ?? 0) / 1000;
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const n = WGS84_A_KM / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);

  const ox = (n + hKm) * cosLat * Math.cos(lon);
  const oy = (n + hKm) * cosLat * Math.sin(lon);
  const oz = (n * (1 - WGS84_E2) + hKm) * sinLat;

  const satLon = satLongitudeDeg * D2R;
  const dx = GEO_RADIUS_KM * Math.cos(satLon) - ox;
  const dy = GEO_RADIUS_KM * Math.sin(satLon) - oy;
  const dz = -oz;

  const east = -Math.sin(lon) * dx + Math.cos(lon) * dy;
  const north = -sinLat * Math.cos(lon) * dx - sinLat * Math.sin(lon) * dy + cosLat * dz;
  const up = cosLat * Math.cos(lon) * dx + cosLat * Math.sin(lon) * dy + sinLat * dz;
  const rangeKm = Math.sqrt(dx * dx + dy * dy + dz * dz);

  return {
    az: (((Math.atan2(east, north) / D2R) % 360) + 360) % 360,
    el: Math.asin(up / rangeKm) / D2R,
    rangeKm,
  };
}

/** Signed azimuth difference a - b folded into (-180, 180] */
function azDiff(a: number, b: number): number {
  const d = (((a - b) % 360) + 360) % 360;
  return d > 180 ? d - 360 : d;
}

/**
 * Slot longitude (degrees east) of the GEO satellite a site sees at azimuth
 * `azDeg`. Only the azimuth is used: authored legacy elevations are not always
 * consistent with a real arc, and the azimuth is what fixes the slot.
 * Searches the visible arc (site longitude +/- 81 deg) by bisection.
 */
export function geoLongitudeFromAzimuth(site: GeoSite, azDeg: number): number {
  // Northern sites see the arc sweep east -> south -> west as the slot moves
  // west, so azimuth is monotonic in slot longitude across the visible arc.
  const f = (dLon: number) => azDiff(geoLookAngles(site, site.longitude + dLon).az, azDeg);
  let lo = -81;
  let hi = 81;
  let fLo = f(lo);
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const fMid = f(mid);
    if (Math.sign(fMid) === Math.sign(fLo)) {
      lo = mid;
      fLo = fMid;
    } else {
      hi = mid;
    }
  }
  return site.longitude + (lo + hi) / 2;
}

/**
 * Polarization skew (degrees) of a linearly polarized GEO downlink at a site:
 * the angle the feed must rotate from local horizontal to match the
 * satellite's horizontal, atan(sin(dLon) / tan(lat)) with dLon = slot - site.
 * Sign follows the C1 authored values: from a northern site a slot to the
 * east is positive (TIDEMARK-1 from Vermont, +14) and one to the west negative
 * (TIDEMARK-2, -25).
 */
export function geoPolarizationSkewDeg(site: GeoSite, satLongitudeDeg: number): number {
  const dLon = (satLongitudeDeg - site.longitude) * D2R;
  const lat = site.latitude * D2R;
  return Math.atan2(Math.sin(dLon), Math.tan(lat)) / D2R;
}

/** Mean Earth radius for the spherical slant-range formula, km */
const EARTH_MEAN_RADIUS_KM = 6371;

/**
 * Slant range to a geostationary satellite seen at elevation `elDeg`, km
 * (spherical Earth, phase 19.3): d = √(r_geo² − (R cos el)²) − R sin el.
 * 35,786 km at zenith, ~41,670 km on the horizon. Replaces the fixed
 * 38,000 km a legacy GEO satellite (authored az/el) used for path loss.
 */
export function geoSlantRangeKm(elDeg: number): number {
  return slantRangeKmAt(elDeg, GEO_RADIUS_KM);
}

/** Slant range to a satellite at orbit radius `orbitRadiusKm` seen at elevation `elDeg`, km (spherical Earth) */
export function slantRangeKmAt(elDeg: number, orbitRadiusKm: number): number {
  const el = Math.max(0, elDeg) * D2R;
  const rCos = EARTH_MEAN_RADIUS_KM * Math.cos(el);

  return Math.sqrt(Math.max(0, orbitRadiusKm * orbitRadiusKm - rCos * rCos)) - EARTH_MEAN_RADIUS_KM * Math.sin(el);
}
