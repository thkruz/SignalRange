import { OrbitalSatellite } from '@app/equipment/satellite/orbital-satellite';
import {
  GeolocationService,
  greatCircleKm,
  llaToEcef,
  type GeolocationMeasurement,
  type AreaOfInterest,
} from '@app/services/geolocation-service';
import type { Degrees, Kilometers, TleLine1, TleLine2 } from 'ootk';
import { describe, expect, it } from 'vitest';

/** Scenario epoch the SENTRY TLEs were authored against: 2027-09-01 06:00 UTC */
const SCENARIO_START_MS = Date.UTC(2027, 8, 1, 6, 0, 0);

const STATION = { lat: 38.82, lon: -104.7, altKm: 1.9 };
/** Hidden emitter ground truth (West Texas) */
const TRUTH = { lat: 31.3, lon: -103.5, altKm: 0.8 };

const AOI: AreaOfInterest = { latMin: 28, latMax: 40, lonMin: -110, lonMax: -98 };

const OBSERVER = { lat: STATION.lat as Degrees, lon: STATION.lon as Degrees, alt: STATION.altKm as Kilometers };

/** SENTRY-7 (victim) - authored inclined-GEO bird at ~100.2W (incl 3.0 deg) */
const SENTRY_7 = new OrbitalSatellite('SENTRY-7', 71001, [], [], {
  tle1: '1 71001U 27200A   27244.25000000  .00000010  00000-0  00000-0 0  9997' as TleLine1,
  tle2: '2 71001   3.0000 288.0000 0001000  90.0000 312.0000  1.00273791123453' as TleLine2,
  observer: OBSERVER,
  isDopplerEnabled: false,
});

/** SENTRY-9 (adjacent collector) - authored inclined-GEO bird at ~98.1W (incl 4.5 deg) */
const SENTRY_9 = new OrbitalSatellite('SENTRY-9', 71002, [], [], {
  tle1: '1 71002U 27200A   27244.25000000  .00000010  00000-0  00000-0 0  9998' as TleLine1,
  tle2: '2 71002   4.5000 198.0000 0001000  90.0000  44.0000  1.00273791123452' as TleLine2,
  observer: OBSERVER,
  isDopplerEnabled: false,
});

const CARRIER_HZ = 6013e6;
const MINUTE_MS = 60 * 1000;

/** Deterministic PRNG so noisy tests are reproducible */
function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

/** Noise-free service (rng unused when synthesizing at sigma 0) */
function cleanService(): GeolocationService {
  return new GeolocationService(SENTRY_7, SENTRY_9, STATION, { rng: () => 0.5 });
}

describe('geolocation math helpers', () => {
  it('llaToEcef places the equatorial prime meridian on the +X axis', () => {
    const ecef = llaToEcef({ lat: 0, lon: 0, altKm: 0 });
    expect(ecef.x).toBeCloseTo(6378.137, 1);
    expect(ecef.y).toBeCloseTo(0, 6);
    expect(ecef.z).toBeCloseTo(0, 6);
  });

  it('greatCircleKm matches a known separation', () => {
    // ~1 deg of latitude is ~111 km
    expect(greatCircleKm({ lat: 30, lon: -100 }, { lat: 31, lon: -100 })).toBeCloseTo(111.2, 0);
  });
});

describe('GeolocationService forward model', () => {
  const service = cleanService();

  it('produces a finite TDOA and FDOA at the truth position', () => {
    const tdoa = service.predictTdoaS(TRUTH, SCENARIO_START_MS);
    const fdoa = service.predictFdoaHz(TRUTH, SCENARIO_START_MS, CARRIER_HZ);
    expect(Number.isFinite(tdoa)).toBe(true);
    expect(Number.isFinite(fdoa)).toBe(true);
    // Magnitudes match the author-tle script's validated geometry
    expect(Math.abs(tdoa)).toBeLessThan(1e-3); // sub-millisecond for a ~2deg GEO pair
    expect(Math.abs(fdoa)).toBeGreaterThan(50); // tens-to-hundreds of Hz FDOA
  });

  it('TDOA varies with candidate position (observable geometry)', () => {
    const atTruth = service.predictTdoaS(TRUTH, SCENARIO_START_MS);
    const shiftedEast = service.predictTdoaS({ lat: TRUTH.lat, lon: TRUTH.lon + 0.5 }, SCENARIO_START_MS);
    expect(Math.abs(shiftedEast - atTruth)).toBeGreaterThan(1e-7);
  });
});

