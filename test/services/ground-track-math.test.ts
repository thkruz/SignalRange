import { OrbitalSatellite } from '@app/equipment/satellite/orbital-satellite';
import {
  groundTrack,
  interpolateGroundPoint,
  isNight,
  isSunlit,
  lightingSpans,
  nightPolygon,
  normLon,
  splitAtAntimeridian,
  subsolarPoint,
  visibilityCircle,
  visibilityRadiusDeg,
  type GroundPoint,
} from '@app/services/ground-track-math';
import { EpochUTC, Sun, type Degrees, type Kilometers, type TleLine1, type TleLine2 } from 'ootk';
import { describe, expect, it } from 'vitest';

const OBSERVER = { lat: 53.27 as Degrees, lon: -9.05 as Degrees, alt: 0.02 as Kilometers };
const SCENARIO_START_MS = Date.UTC(2027, 2, 15, 14, 0, 0);

/** Same LEO bird the pass-planner suite uses, so both suites share one truth. */
const SAT = new OrbitalSatellite('TEST-LEO-A', 61701, [], [], {
  tle1: '1 61701U 27015A   27074.58333333  .00001000  00000-0  10000-3 0  9996' as TleLine1,
  tle2: '2 61701  97.6000  26.0000 0010000  90.0000 294.0000 14.90000000123451' as TleLine2,
  observer: OBSERVER,
});

describe('normLon', () => {
  it('wraps longitudes into [-180, 180)', () => {
    expect(normLon(0)).toBe(0);
    expect(normLon(190)).toBeCloseTo(-170, 9);
    expect(normLon(-190)).toBeCloseTo(170, 9);
    expect(normLon(540)).toBeCloseTo(-180, 9);
  });
});

describe('subsolarPoint', () => {
  it('puts the sun over the tropic of cancer at the June solstice', () => {
    const { lat } = subsolarPoint(new Date(Date.UTC(2027, 5, 21, 12, 0, 0)));

    expect(lat).toBeGreaterThan(23.0);
    expect(lat).toBeLessThan(23.6);
  });

  it('puts the sun over the tropic of capricorn at the December solstice', () => {
    const { lat } = subsolarPoint(new Date(Date.UTC(2027, 11, 21, 12, 0, 0)));

    expect(lat).toBeLessThan(-23.0);
    expect(lat).toBeGreaterThan(-23.6);
  });

  it('places the subsolar meridian near local noon (Greenwich at 12Z)', () => {
    const { lon } = subsolarPoint(new Date(Date.UTC(2027, 2, 20, 12, 0, 0)));

    // Within a few degrees of 0 - the equation of time is the whole spread.
    expect(Math.abs(lon)).toBeLessThan(5);
  });
});

describe('isNight', () => {
  it('calls the antipode of the subsolar point night and the subpoint day', () => {
    const subsolar = { lat: 0, lon: 0 };

    expect(isNight({ lat: 0, lon: 0 }, subsolar)).toBe(false);
    expect(isNight({ lat: 0, lon: 180 }, subsolar)).toBe(true);
  });
});

describe('nightPolygon', () => {
  it('closes through the dark pole opposite the sun', () => {
    const northernSummer = nightPolygon({ lat: 23.4, lon: 0 });
    const southernSummer = nightPolygon({ lat: -23.4, lon: 0 });

    // Sun north -> antarctic is in polar night, so the polygon closes at -90.
    expect(northernSummer.at(-1)?.lat).toBe(-90);
    expect(southernSummer.at(-1)?.lat).toBe(90);
  });

  it('traces a terminator whose points are all on the night side', () => {
    const subsolar = { lat: 10, lon: 45 };
    const polygon = nightPolygon(subsolar, 10);

    // Terminator points are the boundary; nudging each one away from the sun
    // must land in darkness.
    for (const point of polygon.filter((p) => Math.abs(p.lat) !== 90)) {
      const awayFromSun = { lat: point.lat, lon: normLon(point.lon) };
      const cos = Math.cos(((awayFromSun.lon - subsolar.lon) * Math.PI) / 180);
      const nudged = { lat: point.lat + (cos < 0 ? 0 : -0.5), lon: awayFromSun.lon };

      // A point exactly on the terminator has cosC ~ 0; verify the formula
      // itself is satisfied rather than a strict inequality.
      const cosC = Math.sin((nudged.lat * Math.PI) / 180) * Math.sin((subsolar.lat * Math.PI) / 180)
        + Math.cos((nudged.lat * Math.PI) / 180) * Math.cos((subsolar.lat * Math.PI) / 180) * cos;

      expect(Math.abs(cosC)).toBeLessThan(0.05);
    }
  });
});

