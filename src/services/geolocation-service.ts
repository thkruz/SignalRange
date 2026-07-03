/**
 * @file GeolocationService - Two-satellite TDOA/FDOA interference geolocation
 * @description Implements the adjacent-satellite geolocation technique used to
 * locate terrestrial uplink jammers (Campaign 5). The interferer's uplink
 * enters the victim satellite through the antenna main beam and a neighboring
 * satellite through its sidelobes; cross-correlating the two downlinks yields
 * a time-difference (TDOA, isochrone) and frequency-difference (FDOA, isodop)
 * line of position whose intersection localizes the emitter.
 *
 * The service is pure math over the scenario's SGP4-propagated satellites:
 * - forward model: predicted TDOA/FDOA for any candidate ground point,
 * - measurement synthesis: forward model at the hidden truth + Gaussian noise,
 * - solver: weighted grid search + Gauss-Newton refinement with a 95% error
 *   ellipse from the local Jacobian.
 *
 * Both synthesis and solving use the same ECEF forward model, so the solver is
 * exactly consistent with the measurements by construction. New in Campaign 5;
 * nothing in Campaigns 1-4 references this file.
 */

import { OrbitalSatellite } from '@app/equipment/satellite/orbital-satellite';

/** Geodetic ground point (WGS-84 degrees, altitude km above the ellipsoid) */
export interface GeoPoint {
  lat: number;
  lon: number;
  altKm?: number;
}

/** Solver / map extent */
export interface AreaOfInterest {
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
}

/** One captured cross-correlation measurement */
export interface GeolocationMeasurement {
  /** 1-based capture number (display) */
  id: number;
  /** Simulated capture time (integration window midpoint), Unix ms */
  timestampMs: number;
  /** Measured time difference of arrival, seconds */
  tdoaS: number;
  /** Measured frequency difference of arrival, Hz */
  fdoaHz: number;
  /** 1-sigma TDOA measurement noise used for weighting, seconds */
  tdoaSigmaS: number;
  /** 1-sigma FDOA measurement noise used for weighting, Hz */
  fdoaSigmaHz: number;
  /** Carrier frequency the FDOA was scaled by, Hz */
  carrierHz: number;
}

/** 95% confidence error ellipse for a fix */
export interface ErrorEllipse {
  semiMajorKm: number;
  semiMinorKm: number;
  /** Orientation of the semi-major axis, degrees clockwise from north */
  orientationDeg: number;
}

/** Result of a geolocation solve */
export interface GeolocationFix {
  lat: number;
  lon: number;
  /** Weighted RMS of measurement residuals (unitless, ~1 when consistent) */
  residualRms: number;
  /** null when the geometry is too degenerate to invert */
  errorEllipse: ErrorEllipse | null;
  measurementCount: number;
  /** False when the normal matrix was near-singular (poor geometry) */
  isConverged: boolean;
}

interface Ecef {
  x: number;
  y: number;
  z: number;
}

/** Cached satellite geometry for one measurement epoch */
interface EpochGeometry {
  primary: Ecef;
  adjacent: Ecef;
  primaryPlus: Ecef;
  primaryMinus: Ecef;
  adjacentPlus: Ecef;
  adjacentMinus: Ecef;
}

const SPEED_OF_LIGHT_KM_S = 299792.458;
/** WGS-84 semi-major axis, km */
const WGS84_A_KM = 6378.137;
/** WGS-84 first eccentricity squared */
const WGS84_E2 = 6.69437999014e-3;
/** Central-difference half step for FDOA range-rate, seconds */
const FDOA_RATE_HALF_STEP_S = 30;
/** Mean km per degree of latitude */
const KM_PER_DEG_LAT = 111.32;
/** 95% confidence scale for a 2-D Gaussian (sqrt of chi-square 2dof) */
const CONFIDENCE_95_SCALE = 2.4477;

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

