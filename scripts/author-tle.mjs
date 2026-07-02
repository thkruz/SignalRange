/**
 * TLE authoring tool for scenario satellites.
 *
 * Grid-searches RAAN x mean-anomaly so a pass lands at the desired time after
 * the scenario start epoch, validating with the same ootk SGP4 propagation the
 * app uses (see retrospectives/phase-1-campaign2-orbital-foundations-retro.md).
 *
 * Run from the repo root (node_modules resolution):
 *   node scripts/author-tle.mjs
 *
 * Edit OBSERVER / EPOCH / BIRDS below for the scenario being authored, then
 * paste the printed TLEs into the campaign's satellites.ts and the printed
 * pass numbers into its unit test.
 */
import { GroundObject, Satellite } from 'ootk';

// ── Scenario parameters ─────────────────────────────────────────────────────

// Riley's backyard, Burlington VT (Campaign 3 ham-sdr sandbox)
const OBSERVER = new GroundObject({ lat: 44.48, lon: -73.21, alt: 0.05 });

// Scenario start: 2027-06-19 16:00:00 UTC → epoch day 170.66666667 of 2027
const START_MS = Date.UTC(2027, 5, 19, 16, 0, 0);
const EPOCH_FIELD = '27170.66666667';

const BIRDS = [
  {
    name: 'WXSAT-19',
    noradId: 63001,
    inclination: 98.7,   // sun-synchronous weather sat (~850 km)
    meanMotion: 14.19,
    targetAosMin: 3.0,   // first AOS ~T+3 min
    minMaxEl: 55,        // want a good overhead pass for the QFH
  },
  {
    name: 'CUBEHOP-1',
    noradId: 63002,
    inclination: 97.5,   // cubesat rideshare LEO (~600 km)
    meanMotion: 14.9,
    targetAosMin: 18.0,  // second act: yagi pass ~T+18 min
    minMaxEl: 45,
  },
  {
    name: 'NAVSTAR-77',
    noradId: 63003,
    inclination: 55.0,   // GPS Block III, MEO half-sync orbit
    meanMotion: 2.00565,
    targetAosMin: null,  // no AOS target: want it already high at T+0
    minElAtStart: 45,
  },
];

// ── TLE construction ────────────────────────────────────────────────────────

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

function buildTle(noradId, inclination, raan, meanAnomaly, meanMotion) {
  const l1Body = `1 ${noradId}U 27042A   ${EPOCH_FIELD}  .00001000  00000-0  10000-3 0  999`;
  const l2Body = `2 ${noradId} ${fmt(inclination, 8, 4)} ${fmt(raan, 8, 4)} 0010000 ${fmt(90, 8, 4)} ${fmt(meanAnomaly, 8, 4)} ${fmt(meanMotion, 11, 8)}12345`;
  return {
    tle1: l1Body + tleChecksum(l1Body),
    tle2: l2Body + tleChecksum(l2Body),
  };
}

// ── Pass evaluation ─────────────────────────────────────────────────────────

function elevationAt(sat, ms) {
  try {
    return sat.rae(OBSERVER, new Date(ms)).el;
  } catch {
    return -90;
  }
}

/** First pass within horizonMin minutes: AOS/LOS/maxEl (30 s coarse, 1 s refine) */
function firstPass(sat, horizonMin) {
  const stepMs = 30_000;
  let prevEl = elevationAt(sat, START_MS);
  let aosMs = null;

  for (let ms = START_MS + stepMs; ms <= START_MS + horizonMin * 60_000; ms += stepMs) {
    const el = elevationAt(sat, ms);
    if (prevEl < 0 && el >= 0) {
      // refine AOS to 1 s
      let lo = ms - stepMs, hi = ms;
      while (hi - lo > 1000) {
        const mid = (lo + hi) / 2;
        if (elevationAt(sat, mid) >= 0) hi = mid; else lo = mid;
      }
      aosMs = hi;
    }
    if (aosMs !== null && prevEl >= 0 && el < 0) {
      // refine LOS, then find max el over the pass
      let lo = ms - stepMs, hi = ms;
      while (hi - lo > 1000) {
        const mid = (lo + hi) / 2;
        if (elevationAt(sat, mid) >= 0) lo = mid; else hi = mid;
      }
      const losMs = lo;
      let maxEl = -90, maxElMs = aosMs;
      for (let t = aosMs; t <= losMs; t += 5000) {
        const e = elevationAt(sat, t);
        if (e > maxEl) { maxEl = e; maxElMs = t; }
      }
      return { aosMs, losMs, maxEl, maxElMs };
    }
    prevEl = el;
  }
  return null;
}

// ── Grid search ─────────────────────────────────────────────────────────────

for (const bird of BIRDS) {
  let best = null;

  for (let raan = 0; raan < 360; raan += 2) {
    for (let ma = 0; ma < 360; ma += 2) {
      const { tle1, tle2 } = buildTle(bird.noradId, bird.inclination, raan, ma, bird.meanMotion);
      let sat;
      try {
        sat = new Satellite({ tle1, tle2 });
      } catch {
        continue;
      }

      if (bird.targetAosMin === null) {
        // MEO: want high elevation at scenario start, still visible an hour in
        const elStart = elevationAt(sat, START_MS);
        const elLater = elevationAt(sat, START_MS + 60 * 60_000);
        if (elStart < bird.minElAtStart || elLater < 10) continue;
        const score = -elStart; // maximize start elevation
        if (!best || score < best.score) {
          best = { score, raan, ma, tle1, tle2, note: `el ${elStart.toFixed(1)} deg at T+0, ${elLater.toFixed(1)} deg at T+60m` };
        }
      } else {
        const pass = firstPass(sat, 40);
        if (!pass || pass.maxEl < bird.minMaxEl) continue;
        const aosMin = (pass.aosMs - START_MS) / 60_000;
        const score = Math.abs(aosMin - bird.targetAosMin);
        if (score > 1.5) continue;
        if (!best || score < best.score) {
          best = {
            score, raan, ma, tle1, tle2,
            note: `AOS T+${aosMin.toFixed(1)}m, max el ${pass.maxEl.toFixed(1)} deg at T+${((pass.maxElMs - START_MS) / 60_000).toFixed(1)}m, LOS T+${((pass.losMs - START_MS) / 60_000).toFixed(1)}m`,
          };
        }
      }
    }
  }

  console.log(`\n=== ${bird.name} (${bird.noradId}) ===`);
  if (!best) {
    console.log('NO SOLUTION FOUND — widen the search or relax constraints');
  } else {
    console.log(best.note);
    console.log(best.tle1);
    console.log(best.tle2);
  }
}
