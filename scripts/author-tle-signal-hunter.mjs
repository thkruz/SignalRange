/**
 * TLE authoring tool for Campaign 5 (Signal Hunter) GEO satellites.
 *
 * Grid-searches RAAN x mean-anomaly so each SENTRY bird sits at its target
 * GEO longitude slot at the scenario start epoch, validating with the same
 * ootk SGP4/SDP4 propagation the app uses (see scripts/author-tle.mjs and
 * retrospectives/phase-1-campaign2-orbital-foundations-retro.md).
 *
 * Also prototypes the two-satellite TDOA/FDOA forward model against a
 * candidate emitter site so the geolocation geometry is validated BEFORE
 * the GeolocationService is written: prints TDOA/FDOA magnitudes and their
 * variation across the scenario window (FDOA variation is what makes
 * successive captures rotate the line of position).
 *
 * Run from the repo root (node_modules resolution):
 *   node scripts/author-tle-signal-hunter.mjs
 */
import { GroundObject, Satellite } from 'ootk';

// ── Scenario parameters ─────────────────────────────────────────────────────

// Peterson Annex ground station, Colorado plains (Campaign 5 signal-hunter)
const STATION = { lat: 38.82, lon: -104.70, alt: 1.9 };

// Candidate hostile emitter site, West Texas (sandbox ground truth)
const EMITTER = { lat: 31.30, lon: -103.50, alt: 0.8 };

// Scenario start: 2027-09-01 06:00:00 UTC → epoch day 244.25 of 2027
const START_MS = Date.UTC(2027, 8, 1, 6, 0, 0);
const EPOCH_FIELD = '27244.25000000';

/** Near-zero-drift geosynchronous mean motion (sidereal day) */
const GEO_MEAN_MOTION = 1.00273791;

const BIRDS = [
  {
    name: 'SENTRY-7', // victim satellite (jammed transponder)
    noradId: 71001,
    // 3-4.5 deg inclination gives the birds enough N-S velocity that the FDOA
    // gradient rotates off the TDOA gradient - making the emitter LATITUDE
    // observable from time-clustered captures (0.7 deg left it near-ambiguous).
    inclination: 3.0,
    targetLonDeg: -101.0,
  },
  {
    name: 'SENTRY-9', // adjacent satellite (sidelobe collector)
    noradId: 71002,
    inclination: 4.5,
    targetLonDeg: -98.0,
  },
];

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
  const l1Body = `1 ${noradId}U 27200A   ${EPOCH_FIELD}  .00000010  00000-0  00000-0 0  999`;
  const l2Body = `2 ${noradId} ${fmt(inclination, 8, 4)} ${fmt(raan, 8, 4)} 0001000 ${fmt(90, 8, 4)} ${fmt(meanAnomaly, 8, 4)} ${fmt(GEO_MEAN_MOTION, 11, 8)}12345`;
  return {
    tle1: l1Body + tleChecksum(l1Body),
    tle2: l2Body + tleChecksum(l2Body),
  };
}

// ── Geometry helpers ────────────────────────────────────────────────────────

const stationGO = new GroundObject({ lat: STATION.lat, lon: STATION.lon, alt: STATION.alt });
const emitterGO = new GroundObject({ lat: EMITTER.lat, lon: EMITTER.lon, alt: EMITTER.alt });

function lonAt(sat, ms) {
  try {
    return sat.lla(new Date(ms)).lon;
  } catch {
    return null;
  }
}

function rng(groundObject, sat, ms) {
  return sat.rae(groundObject, new Date(ms)).rng;
}

/** Path length emitter → sat → station, km */
function pathKm(sat, ms) {
  return rng(emitterGO, sat, ms) + rng(stationGO, sat, ms);
}

const C_KM_S = 299792.458;

/** TDOA between the two sat paths, seconds */
function tdoaS(satA, satB, ms) {
  return (pathKm(satA, ms) - pathKm(satB, ms)) / C_KM_S;
}

/** FDOA between the two sat paths at carrier freq, Hz (central difference) */
function fdoaHz(satA, satB, ms, freqHz) {
  const dtS = 30;
  const rateKmS = (tdoaS(satA, satB, ms + dtS * 1000) - tdoaS(satA, satB, ms - dtS * 1000)) / (2 * dtS);
  return -freqHz * rateKmS; // d(tdoa)/dt in s/s; f * rate = Hz
}