/** Geodetic (WGS-84) to ECEF, km */
export function llaToEcef(point: GeoPoint): Ecef {
  const lat = point.lat * DEG2RAD;
  const lon = point.lon * DEG2RAD;
  const alt = point.altKm ?? 0;
  const sinLat = Math.sin(lat);
  const n = WGS84_A_KM / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);

  return {
    x: (n + alt) * Math.cos(lat) * Math.cos(lon),
    y: (n + alt) * Math.cos(lat) * Math.sin(lon),
    z: (n * (1 - WGS84_E2) + alt) * sinLat,
  };
}

/** Great-circle distance between two ground points, km (fix grading) */
export function greatCircleKm(a: GeoPoint, b: GeoPoint): number {
  const lat1 = a.lat * DEG2RAD;
  const lat2 = b.lat * DEG2RAD;
  const dLat = (b.lat - a.lat) * DEG2RAD;
  const dLon = (b.lon - a.lon) * DEG2RAD;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(s)));
}

function distanceKm(a: Ecef, b: Ecef): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;

  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Two-satellite TDOA/FDOA geolocation processor for one primary/adjacent
 * satellite pair observed from one reference ground station.
 */
export class GeolocationService {
  private readonly primary_: OrbitalSatellite;
  private readonly adjacent_: OrbitalSatellite;
  private readonly stationEcef_: Ecef;
  private readonly rng_: () => number;
  /** Satellite ECEF states keyed by measurement epoch (ms) */
  private readonly geometryCache_ = new Map<number, EpochGeometry>();
  /** Spare Gaussian deviate from the last Box-Muller draw */
  private spareGaussian_: number | null = null;

  constructor(
    primary: OrbitalSatellite,
    adjacent: OrbitalSatellite,
    station: GeoPoint,
    options: { rng?: () => number } = {},
  ) {
    this.primary_ = primary;
    this.adjacent_ = adjacent;
    this.stationEcef_ = llaToEcef(station);
    this.rng_ = options.rng ?? Math.random;
  }

  /** Predicted TDOA (s) for a candidate emitter at the measurement epoch */
  predictTdoaS(candidate: GeoPoint, timestampMs: number): number {
    const geometry = this.geometryAt_(timestampMs);

    return this.tdoaFor_(llaToEcef(candidate), geometry.primary, geometry.adjacent);
  }

  /** Predicted FDOA (Hz) for a candidate emitter at the measurement epoch */
  predictFdoaHz(candidate: GeoPoint, timestampMs: number, carrierHz: number): number {
    const geometry = this.geometryAt_(timestampMs);
    const emitterEcef = llaToEcef(candidate);
    const tdoaPlus = this.tdoaFor_(emitterEcef, geometry.primaryPlus, geometry.adjacentPlus);
    const tdoaMinus = this.tdoaFor_(emitterEcef, geometry.primaryMinus, geometry.adjacentMinus);
    const tdoaRate = (tdoaPlus - tdoaMinus) / (2 * FDOA_RATE_HALF_STEP_S);

    return -carrierHz * tdoaRate;
  }

  /**
   * Synthesize a noisy measurement from the hidden truth position. Called by
   * the geolocation console when a capture integrates successfully.
   */
  synthesizeMeasurement(
    truth: GeoPoint,
    timestampMs: number,
    carrierHz: number,
    tdoaSigmaS: number,
    fdoaSigmaHz: number,
    id: number,
  ): GeolocationMeasurement {
    return {
      id,
      timestampMs,
      tdoaS: this.predictTdoaS(truth, timestampMs) + this.gaussian_() * tdoaSigmaS,
      fdoaHz: this.predictFdoaHz(truth, timestampMs, carrierHz) + this.gaussian_() * fdoaSigmaHz,
      tdoaSigmaS,
      fdoaSigmaHz,
      carrierHz,
    };
  }