describe('splitAtAntimeridian', () => {
  it('leaves a track that never crosses ±180 in one segment', () => {
    const points: GroundPoint[] = [
      { t: 0, lat: 0, lon: -10, altKm: 400 },
      { t: 1, lat: 1, lon: 0, altKm: 400 },
      { t: 2, lat: 2, lon: 10, altKm: 400 },
    ];

    expect(splitAtAntimeridian(points)).toHaveLength(1);
  });

  it('splits an eastward crossing and pins both halves to the edges', () => {
    const points: GroundPoint[] = [
      { t: 0, lat: 0, lon: 170, altKm: 400 },
      { t: 10, lat: 2, lon: -170, altKm: 400 },
    ];
    const segments = splitAtAntimeridian(points);

    expect(segments).toHaveLength(2);
    expect(segments[0].at(-1)?.lon).toBe(180);
    expect(segments[1][0].lon).toBe(-180);
    // The inserted edge point is interpolated, not duplicated: halfway across.
    expect(segments[0].at(-1)?.lat).toBeCloseTo(1, 6);
    expect(segments[0].at(-1)?.t).toBeCloseTo(5, 6);
    // Non-lon numeric fields carry through the split.
    expect(segments[1][0].altKm).toBeCloseTo(400, 6);
  });
});

describe('interpolateGroundPoint', () => {
  const track: GroundPoint[] = [
    { t: 0, lat: 0, lon: 170, altKm: 400 },
    { t: 100, lat: 10, lon: -170, altKm: 400 },
  ];

  it('clamps outside the sampled window', () => {
    expect(interpolateGroundPoint(track, -50)?.lon).toBe(170);
    expect(interpolateGroundPoint(track, 500)?.lon).toBe(-170);
    expect(interpolateGroundPoint([], 0)).toBeNull();
  });

  it('interpolates the short way around the antimeridian', () => {
    const mid = interpolateGroundPoint(track, 50);

    // Short path 170 -> -170 passes through 180, NOT through 0.
    expect(Math.abs(mid?.lon ?? 0)).toBeCloseTo(180, 6);
    expect(mid?.lat).toBeCloseTo(5, 6);
  });
});

describe('visibilityRadiusDeg', () => {
  it('matches the closed-form horizon circle for a 400 km LEO', () => {
    // acos(6371/6771) = 19.83 deg at a 0 deg mask.
    expect(visibilityRadiusDeg(400)).toBeCloseTo(19.83, 1);
  });

  it('shrinks as the elevation mask rises', () => {
    const horizon = visibilityRadiusDeg(400, 0 as Degrees);
    const masked = visibilityRadiusDeg(400, 10 as Degrees);

    expect(masked).toBeLessThan(horizon);
    expect(masked).toBeGreaterThan(0);
  });

  it('is far larger for GEO than for LEO', () => {
    expect(visibilityRadiusDeg(35786)).toBeGreaterThan(80);
  });

  it('returns zero for a non-positive altitude', () => {
    expect(visibilityRadiusDeg(0)).toBe(0);
    expect(visibilityRadiusDeg(Number.NaN)).toBe(0);
  });
});

describe('visibilityCircle', () => {
  it('walks a closed ring at the requested angular radius', () => {
    const center = { lat: 53.27, lon: -9.05 };
    const ring = visibilityCircle(center, 20, 10);

    expect(ring.length).toBeGreaterThan(30);
    // First and last points coincide (0 and 360 degrees of bearing).
    expect(ring[0].lat).toBeCloseTo(ring[ring.length - 1].lat, 6);

    // Every ring point sits 20 deg of great-circle arc from the center.
    const DEG = Math.PI / 180;
    for (const point of ring) {
      const cosC = Math.sin(center.lat * DEG) * Math.sin(point.lat * DEG)
        + Math.cos(center.lat * DEG) * Math.cos(point.lat * DEG) * Math.cos((point.lon - center.lon) * DEG);

      expect(Math.acos(Math.min(1, cosC)) / DEG).toBeCloseTo(20, 4);
    }
  });

  it('returns nothing for a degenerate radius', () => {
    expect(visibilityCircle({ lat: 0, lon: 0 }, 0)).toEqual([]);
  });
});