// ── Grid search: park each bird at its longitude slot ───────────────────────

const solved = [];

for (const bird of BIRDS) {
  let best = null;

  for (let raan = 0; raan < 360; raan += 2) {
    for (let ma = 0; ma < 360; ma += 2) {
      const { tle1, tle2 } = buildTle(bird.noradId, bird.inclination, raan, ma);
      let sat;
      try {
        sat = new Satellite({ tle1, tle2 });
      } catch {
        continue;
      }

      const lonStart = lonAt(sat, START_MS);
      if (lonStart === null) continue;

      let lonErr = Math.abs(lonStart - bird.targetLonDeg);
      if (lonErr > 180) lonErr = 360 - lonErr;
      if (lonErr > 1.5) continue;

      // Stay on station across a 3-hour scenario window
      const lonLater = lonAt(sat, START_MS + 3 * 3600 * 1000);
      if (lonLater === null || Math.abs(lonLater - lonStart) > 0.5) continue;

      const rae = sat.rae(stationGO, new Date(START_MS));
      if (rae.el < 35) continue;

      if (!best || lonErr < best.score) {
        best = { score: lonErr, raan, ma, tle1, tle2, sat, rae, lonStart };
      }
    }
  }

  console.log(`\n=== ${bird.name} (${bird.noradId}) target ${bird.targetLonDeg} deg lon ===`);
  if (!best) {
    console.log('NO SOLUTION FOUND — widen the search or relax constraints');
  } else {
    const lla = best.sat.lla(new Date(START_MS));
    console.log(`subpoint T+0: lat ${lla.lat.toFixed(2)} lon ${lla.lon.toFixed(2)} alt ${lla.alt.toFixed(0)} km`);
    console.log(`from station: az ${best.rae.az.toFixed(1)} el ${best.rae.el.toFixed(1)} rng ${best.rae.rng.toFixed(0)} km`);
    const llaLater = best.sat.lla(new Date(START_MS + 3 * 3600 * 1000));
    console.log(`subpoint T+3h: lat ${llaLater.lat.toFixed(2)} lon ${llaLater.lon.toFixed(2)} (drift check)`);
    console.log(best.tle1);
    console.log(best.tle2);
    solved.push({ ...bird, sat: best.sat });
  }
}

// ── TDOA/FDOA observability check ───────────────────────────────────────────

if (solved.length === 2) {
  const [s7, s9] = solved.map((b) => b.sat);
  const F_UPLINK_HZ = 6013e6; // jammer uplink carrier

  console.log('\n=== TDOA/FDOA forward model at the emitter site ===');
  console.log('t(min)  TDOA(us)   FDOA(Hz)');
  for (let min = 0; min <= 120; min += 15) {
    const ms = START_MS + min * 60 * 1000;
    const t = tdoaS(s7, s9, ms) * 1e6;
    const f = fdoaHz(s7, s9, ms, F_UPLINK_HZ);
    console.log(`${String(min).padStart(5)}  ${t.toFixed(2).padStart(9)}  ${f.toFixed(2).padStart(9)}`);
  }

  // Position sensitivity: how much does TDOA/FDOA move 50 km from the truth?
  const north = new GroundObject({ lat: EMITTER.lat + 0.45, lon: EMITTER.lon, alt: EMITTER.alt });
  const east = new GroundObject({ lat: EMITTER.lat, lon: EMITTER.lon + 0.53, alt: EMITTER.alt });
  const tdoaAt = (go, ms) =>
    (rng(go, s7, ms) + rng(stationGO, s7, ms) - rng(go, s9, ms) - rng(stationGO, s9, ms)) / C_KM_S;
  const ms0 = START_MS + 30 * 60 * 1000;
  const dT_north = (tdoaAt(north, ms0) - tdoaAt(emitterGO, ms0)) * 1e6;
  const dT_east = (tdoaAt(east, ms0) - tdoaAt(emitterGO, ms0)) * 1e6;
  console.log(`\nTDOA sensitivity ~50 km: north ${dT_north.toFixed(2)} us, east ${dT_east.toFixed(2)} us`);
  console.log('(compare against a 1-2 us measurement sigma for expected fix error)');
}