  /**
   * Weighted least-squares position fix from the collected measurements.
   * Two-stage grid search over the area of interest, then Gauss-Newton
   * refinement. Returns null when there are no measurements.
   */
  solve(measurements: GeolocationMeasurement[], aoi: AreaOfInterest): GeolocationFix | null {
    if (measurements.length === 0) {
      return null;
    }

    // Stage 1: coarse grid over the whole AOI
    const coarse = this.gridMinimum_(measurements, aoi, 48);

    // Stage 2: fine grid around the coarse minimum
    const latPad = (aoi.latMax - aoi.latMin) / 16;
    const lonPad = (aoi.lonMax - aoi.lonMin) / 16;
    const fineAoi: AreaOfInterest = {
      latMin: Math.max(aoi.latMin, coarse.lat - latPad),
      latMax: Math.min(aoi.latMax, coarse.lat + latPad),
      lonMin: Math.max(aoi.lonMin, coarse.lon - lonPad),
      lonMax: Math.min(aoi.lonMax, coarse.lon + lonPad),
    };
    const fine = this.gridMinimum_(measurements, fineAoi, 24);

    // Stage 3: Gauss-Newton refinement in local km coordinates
    let lat = fine.lat;
    let lon = fine.lon;
    let normalMatrix: [number, number, number] | null = null;

    for (let iteration = 0; iteration < 4; iteration++) {
      const step = this.gaussNewtonStep_(measurements, lat, lon);
      if (!step) {
        normalMatrix = null;
        break;
      }
      normalMatrix = step.normal;
      lat += step.dLatDeg;
      lon += step.dLonDeg;
      if (Math.abs(step.dLatDeg) < 1e-5 && Math.abs(step.dLonDeg) < 1e-5) {
        break;
      }
    }

    // Clamp back into the AOI if refinement wandered out
    lat = Math.min(aoi.latMax, Math.max(aoi.latMin, lat));
    lon = Math.min(aoi.lonMax, Math.max(aoi.lonMin, lon));

    const residualRms = Math.sqrt(this.cost_(measurements, lat, lon) / (2 * measurements.length));
    const errorEllipse = normalMatrix ? GeolocationService.ellipseFromNormal_(normalMatrix) : null;

    return {
      lat,
      lon,
      residualRms,
      errorEllipse,
      measurementCount: measurements.length,
      isConverged: errorEllipse !== null,
    };
  }

