/**
 * Batch LEO pass-window authoring tool for campaign scenarios (nats-eu Campaign 2+).
 *
 * Extends scripts/author-tle.mjs from "one bird, one AOS target" to batch
 * authoring: give it a scenario epoch, one or more ground stations, and a list
 * of requested passes ("AOS at T+X min over station Y peaking at Z deg") and it
 * grid-searches TLE parameters (inclination x mean motion x RAAN x mean
 * anomaly) until each request is met, validating with the same ootk SGP4
 * propagation the app uses (see src/services/pass-planner-service.ts). The
 * output is self-verifying: every emitted TLE is re-propagated and printed as
 * a pass table (AOS / max-el / LOS plus follow-up passes in the next 2 h).
 *
 * Run from the repo root (node_modules resolution):
 *   node scripts/author-passes.mjs                 # built-in DEMO_CONFIG below
 *   node scripts/author-passes.mjs my-config.json  # external JSON config
 *
 * Config shape (JSON file mirrors DEMO_CONFIG):
 * {
 *   "epoch": "2027-03-15T14:00:00Z",     // scenario start (UTC) = TLE epoch
 *   "cosparId": "27015A",                // optional intl designator (default <yy>001A)
 *   "stations": {
 *     "galway":   { "lat": 53.27, "lon": -9.05,  "alt": 0.02 },
 *     "atlantic": { "lat": 53.00, "lon": -33.30, "alt": 0.0  }
 *   },
 *   "passes": [
 *     {
 *       "name": "MERIDIAN-SAR-3",     // display name
 *       "noradId": 61703,
 *       "station": "galway",          // key into stations (optional if only one)
 *       "aosOffsetMin": 2.0,          // AOS at epoch + N min (hard tol +/-0.5 min)
 *       "maxElDeg": 88,               // peak elevation (hard tol +/-5 deg)
 *       "durationMin": 12.5,          // approximate (soft); seeds the mean-motion grid
 *       "direction": "northbound",    // optional: northbound|southbound at max el
 *       "inclinations": [97.6],       // optional override of the inclination grid
 *       "meanMotions": [14.9],        // optional override of the mean-motion grid
 *       "tle1": "...", "tle2": "..."  // optional: verify-only (no search), e.g. a
 *     }                               //   checked-in TLE to print its pass table
 *   ]
 * }
 *
 * Multi-station scheduling: when two (or more) requests share a noradId (the
 * same bird must pass Galway at T+2 and a second station at T+98), they are
 * solved JOINTLY - one TLE is searched that satisfies every request in the
 * group, and the run reports per-request residuals if that is infeasible.
 * Joint requests are only geometrically feasible when the stations sit near a
 * common ground track at the requested time separation: successive ground
 * tracks shift ~24.1 deg of longitude west per ~96 min orbit, so "pass B one
 * orbit after pass A" needs station B roughly that far west of station A (or
 * along the same track for separations << 1 orbit).
 *
 * The DEMO_CONFIG reproduces (approximately) the checked-in MERIDIAN-SAR-1
 * pass from src/campaigns/nats-eu/satellites.ts (AOS T+2.0, max el ~88,
 * LOS T+14.5 over Galway, epoch 2027-03-15 14:00 UTC) and also carries the
 * checked-in TLE as a verify-only entry, so the solver's pass table can be
 * compared line-by-line against known-good numbers in a single run.
 *
 * Limitations:
 * - AOS/LOS use a 0 deg elevation horizon (same default as PassPlannerService).
 * - Eccentricity (0.001) and arg of perigee (90) are fixed, matching
 *   scripts/author-tle.mjs; only near-circular LEO birds are authored here
 *   (mean motion clamped to 11.25-16.4 rev/day). GEO work stays in
 *   scripts/author-tle-signal-hunter.mjs.
 * - durationMin is a soft target: altitude (mean motion) and max-el dominate
 *   duration, so it converges to the physically consistent value.
 */
import { readFileSync } from 'node:fs';
import { GroundObject, Satellite } from 'ootk';

