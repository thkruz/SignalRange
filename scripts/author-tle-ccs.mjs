/**
 * TLE authoring tool for Campaign 4 (Counter Communications) COBALT-4.
 *
 * COBALT-4 was a fixed-geometry `Satellite` with authored az 175 / el 30 from
 * SANDSTORM. Those two angles cannot both be true for a geostationary bird: at
 * 34 deg N, an azimuth of 175 puts the satellite 2.8 deg east of the site's
 * meridian, which is an elevation of ~50 deg, not 30. Giving the target a real
 * ephemeris (so it appears on the world map and ground track like Campaign 5's
 * SENTRY birds) means picking one of the two and letting the other follow.
 * Azimuth is kept; elevation moves to whatever the orbit actually gives.
 *
 * Grid-searches RAAN x mean anomaly for a near-zero-inclination GEO slot that
 * parks the bird at the target longitude at the scenario epoch and holds it
 * there for the length of the scenario - a stationary bird keeps the authored
 * pointing objectives satisfiable at a fixed az/el, which a drifting or
 * inclined one would not.
 *
 * Run from the repo root (node_modules resolution):
 *   node scripts/author-tle-ccs.mjs
 */
import { GroundObject, Satellite } from 'ootk';

// ── Scenario parameters ─────────────────────────────────────────────────────

/** SANDSTORM transportable EA site (Campaign 4, southern California desert) */
const STATION = { lat: 34.0, lon: -118.0, alt: 0.4 };

/** Scenario start: 2027-11-05 02:00:00 UTC -> day 309.0833 of 2027 */
const START_MS = Date.UTC(2027, 10, 5, 2, 0, 0);
const EPOCH_FIELD = '27309.08333333';

/** Length of the scenario window the bird has to stay on station for */
const WINDOW_HOURS = 3;

/** Near-zero-drift geosynchronous mean motion (sidereal day) */
const GEO_MEAN_MOTION = 1.00273791;

/**
 * Slot chosen to preserve the authored azimuth of 175 deg: 2.8 deg east of the
 * site meridian. Elevation follows from the geometry (~50.4 deg).
 */
const BIRD = {
  name: 'COBALT-4',
  noradId: 90042,
  // Not exactly zero - a real GEO bird has some inclination - but small enough
  // that the daily N-S excursion stays far inside the objective's 3 deg
  // pointing tolerance.
  inclination: 0.05,
  targetLonDeg: -115.2,
};

// ── TLE construction (same conventions as scripts/author-tle.mjs) ───────────

function tleChecksum(line) {
  let sum = 0;
  for (const ch of line) {
    if (ch >= '0' && ch <= '9') sum += Number(ch);
    else if (ch === '-') sum += 1;
  }

  return sum % 10;
}

function fmt(value, width, decimals) {
  return value.toFixed(decimals).padStart(width);
}

function buildTle(noradId, inclination, raan, meanAnomaly) {
  const l1Body = `1 ${noradId}U 27300A   ${EPOCH_FIELD}  .00000010  00000-0  00000-0 0  999`;
  const l2Body = `2 ${noradId} ${fmt(inclination, 8, 4)} ${fmt(raan, 8, 4)} 0001000 ${fmt(90, 8, 4)} ${fmt(meanAnomaly, 8, 4)} ${fmt(GEO_MEAN_MOTION, 11, 8)}12345`;

  return {
    tle1: l1Body + tleChecksum(l1Body),
    tle2: l2Body + tleChecksum(l2Body),
  };
}

// ── Grid search ─────────────────────────────────────────────────────────────

const stationGO = new GroundObject({ lat: STATION.lat, lon: STATION.lon, alt: STATION.alt });

function lonAt(sat, ms) {
  try {
    return sat.lla(new Date(ms)).lon;
  } catch {
    return null;
  }
}

let best = null;

for (let raan = 0; raan < 360; raan += 1) {
  for (let ma = 0; ma < 360; ma += 1) {
    const { tle1, tle2 } = buildTle(BIRD.noradId, BIRD.inclination, raan, ma);
    let sat;

    try {
      sat = new Satellite({ tle1, tle2 });
    } catch {
      continue;
    }

    const lonStart = lonAt(sat, START_MS);

    if (lonStart === null) {
      continue;
    }

    let lonErr = Math.abs(lonStart - BIRD.targetLonDeg);

    if (lonErr > 180) {
      lonErr = 360 - lonErr;
    }
    if (lonErr > 1.0) {
      continue;
    }

    // Must hold the slot for the whole scenario, or the authored pointing
    // drifts out of tolerance partway through.
    const lonLater = lonAt(sat, START_MS + WINDOW_HOURS * 3600 * 1000);

    if (lonLater === null || Math.abs(lonLater - lonStart) > 0.2) {
      continue;
    }

    if (!best || lonErr < best.score) {
      best = { score: lonErr, raan, ma, tle1, tle2, sat };
    }
  }
}

if (!best) {
  console.log('NO SOLUTION FOUND - widen the search or relax constraints');
  process.exit(1);
}

const lla = best.sat.lla(new Date(START_MS));
const rae = best.sat.rae(stationGO, new Date(START_MS));

console.log(`=== ${BIRD.name} (${BIRD.noradId}) target ${BIRD.targetLonDeg} deg lon ===`);
console.log(`raan ${best.raan} ma ${best.ma}`);
console.log(`subpoint T+0: lat ${lla.lat.toFixed(2)} lon ${lla.lon.toFixed(2)} alt ${lla.alt.toFixed(0)} km`);
console.log(`from SANDSTORM: az ${rae.az.toFixed(2)} el ${rae.el.toFixed(2)} rng ${rae.rng.toFixed(0)} km`);
console.log(best.tle1);
console.log(best.tle2);

// ── Pointing stability across the scenario window ───────────────────────────

console.log('\n=== pointing over the scenario window ===');
console.log('t(min)   az      el      subLat   subLon');
for (let min = 0; min <= WINDOW_HOURS * 60; min += 15) {
  const at = new Date(START_MS + min * 60 * 1000);
  const r = best.sat.rae(stationGO, at);
  const p = best.sat.lla(at);

  console.log(
    `${String(min).padStart(5)}  ${r.az.toFixed(2).padStart(6)}  ${r.el.toFixed(2).padStart(6)}` +
    `  ${p.lat.toFixed(2).padStart(6)}  ${p.lon.toFixed(2).padStart(7)}`,
  );
}