  /**
   * Residual for one measurement's line of position at a candidate point:
   * zero exactly on the isochrone (TDOA) or isodop (FDOA). The map traces this
   * contour across the current view, so lines span the whole map at any zoom.
   */
  lopResidual(measurement: GeolocationMeasurement, kind: 'tdoa' | 'fdoa', lat: number, lon: number): number {
    const point = { lat, lon };
    if (kind === 'tdoa') {
      return this.predictTdoaS(point, measurement.timestampMs) - measurement.tdoaS;
    }

    return this.predictFdoaHz(point, measurement.timestampMs, measurement.carrierHz) - measurement.fdoaHz;
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private tdoaFor_(emitter: Ecef, primary: Ecef, adjacent: Ecef): number {
    const primaryPathKm = distanceKm(emitter, primary) + distanceKm(primary, this.stationEcef_);
    const adjacentPathKm = distanceKm(emitter, adjacent) + distanceKm(adjacent, this.stationEcef_);

    return (primaryPathKm - adjacentPathKm) / SPEED_OF_LIGHT_KM_S;
  }

  private geometryAt_(timestampMs: number): EpochGeometry {
    const cached = this.geometryCache_.get(timestampMs);
    if (cached) {
      return cached;
    }

    const stepMs = FDOA_RATE_HALF_STEP_S * 1000;
    const geometry: EpochGeometry = {
      primary: GeolocationService.satEcefAt_(this.primary_, timestampMs),
      adjacent: GeolocationService.satEcefAt_(this.adjacent_, timestampMs),
      primaryPlus: GeolocationService.satEcefAt_(this.primary_, timestampMs + stepMs),
      primaryMinus: GeolocationService.satEcefAt_(this.primary_, timestampMs - stepMs),
      adjacentPlus: GeolocationService.satEcefAt_(this.adjacent_, timestampMs + stepMs),
      adjacentMinus: GeolocationService.satEcefAt_(this.adjacent_, timestampMs - stepMs),
    };
    this.geometryCache_.set(timestampMs, geometry);

    return geometry;
  }

  private static satEcefAt_(satellite: OrbitalSatellite, timestampMs: number): Ecef {
    const lla = satellite.ootkSatellite.lla(new Date(timestampMs));

    return llaToEcef({ lat: lla.lat, lon: lla.lon, altKm: lla.alt });
  }

  /**
   * Positive weighting sigma. Scenario configs always pass sigma > 0; this
   * guards a degenerate 0 config against divide-by-zero (NaN cost surface).
   */
  private static safeSigma_(sigma: number, floor: number): number {
    return sigma > 0 ? sigma : floor;
  }

  /** Weighted least-squares cost at a candidate point */
  private cost_(measurements: GeolocationMeasurement[], lat: number, lon: number): number {
    const point = { lat, lon };
    let cost = 0;

    for (const m of measurements) {
      const tSigma = GeolocationService.safeSigma_(m.tdoaSigmaS, 1e-7);
      const fSigma = GeolocationService.safeSigma_(m.fdoaSigmaHz, 1);
      const tdoaResidual = (this.predictTdoaS(point, m.timestampMs) - m.tdoaS) / tSigma;
      const fdoaResidual = (this.predictFdoaHz(point, m.timestampMs, m.carrierHz) - m.fdoaHz) / fSigma;
      cost += tdoaResidual * tdoaResidual + fdoaResidual * fdoaResidual;
    }

    return cost;
  }

  private gridMinimum_(
    measurements: GeolocationMeasurement[],
    aoi: AreaOfInterest,
    gridSize: number,
  ): { lat: number; lon: number } {
    let bestLat = (aoi.latMin + aoi.latMax) / 2;
    let bestLon = (aoi.lonMin + aoi.lonMax) / 2;
    let bestCost = Infinity;

    for (let i = 0; i <= gridSize; i++) {
      const lat = aoi.latMin + (i * (aoi.latMax - aoi.latMin)) / gridSize;
      for (let j = 0; j <= gridSize; j++) {
        const lon = aoi.lonMin + (j * (aoi.lonMax - aoi.lonMin)) / gridSize;
        const cost = this.cost_(measurements, lat, lon);
        if (cost < bestCost) {
          bestCost = cost;
          bestLat = lat;
          bestLon = lon;
        }
      }
    }

    return { lat: bestLat, lon: bestLon };
  }

  /**
   * One Gauss-Newton step in local east/north km coordinates.
   * Returns the step in degrees plus the (upper-triangular) normal matrix
   * [n11, n12, n22] used for the covariance/ellipse, or null when the
   * geometry is too degenerate to invert.
   */
  private gaussNewtonStep_(
    measurements: GeolocationMeasurement[],
    lat: number,
    lon: number,
  ): { dLatDeg: number; dLonDeg: number; normal: [number, number, number] } | null {
    const kmPerDegLon = KM_PER_DEG_LAT * Math.cos(lat * DEG2RAD);
    if (kmPerDegLon < 1) {
      return null; // polar degeneracy - not a supported AOI
    }

    // Numeric Jacobian of weighted residuals wrt (north km, east km)
    const deltaKm = 1;
    const dLat = deltaKm / KM_PER_DEG_LAT;
    const dLon = deltaKm / kmPerDegLon;

    let n11 = 0;
    let n12 = 0;
    let n22 = 0;
    let g1 = 0;
    let g2 = 0;

    for (const m of measurements) {
      const rows: Array<{ predict: (la: number, lo: number) => number; measured: number; sigma: number }> = [
        {
          predict: (la, lo) => this.predictTdoaS({ lat: la, lon: lo }, m.timestampMs),
          measured: m.tdoaS,
          sigma: GeolocationService.safeSigma_(m.tdoaSigmaS, 1e-7),
        },
        {
          predict: (la, lo) => this.predictFdoaHz({ lat: la, lon: lo }, m.timestampMs, m.carrierHz),
          measured: m.fdoaHz,
          sigma: GeolocationService.safeSigma_(m.fdoaSigmaHz, 1),
        },
      ];

      for (const row of rows) {
        const residual = (row.predict(lat, lon) - row.measured) / row.sigma;
        const jNorth = (row.predict(lat + dLat, lon) - row.predict(lat - dLat, lon)) / (2 * deltaKm) / row.sigma;
        const jEast = (row.predict(lat, lon + dLon) - row.predict(lat, lon - dLon)) / (2 * deltaKm) / row.sigma;
        n11 += jNorth * jNorth;
        n12 += jNorth * jEast;
        n22 += jEast * jEast;
        g1 += jNorth * residual;
        g2 += jEast * residual;
      }
    }

    const det = n11 * n22 - n12 * n12;
    if (!Number.isFinite(det) || Math.abs(det) < 1e-12) {
      return null;
    }

    // delta = -inv(N) * g, in km
    const dNorthKm = -(n22 * g1 - n12 * g2) / det;
    const dEastKm = -(n11 * g2 - n12 * g1) / det;

    // Damp huge steps so refinement cannot escape a shallow basin
    const stepNorm = Math.hypot(dNorthKm, dEastKm);
    const scale = stepNorm > 100 ? 100 / stepNorm : 1;

    return {
      dLatDeg: (dNorthKm * scale) / KM_PER_DEG_LAT,
      dLonDeg: (dEastKm * scale) / kmPerDegLon,
      normal: [n11, n12, n22],
    };
  }

  /** 95% error ellipse from the normal matrix (covariance = inverse) */
  private static ellipseFromNormal_(normal: [number, number, number]): ErrorEllipse | null {
    const [n11, n12, n22] = normal;
    const det = n11 * n22 - n12 * n12;
    if (!Number.isFinite(det) || det <= 1e-12) {
      return null;
    }

    // Covariance in km^2, axes (north, east)
    const c11 = n22 / det;
    const c12 = -n12 / det;
    const c22 = n11 / det;

    // Eigen-decomposition of the symmetric 2x2 covariance
    const trace = c11 + c22;
    const diff = c11 - c22;
    const discriminant = Math.sqrt(diff * diff / 4 + c12 * c12);
    const eigenMajor = trace / 2 + discriminant;
    const eigenMinor = trace / 2 - discriminant;
    if (eigenMajor <= 0) {
      return null;
    }

    // Major axis direction in the (north, east) frame -> bearing from north
    const angleRad = Math.atan2(c12, eigenMajor - c22);

    return {
      semiMajorKm: CONFIDENCE_95_SCALE * Math.sqrt(eigenMajor),
      semiMinorKm: CONFIDENCE_95_SCALE * Math.sqrt(Math.max(0, eigenMinor)),
      orientationDeg: ((angleRad * RAD2DEG) % 180 + 180) % 180,
    };
  }

  /** Standard normal deviate (Box-Muller with spare) */
  private gaussian_(): number {
    if (this.spareGaussian_ !== null) {
      const spare = this.spareGaussian_;
      this.spareGaussian_ = null;

      return spare;
    }

    let u = 0;
    let v = 0;
    while (u === 0) {
      u = this.rng_();
    }
    while (v === 0) {
      v = this.rng_();
    }

    const magnitude = Math.sqrt(-2 * Math.log(u));
    this.spareGaussian_ = magnitude * Math.sin(2 * Math.PI * v);

    return magnitude * Math.cos(2 * Math.PI * v);
  }
}