describe('isSunlit', () => {
  const date = new Date(SCENARIO_START_MS);

  /** Unit vector Earth -> Sun at the test epoch; the shadow axis. */
  const sunDir = (() => {
    const sun = Sun.position(EpochUTC.fromDateTime(date));
    const mag = Math.hypot(sun.x, sun.y, sun.z);

    return { x: sun.x / mag, y: sun.y / mag, z: sun.z / mag };
  })();
  const scale = (v: { x: number; y: number; z: number }, k: number) => ({ x: v.x * k, y: v.y * k, z: v.z * k });

  it('reports sunlight toward the sun and shadow directly behind Earth', () => {
    // 7000 km along the Earth-Sun axis: sunward is lit, anti-sunward sits
    // inside the shadow cylinder (perpendicular distance 0 < 6371 km).
    expect(isSunlit(scale(sunDir, 7000), date)).toBe(true);
    expect(isSunlit(scale(sunDir, -7000), date)).toBe(false);
  });

  it('treats a point far off the Earth-Sun axis as lit even behind Earth', () => {
    // Anti-sunward, but displaced 100000 km perpendicular to the axis - well
    // clear of the 6371 km shadow cylinder.
    const axial = scale(sunDir, -7000);
    // Any vector not parallel to sunDir gives a perpendicular direction.
    const perp = { x: -sunDir.y, y: sunDir.x, z: 0 };
    const perpMag = Math.hypot(perp.x, perp.y, perp.z);
    const offset = scale(perp, 1e5 / perpMag);

    expect(isSunlit({ x: axial.x + offset.x, y: axial.y + offset.y, z: axial.z + offset.z }, date)).toBe(true);
  });
});

describe('groundTrack', () => {
  it('samples the same sub-point path the satellite propagates', () => {
    const endMs = SCENARIO_START_MS + 30 * 60 * 1000;
    const track = groundTrack(SAT, SCENARIO_START_MS, endMs, 60);

    expect(track).toHaveLength(31);
    expect(track[0].t).toBe(SCENARIO_START_MS);

    for (const point of track) {
      expect(point.lat).toBeGreaterThanOrEqual(-90);
      expect(point.lat).toBeLessThanOrEqual(90);
      expect(point.lon).toBeGreaterThanOrEqual(-180);
      expect(point.lon).toBeLessThan(180);
      // ~500 km circular orbit at 14.9 rev/day.
      expect(point.altKm).toBeGreaterThan(200);
      expect(point.altKm).toBeLessThan(1200);
    }
  });

  it('agrees with the satellite live lla at the same instant', () => {
    const track = groundTrack(SAT, SCENARIO_START_MS, SCENARIO_START_MS, 30);
    const direct = SAT.ootkSatellite.lla(new Date(SCENARIO_START_MS));

    expect(track[0].lat).toBeCloseTo(direct.lat, 6);
    expect(track[0].lon).toBeCloseTo(normLon(direct.lon), 6);
  });
});

describe('lightingSpans', () => {
  it('alternates sunlight and eclipse across a full LEO orbit', () => {
    // One orbit at 14.9 rev/day is ~96.6 min; two orbits guarantees a crossing.
    const endMs = SCENARIO_START_MS + 200 * 60 * 1000;
    const spans = lightingSpans(SAT, SCENARIO_START_MS, endMs, 60);

    expect(spans.length).toBeGreaterThan(2);

    // Spans tile the window without gaps or overlaps, and alternate.
    for (let i = 1; i < spans.length; i++) {
      expect(spans[i].isSunlit).toBe(!spans[i - 1].isSunlit);
      expect(spans[i].startMs).toBeGreaterThan(spans[i - 1].endMs - 60_001);
    }

    expect(spans[0].startMs).toBe(SCENARIO_START_MS);
    expect(spans.at(-1)?.endMs).toBeLessThanOrEqual(endMs);

    // A LEO spends a majority of each orbit in sunlight.
    const litMs = spans.filter((s) => s.isSunlit).reduce((sum, s) => sum + (s.endMs - s.startMs), 0);

    expect(litMs).toBeGreaterThan((endMs - SCENARIO_START_MS) * 0.4);
  });
});