// ── Tolerances and search constants ─────────────────────────────────────────

const AOS_TOL_MIN = 0.5; // hard: achieved AOS within +/-0.5 min of request
const EL_TOL_DEG = 5; // hard: achieved max el within +/-5 deg of request
const DUR_SOFT_TOL_MIN = 2; // soft: duration error only nudges the score

const COARSE_STEP_DEG = 2; // RAAN x MA coarse grid step (as author-tle.mjs)
const COARSE_AOS_GATE_MIN = 3; // relaxed gates while coarse-scanning...
const COARSE_EL_GATE_DEG = 20; // ...so near-misses stay reportable
const REFINE_SPAN_DEG = 2.5; // local refine box around the coarse winner
const REFINE_STEP_DEG = 0.25; // 0.25 deg MA ~= 4 s of AOS timing at mm 14.9

const DEFAULT_INCLINATIONS = [97.2, 97.6, 98.0, 98.4]; // sun-sync band (track reaches ~82 deg lat)
const DEFAULT_MEAN_MOTIONS = [14.2, 14.6, 15.0]; // only used when no durationMin given
const MM_SPREAD = 0.25; // mm grid = duration-derived estimate +/- spread
const MM_MIN = 11.25;
const MM_MAX = 16.4;
const FOLLOWUP_HORIZON_MIN = 120; // pass table extends 2 h past the request

const MU_KM3_S2 = 398600.4418;
const RE_KM = 6378.137;
const EARTH_ROT_DEG_MIN = 0.250684; // sidereal rotation rate

// ── Demo config ──────────────────────────────────────────────────────────────

const DEMO_CONFIG = {
  epoch: '2027-03-15T14:00:00Z',
  cosparId: '27015A',
  stations: {
    galway: { lat: 53.27, lon: -9.05, alt: 0.02 },
  },
  passes: [
    {
      // Fresh solve that should land (approximately) on the checked-in
      // MERIDIAN-SAR-1 pass geometry: AOS T+2, max el ~88, LOS ~T+14.5.
      name: 'MERIDIAN-DEMO',
      noradId: 61799,
      station: 'galway',
      aosOffsetMin: 2.0,
      maxElDeg: 88,
      durationMin: 12.5,
    },
    {
      // Verify-only: the checked-in MERIDIAN-SAR-1 TLE from
      // src/campaigns/nats-eu/satellites.ts. Its pass table prints next to
      // the freshly solved bird above for a direct known-good comparison.
      name: 'MERIDIAN-SAR-1 (checked-in, verify only)',
      noradId: 61701,
      station: 'galway',
      aosOffsetMin: 2.0,
      maxElDeg: 88,
      durationMin: 12.5,
      tle1: '1 61701U 27015A   27074.58333333  .00001000  00000-0  10000-3 0  9996',
      tle2: '2 61701  97.6000  26.0000 0010000  90.0000 294.0000 14.90000000123451',
    },
  ],
};

// ── Config loading ───────────────────────────────────────────────────────────

const configPath = process.argv[2];
const config = configPath ? JSON.parse(readFileSync(configPath, 'utf8')) : DEMO_CONFIG;

const START_MS = Date.parse(config.epoch);
if (!Number.isFinite(START_MS)) {
  console.error(`Invalid config.epoch "${config.epoch}" - use an ISO UTC string like 2027-03-15T14:00:00Z`);
  process.exit(1);
}
const EPOCH_FIELD = toTleEpochField(START_MS);
const COSPAR = (config.cosparId ?? `${String(new Date(START_MS).getUTCFullYear() % 100).padStart(2, '0')}001A`).padEnd(8);
const COARSE_STEP = config.coarseStepDeg ?? COARSE_STEP_DEG;

const stations = {};
for (const [key, s] of Object.entries(config.stations ?? {})) {
  stations[key] = { go: new GroundObject({ lat: s.lat, lon: s.lon, alt: s.alt ?? 0 }), ...s };
}
const stationKeys = Object.keys(stations);
if (stationKeys.length === 0) {
  console.error('config.stations must define at least one station');
  process.exit(1);
}