describe('GeolocationService solver', () => {
  function synth(service: GeolocationService, count: number, sigmaTdoa: number, sigmaFdoa: number): GeolocationMeasurement[] {
    const measurements: GeolocationMeasurement[] = [];
    for (let i = 0; i < count; i++) {
      // Spread captures across ~15 min so the inclined-GEO geometry evolves
      const t = SCENARIO_START_MS + i * 15 * MINUTE_MS;
      measurements.push(service.synthesizeMeasurement(TRUTH, t, CARRIER_HZ, sigmaTdoa, sigmaFdoa, i + 1));
    }
    return measurements;
  }

  /** Exact forward-model measurements (no noise) with realistic weighting */
  function exact(service: GeolocationService, count: number): GeolocationMeasurement[] {
    const measurements: GeolocationMeasurement[] = [];
    for (let i = 0; i < count; i++) {
      const t = SCENARIO_START_MS + i * 15 * MINUTE_MS;
      measurements.push({
        id: i + 1,
        timestampMs: t,
        tdoaS: service.predictTdoaS(TRUTH, t),
        fdoaHz: service.predictFdoaHz(TRUTH, t, CARRIER_HZ),
        tdoaSigmaS: 1.5e-6,
        fdoaSigmaHz: 3,
        carrierHz: CARRIER_HZ,
      });
    }
    return measurements;
  }

  it('recovers the truth exactly from noise-free measurements', () => {
    const service = cleanService();
    const fix = service.solve(exact(service, 3), AOI);

    expect(fix).not.toBeNull();
    expect(greatCircleKm({ lat: fix!.lat, lon: fix!.lon }, TRUTH)).toBeLessThan(2);
    expect(fix!.isConverged).toBe(true);
  });

  it('recovers the truth within tolerance under realistic noise', () => {
    const service = new GeolocationService(SENTRY_7, SENTRY_9, STATION, { rng: makeRng(12345) });
    const measurements = synth(service, 5, 1.5e-6, 3);
    const fix = service.solve(measurements, AOI);

    expect(fix).not.toBeNull();
    expect(greatCircleKm({ lat: fix!.lat, lon: fix!.lon }, TRUTH)).toBeLessThan(25);
  });

  it('recovers latitude from time-clustered captures (inclined-GEO geometry)', () => {
    // Worst-case operator behavior: 4 captures ~1 min apart, one duty cycle.
    // A near-equatorial pair would leave latitude ambiguous here; the authored
    // 3.0/4.5 deg inclinations make the N-S fix observable.
    const service = new GeolocationService(SENTRY_7, SENTRY_9, STATION, { rng: makeRng(999) });
    const measurements: GeolocationMeasurement[] = [];
    for (let i = 0; i < 4; i++) {
      const t = SCENARIO_START_MS + i * MINUTE_MS;
      measurements.push(service.synthesizeMeasurement(TRUTH, t, CARRIER_HZ, 1.5e-6, 3, i + 1));
    }
    const fix = service.solve(measurements, AOI);

    expect(fix).not.toBeNull();
    expect(greatCircleKm({ lat: fix!.lat, lon: fix!.lon }, TRUTH)).toBeLessThan(40);
    // Latitude specifically must be constrained (the failure mode we guard)
    expect(Math.abs(fix!.lat - TRUTH.lat) * 111.32).toBeLessThan(40);
  });

  it('produces a tighter error ellipse with more measurements', () => {
    const serviceFew = new GeolocationService(SENTRY_7, SENTRY_9, STATION, { rng: makeRng(7) });
    const serviceMany = new GeolocationService(SENTRY_7, SENTRY_9, STATION, { rng: makeRng(7) });

    const fixFew = serviceFew.solve(synth(serviceFew, 2, 1.5e-6, 3), AOI);
    const fixMany = serviceMany.solve(synth(serviceMany, 8, 1.5e-6, 3), AOI);

    expect(fixFew?.errorEllipse).not.toBeNull();
    expect(fixMany?.errorEllipse).not.toBeNull();
    expect(fixMany!.errorEllipse!.semiMajorKm).toBeLessThan(fixFew!.errorEllipse!.semiMajorKm);
  });

  it('returns null when there are no measurements', () => {
    expect(cleanService().solve([], AOI)).toBeNull();
  });

  it('exposes an LOP residual that crosses zero along the line for the map to trace', () => {
    const service = cleanService();
    const [measurement] = synth(service, 1, 0, 0);

    // The isochrone/isodop passes ~through the truth (the map queries at sea
    // level, so a sub-km offset from the emitter's altitude remains): the
    // residual there is far smaller than well off the line.
    const onLine = Math.abs(service.lopResidual(measurement, 'tdoa', TRUTH.lat, TRUTH.lon));
    const offLine = Math.abs(service.lopResidual(measurement, 'tdoa', TRUTH.lat, TRUTH.lon + 1.5));
    expect(onLine).toBeLessThan(offLine * 0.1);

    // Stepping across the line flips the residual sign (a contour the map can
    // trace). The TDOA gradient is mostly east-west, so step in longitude.
    const east = service.lopResidual(measurement, 'tdoa', TRUTH.lat, TRUTH.lon + 1.5);
    const west = service.lopResidual(measurement, 'tdoa', TRUTH.lat, TRUTH.lon - 1.5);
    expect(Math.sign(east)).not.toBe(Math.sign(west));
  });
});