/** TLE epoch field YYDDD.DDDDDDDD for a Unix ms timestamp (UTC). */
function toTleEpochField(ms) {
  const d = new Date(ms);
  const yy = String(d.getUTCFullYear() % 100).padStart(2, '0');
  const doyFloat = (ms - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86_400_000 + 1;
  const doy = Math.floor(doyFloat);
  return `${yy}${String(doy).padStart(3, '0')}.${(doyFloat - doy).toFixed(8).slice(2)}`;
}

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

function buildTle(noradId, inclination, raan, meanAnomaly, meanMotion) {
  const id = String(noradId).padStart(5, '0');
  const l1Body = `1 ${id}U ${COSPAR} ${EPOCH_FIELD}  .00001000  00000-0  10000-3 0  999`;
  const l2Body = `2 ${id} ${fmt(inclination, 8, 4)} ${fmt(raan, 8, 4)} 0010000 ${fmt(90, 8, 4)} ${fmt(meanAnomaly, 8, 4)} ${fmt(meanMotion, 11, 8)}12345`;
  return {
    tle1: l1Body + tleChecksum(l1Body),
    tle2: l2Body + tleChecksum(l2Body),
  };
}

function tryBuildSatellite(noradId, inclination, raan, meanAnomaly, meanMotion) {
  const { tle1, tle2 } = buildTle(noradId, inclination, raan, meanAnomaly, meanMotion);
  try {
    return { sat: new Satellite({ tle1, tle2 }), tle1, tle2 };
  } catch {
    return null;
  }
}

// ── Propagation helpers ──────────────────────────────────────────────────────

function raeAt(sat, go, ms) {
  try {
    return sat.rae(go, new Date(ms));
  } catch {
    return null;
  }
}

function elevationAt(sat, go, ms) {
  const rae = raeAt(sat, go, ms);
  return rae ? rae.el : -90;
}

/** Bisect a horizon crossing between two sample times to ~0.5 s. */
function refineCrossing(sat, go, loMs, hiMs, rising) {
  let lo = loMs;
  let hi = hiMs;
  while (hi - lo > 500) {
    const mid = (lo + hi) / 2;
    const up = elevationAt(sat, go, mid) >= 0;
    if (up === rising) hi = mid;
    else lo = mid;
  }
  return rising ? hi : lo;
}

/** Scan [aos, los] for max elevation, edge azimuths, and pass direction. */
function summarizePass(sat, go, aosMs, losMs, scanMs) {
  let maxEl = -90;
  let maxElMs = aosMs;
  let maxElRngKm = 0;
  for (let t = aosMs; t <= losMs; t += scanMs) {
    const rae = raeAt(sat, go, t);
    if (rae && rae.el > maxEl) {
      maxEl = rae.el;
      maxElMs = t;
      maxElRngKm = rae.rng;
    }
  }
  const aosRae = raeAt(sat, go, aosMs + 500);
  const losRae = raeAt(sat, go, losMs - 500);
  let direction = null;
  try {
    const latBefore = sat.lla(new Date(maxElMs - 30_000)).lat;
    const latAfter = sat.lla(new Date(maxElMs + 30_000)).lat;
    direction = latAfter > latBefore ? 'northbound' : 'southbound';
  } catch {
    // leave direction null if propagation fails at the sample points
  }
  return {
    aosMs,
    losMs,
    maxEl,
    maxElMs,
    maxElRngKm,
    aosAz: aosRae ? aosRae.az : null,
    losAz: losRae ? losRae.az : null,
    direction,
    durationMin: (losMs - aosMs) / 60_000,
  };
}

/** The single pass nearest the target AOS (20 s coarse walk, bisected edges). */
function findPassNear(sat, go, targetAosMs, durEstMin, scanMs) {
  const stepMs = 20_000;
  let startMs = targetAosMs - 4 * 60_000;
  // If already mid-pass at the window start, walk back below the horizon.
  let guard = 0;
  while (elevationAt(sat, go, startMs) >= 0 && guard < 90) {
    startMs -= stepMs;
    guard++;
  }
  const endMs = targetAosMs + (durEstMin + 8) * 60_000;
  let prevEl = elevationAt(sat, go, startMs);
  let aosMs = null;
  for (let ms = startMs + stepMs; ms <= endMs; ms += stepMs) {
    const el = elevationAt(sat, go, ms);
    if (prevEl < 0 && el >= 0) {
      aosMs = refineCrossing(sat, go, ms - stepMs, ms, true);
    }
    if (aosMs !== null && prevEl >= 0 && el < 0) {
      const losMs = refineCrossing(sat, go, ms - stepMs, ms, false);
      return summarizePass(sat, go, aosMs, losMs, scanMs);
    }
    prevEl = el;
  }
  return null;
}

/** Every pass between startMs and endMs (for the verified pass table). */
function listPasses(sat, go, startMs, endMs) {
  const stepMs = 30_000;
  const passes = [];
  let cursor = startMs;
  // Report a pass already in progress at startMs with its true (negative-T) AOS.
  let guard = 0;
  while (elevationAt(sat, go, cursor) >= 0 && guard < 60) {
    cursor -= stepMs;
    guard++;
  }
  let prevEl = elevationAt(sat, go, cursor);
  let aosMs = null;
  for (let ms = cursor + stepMs; ms <= endMs; ms += stepMs) {
    const el = elevationAt(sat, go, ms);
    if (prevEl < 0 && el >= 0) {
      aosMs = refineCrossing(sat, go, ms - stepMs, ms, true);
    }
    if (aosMs !== null && prevEl >= 0 && el < 0) {
      const losMs = refineCrossing(sat, go, ms - stepMs, ms, false);
      passes.push(summarizePass(sat, go, aosMs, losMs, 2_000));
      aosMs = null;
    }
    prevEl = el;
  }
  return passes;
}

// ── Duration -> mean-motion seeding (analytic circular-orbit model) ─────────

function mmToSemiMajorKm(mm) {
  const radPerS = (mm * 2 * Math.PI) / 86_400;
  return Math.cbrt(MU_KM3_S2 / (radPerS * radPerS));
}

/** Predicted horizon-to-horizon pass duration (min) for a given peak elevation. */
function predictDurationMin(mm, maxElDeg, inclDeg) {
  const a = mmToSemiMajorKm(mm);
  const k = RE_KM / a;
  const lamMax = Math.acos(k); // Earth-central half-angle of the 0-deg-el circle
  const elRad = (Math.min(maxElDeg, 89.9) * Math.PI) / 180;
  // Cross-track central angle beta at which peak elevation equals the target:
  // tan(el) = (cos b - k) / sin b, monotonically decreasing in b.
  let lo = 1e-6;
  let hi = lamMax;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const el = Math.atan2(Math.cos(mid) - k, Math.sin(mid));
    if (el > elRad) lo = mid;
    else hi = mid;
  }
  const beta = (lo + hi) / 2;
  const halfArcRad = Math.acos(Math.min(1, Math.cos(lamMax) / Math.cos(beta)));
  const relRateDegMin = (mm * 360) / 1440 - EARTH_ROT_DEG_MIN * Math.cos((inclDeg * Math.PI) / 180);
  return (2 * (halfArcRad * 180) / Math.PI) / relRateDegMin;
}

/** Invert predictDurationMin for mm (duration decreases with mean motion). */
function durationToMeanMotion(durMin, maxElDeg, inclDeg) {
  let lo = MM_MIN;
  let hi = MM_MAX;
  if (predictDurationMin(lo, maxElDeg, inclDeg) < durMin) return lo;
  if (predictDurationMin(hi, maxElDeg, inclDeg) > durMin) return hi;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (predictDurationMin(mid, maxElDeg, inclDeg) > durMin) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// ── Request normalization and grouping ───────────────────────────────────────

function normalizeRequest(raw, index) {
  const stationKey = raw.station ?? (stationKeys.length === 1 ? stationKeys[0] : null);
  if (!stationKey || !stations[stationKey]) {
    throw new Error(`passes[${index}] "${raw.name}": unknown station "${raw.station}" (have: ${stationKeys.join(', ')})`);
  }
  if (typeof raw.noradId !== 'number') throw new Error(`passes[${index}] "${raw.name}": noradId is required`);
  if (typeof raw.aosOffsetMin !== 'number') throw new Error(`passes[${index}] "${raw.name}": aosOffsetMin is required`);
  if (typeof raw.maxElDeg !== 'number') throw new Error(`passes[${index}] "${raw.name}": maxElDeg is required`);
  const durEstMin = typeof raw.durationMin === 'number' ? raw.durationMin : 15;
  return {
    ...raw,
    stationKey,
    stationGO: stations[stationKey].go,
    aosMs: START_MS + raw.aosOffsetMin * 60_000,
    midMs: START_MS + (raw.aosOffsetMin + durEstMin / 2) * 60_000,
    durEstMin,
    direction: raw.direction ? (/^n/i.test(raw.direction) ? 'northbound' : 'southbound') : null,
  };
}

function collectOverride(requests, key) {
  const values = [];
  for (const req of requests) {
    if (Array.isArray(req[key])) {
      for (const v of req[key]) {
        if (!values.includes(v)) values.push(v);
      }
    }
  }
  if (values.length) return values;
  if (Array.isArray(config[key])) return [...config[key]];
  return null;
}

function deriveMeanMotions(requests, inclList) {
  const inclRef = inclList[Math.floor(inclList.length / 2)];
  const grid = [];
  for (const req of requests) {
    if (typeof req.durationMin !== 'number') continue;
    const est = durationToMeanMotion(req.durationMin, req.maxElDeg, inclRef);
    for (const delta of [-MM_SPREAD, 0, MM_SPREAD]) {
      const mm = Math.round(Math.min(MM_MAX, Math.max(MM_MIN, est + delta)) * 1e4) / 1e4;
      if (!grid.some((v) => Math.abs(v - mm) < 0.02)) grid.push(mm);
    }
  }
  return grid.length ? grid.sort((a, b) => a - b) : [...DEFAULT_MEAN_MOTIONS];
}

// ── Candidate screening and evaluation ───────────────────────────────────────

/**
 * Cheap screen: 1 propagation per request near the expected max-el time kills
 * ~99% of grid points before the (expensive) full pass evaluation; survivors
 * get a 3-sample check that tolerates the peak drifting ~1 min off estimate.
 */
function passesScreen(sat, requests, diag) {
  for (const req of requests) {
    const elMid = elevationAt(sat, req.stationGO, req.midMs);
    if (diag && elMid > (diag.bestMidEl.get(req) ?? -90)) diag.bestMidEl.set(req, elMid);
    if (elMid < req.maxElDeg - 55) return false;
  }
  for (const req of requests) {
    const el3 = Math.max(
      elevationAt(sat, req.stationGO, req.midMs - 60_000),
      elevationAt(sat, req.stationGO, req.midMs),
      elevationAt(sat, req.stationGO, req.midMs + 60_000),
    );
    if (el3 < req.maxElDeg - 30) return false;
  }
  return true;
}

/** Score a candidate TLE against every request in the group (lower = better). */
function evaluateCandidate(sat, requests, scanMs) {
  let score = 0;
  const results = [];
  for (const req of requests) {
    const pass = findPassNear(sat, req.stationGO, req.aosMs, req.durEstMin, scanMs);
    if (!pass) return null;
    const aosErrMin = Math.abs(pass.aosMs - req.aosMs) / 60_000;
    if (aosErrMin > COARSE_AOS_GATE_MIN) return null;
    const elErr = Math.abs(pass.maxEl - req.maxElDeg);
    if (elErr > COARSE_EL_GATE_DEG) return null;
    if (req.direction && pass.direction && pass.direction !== req.direction) return null;
    const durErr = typeof req.durationMin === 'number' ? Math.abs(pass.durationMin - req.durationMin) : 0;
    score += aosErrMin / AOS_TOL_MIN + elErr / EL_TOL_DEG + (0.3 * durErr) / DUR_SOFT_TOL_MIN;
    results.push({ req, pass, aosErrMin, elErr, durErr });
  }
  return { score, results };
}

// ── Solver: coarse grid + local refine per noradId group ────────────────────

function solveGroup(noradId, requests) {
  const t0 = Date.now();
  const inclList = collectOverride(requests, 'inclinations') ?? [...DEFAULT_INCLINATIONS];
  const mmList = collectOverride(requests, 'meanMotions') ?? deriveMeanMotions(requests, inclList);
  const stats = { combos: 0, screened: 0, evaluated: 0 };
  const diag = { bestMidEl: new Map() };

  // Reachability sanity check: the ground track must get near each station.
  for (const req of requests) {
    const latAbs = Math.abs(stations[req.stationKey].lat);
    const reachable = inclList.some((incl) => (incl <= 90 ? incl : 180 - incl) >= latAbs - 20);
    if (!reachable) {
      console.warn(`  WARNING: no inclination candidate reaches lat ${latAbs} deg for "${req.name}" - override "inclinations".`);
    }
  }

  let best = null;
  for (const incl of inclList) {
    for (const mm of mmList) {
      for (let raan = 0; raan < 360; raan += COARSE_STEP) {
        for (let ma = 0; ma < 360; ma += COARSE_STEP) {
          stats.combos++;
          const built = tryBuildSatellite(noradId, incl, raan, ma, mm);
          if (!built) continue;
          if (!passesScreen(built.sat, requests, diag)) continue;
          stats.screened++;
          const evaluated = evaluateCandidate(built.sat, requests, 10_000);
          if (!evaluated) continue;
          stats.evaluated++;
          if (!best || evaluated.score < best.score) {
            best = { ...evaluated, incl, mm, raan, ma };
          }
        }
      }
    }
  }

  // Local refine around the coarse winner (RAAN/MA only; incl+mm stay fixed).
  if (best) {
    let refined = null;
    for (let dr = -REFINE_SPAN_DEG; dr <= REFINE_SPAN_DEG; dr += REFINE_STEP_DEG) {
      for (let dm = -REFINE_SPAN_DEG; dm <= REFINE_SPAN_DEG; dm += REFINE_STEP_DEG) {
        const raan = (best.raan + dr + 360) % 360;
        const ma = (best.ma + dm + 360) % 360;
        const built = tryBuildSatellite(noradId, best.incl, raan, ma, best.mm);
        if (!built) continue;
        const evaluated = evaluateCandidate(built.sat, requests, 5_000);
        if (!evaluated) continue;
        if (!refined || evaluated.score < refined.score) {
          refined = { ...evaluated, incl: best.incl, mm: best.mm, raan, ma };
        }
      }
    }
    best = refined ?? best;
  }

  // Final high-resolution verification of the winning TLE.
  let final = null;
  if (best) {
    const built = tryBuildSatellite(noradId, best.incl, best.raan, best.ma, best.mm);
    const evaluated = built ? evaluateCandidate(built.sat, requests, 2_000) : null;
    if (built && evaluated) {
      final = { ...evaluated, incl: best.incl, mm: best.mm, raan: best.raan, ma: best.ma, ...built };
    }
  }

  const ok = final !== null && final.results.every((r) => r.aosErrMin <= AOS_TOL_MIN + 1e-9 && r.elErr <= EL_TOL_DEG + 1e-9);
  return { noradId, requests, ok, final, stats, diag, elapsedS: (Date.now() - t0) / 1000 };
}

// ── Output ───────────────────────────────────────────────────────────────────

function tPlus(ms) {
  return `T+${((ms - START_MS) / 60_000).toFixed(2)}`;
}

function utc(ms) {
  return `${new Date(ms).toISOString().slice(11, 19)}Z`;
}

function az(deg) {
  return deg === null ? 'az ?' : `az ${deg.toFixed(0).padStart(3)}`;
}

function passRow(pass, index) {
  return (
    `  #${index + 1}  AOS ${tPlus(pass.aosMs).padStart(8)} (${utc(pass.aosMs)}, ${az(pass.aosAz)})` +
    `  max el ${pass.maxEl.toFixed(1).padStart(4)} deg ${tPlus(pass.maxElMs)} (rng ${pass.maxElRngKm.toFixed(0)} km)` +
    `  LOS ${tPlus(pass.losMs).padStart(8)} (${az(pass.losAz)})  dur ${pass.durationMin.toFixed(1)} min  ${pass.direction ?? '?'}`
  );
}

function printRequestLine(result) {
  const { req, pass, aosErrMin, elErr } = result;
  const okAos = aosErrMin <= AOS_TOL_MIN + 1e-9;
  const okEl = elErr <= EL_TOL_DEG + 1e-9;
  const verdict = okAos && okEl ? 'OK' : `MISS (${okAos ? '' : `AOS err ${aosErrMin.toFixed(2)} min > ${AOS_TOL_MIN}`}${!okAos && !okEl ? '; ' : ''}${okEl ? '' : `max-el err ${elErr.toFixed(1)} deg > ${EL_TOL_DEG}`})`;
  console.log(
    `  [${req.stationKey}] requested AOS T+${req.aosOffsetMin.toFixed(1)}, max el ${req.maxElDeg} deg` +
      `${typeof req.durationMin === 'number' ? `, dur ~${req.durationMin} min` : ''}${req.direction ? `, ${req.direction}` : ''}` +
      `\n           achieved  AOS ${tPlus(pass.aosMs)}, max el ${pass.maxEl.toFixed(1)} deg ${tPlus(pass.maxElMs)}, LOS ${tPlus(pass.losMs)},` +
      ` dur ${pass.durationMin.toFixed(1)} min, ${pass.direction ?? '?'}  ->  ${verdict}`,
  );
}

function printPassTables(sat, requests) {
  const byStation = new Map();
  for (const req of requests) {
    const horizonMs = req.aosMs + (req.durEstMin + FOLLOWUP_HORIZON_MIN) * 60_000;
    byStation.set(req.stationKey, Math.max(byStation.get(req.stationKey) ?? 0, horizonMs));
  }
  for (const [stationKey, endMs] of byStation) {
    console.log(`\n  Verified pass table - ${stationKey} (epoch ${new Date(START_MS).toISOString()}, horizon ${tPlus(endMs)}):`);
    const passes = listPasses(sat, stations[stationKey].go, START_MS, endMs);
    if (!passes.length) console.log('  (no passes in horizon)');
    passes.forEach((pass, i) => console.log(passRow(pass, i)));
  }
}

function printSnippet(name, tle1, tle2) {
  console.log(`\n  Ready to paste (src/campaigns/nats-eu/satellites.ts style) - ${name}:`);
  console.log(`    tle1: '${tle1}' as TleLine1,`);
  console.log(`    tle2: '${tle2}' as TleLine2,`);
}

function printSolveReport(report) {
  const names = [...new Set(report.requests.map((r) => r.name))].join(' / ');
  console.log(`\n=== ${names} (${report.noradId}) - ${report.requests.length} requested pass(es) ===`);
  console.log(
    `  search: ${report.elapsedS.toFixed(1)} s | ${report.stats.combos.toLocaleString()} grid points | ` +
      `${report.stats.screened.toLocaleString()} screened in | ${report.stats.evaluated.toLocaleString()} fully evaluated`,
  );
  if (!report.final) {
    console.log('  NO CANDIDATE passed even the relaxed coarse gates.');
    for (const req of report.requests) {
      const bestEl = report.diag.bestMidEl.get(req);
      console.log(
        `    [${req.stationKey}] "${req.name}": best elevation seen near the requested peak time: ` +
          `${bestEl === undefined ? 'n/a' : `${bestEl.toFixed(1)} deg`} (needs >= ${(req.maxElDeg - 30).toFixed(0)} deg to screen in)`,
      );
    }
    if (report.requests.length > 1) {
      console.log(
        '    Joint multi-station request is likely geometrically infeasible: check that the AOS\n' +
          '    separation matches the ground-track drift (~24.1 deg lon west per ~96 min orbit),\n' +
          '    or relax maxElDeg / adjust aosOffsetMin / widen "inclinations"/"meanMotions".',
      );
    }
    return;
  }
  console.log(`  orbit: incl ${report.final.incl.toFixed(4)}  raan ${report.final.raan.toFixed(4)}  ma ${report.final.ma.toFixed(4)}  mm ${report.final.mm.toFixed(8)}  (ecc 0.001, argp 90)`);
  for (const result of report.final.results) printRequestLine(result);
  if (!report.ok) {
    console.log('  RESULT: best candidate MISSES tolerance - see residuals above. Widen the grids or adjust the request.');
  }
  printPassTables(report.final.sat, report.requests);
  printSnippet(`${names} (${report.noradId})`, report.final.tle1, report.final.tle2);
}

function printVerifyReport(req) {
  console.log(`\n=== ${req.name} (${req.noradId}) - VERIFY ONLY (TLE supplied, no search) ===`);
  let sat;
  try {
    sat = new Satellite({ tle1: req.tle1, tle2: req.tle2 });
  } catch (err) {
    console.log(`  Could not initialize satellite from supplied TLE: ${err.message}`);
    return false;
  }
  const evaluated = evaluateCandidate(sat, [req], 2_000);
  if (!evaluated) {
    console.log(`  No pass found near AOS T+${req.aosOffsetMin} over ${req.stationKey} (within relaxed gates).`);
    printPassTables(sat, [req]);
    return false;
  }
  for (const result of evaluated.results) printRequestLine(result);
  printPassTables(sat, [req]);
  return evaluated.results.every((r) => r.aosErrMin <= AOS_TOL_MIN + 1e-9 && r.elErr <= EL_TOL_DEG + 1e-9);
}

// ── Main ─────────────────────────────────────────────────────────────────────

console.log(`Scenario epoch: ${new Date(START_MS).toISOString()} (TLE epoch field ${EPOCH_FIELD.trim()})`);
console.log(`Stations: ${stationKeys.map((k) => `${k} (lat ${stations[k].lat}, lon ${stations[k].lon}, alt ${stations[k].alt ?? 0} km)`).join(' | ')}`);
console.log(`Tolerances: AOS +/-${AOS_TOL_MIN} min (hard), max el +/-${EL_TOL_DEG} deg (hard), duration (soft)`);

// Preserve config order; requests sharing a noradId are solved jointly.
const tasks = [];
const groupsByNorad = new Map();
(config.passes ?? []).forEach((raw, index) => {
  const req = normalizeRequest(raw, index);
  if (raw.tle1 && raw.tle2) {
    tasks.push({ kind: 'verify', req });
    return;
  }
  if (!groupsByNorad.has(req.noradId)) {
    const group = { kind: 'solve', noradId: req.noradId, requests: [] };
    groupsByNorad.set(req.noradId, group);
    tasks.push(group);
  }
  groupsByNorad.get(req.noradId).requests.push(req);
});
if (!tasks.length) {
  console.error('config.passes is empty - nothing to do');
  process.exit(1);
}

let anyFailed = false;
for (const task of tasks) {
  if (task.kind === 'verify') {
    if (!printVerifyReport(task.req)) anyFailed = true;
  } else {
    const report = solveGroup(task.noradId, task.requests);
    printSolveReport(report);
    if (!report.ok) anyFailed = true;
  }
}
if (anyFailed) {
  process.exitCode = 1;
  console.log('\nOne or more requests did not converge - see reports above.');
} else {
  console.log('\nAll requests converged within tolerance.');
}
