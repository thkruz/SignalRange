/**
 * Authoring tool for the two Phase 3 constellation sandbox scenarios
 * (src/campaigns/constellation-sandbox).
 *
 * 1. Parks the authored Ku GEO satellite of the Starlink interference sandbox
 *    on its longitude slot at the scenario start epoch (same TLE construction
 *    as scripts/author-tle-signal-hunter.mjs).
 * 2. Scans the real starlink-2026-11 set for members that cross the dish
 *    boresight (main beam) or pass inside the sidelobe cone while the dish
 *    stares at that satellite, so the start time puts events inside the first
 *    minutes of the session.
 *
 * Run from the repo root (needs public/assets/tle-sets from `pnpm fetch:tle-sets`):
 *   node scripts/author-tle-constellation-demos.mjs [startIsoUtc]
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { GroundObject, Satellite } from 'ootk';

const STATION = { lat: 36.0, lon: -105.0, alt: 2.1 };
const SLOT_LON = -98.0;
const NORAD = 90001;
const START = Date.parse(process.argv[2] ?? '2026-11-09T18:00:00Z');
const EPOCH_FIELD = '26313.50000000';
const GEO_MEAN_MOTION = 1.00273791;

const stationGO = new GroundObject({ lat: STATION.lat, lon: STATION.lon, alt: STATION.alt });

function tleChecksum(line) {
  let sum = 0;
  for (const ch of line) {
    if (ch >= '0' && ch <= '9') sum += Number(ch);
    else if (ch === '-') sum += 1;
  }
  return sum % 10;
}
const fmt = (v, w, d) => v.toFixed(d).padStart(w);

function buildTle(raan, ma) {
  const l1 = `1 ${NORAD}U 26200A   ${EPOCH_FIELD}  .00000010  00000-0  00000-0 0  999`;
  const l2 = `2 ${NORAD} ${fmt(0.05, 8, 4)} ${fmt(raan, 8, 4)} 0001000 ${fmt(90, 8, 4)} ${fmt(ma, 8, 4)} ${fmt(GEO_MEAN_MOTION, 11, 8)}12345`;
  return { tle1: l1 + tleChecksum(l1), tle2: l2 + tleChecksum(l2) };
}

let best = null;
for (let ma = 0; ma < 360; ma += 0.25) {
  const { tle1, tle2 } = buildTle(0, ma);
  const sat = new Satellite({ tle1, tle2 });
  const lon = sat.lla(new Date(START)).lon;
  let err = Math.abs(lon - SLOT_LON);
  if (err > 180) err = 360 - err;
  if (!best || err < best.err) best = { err, ma, tle1, tle2, sat };
}
const rae0 = best.sat.rae(stationGO, new Date(START));
console.log(`GEO ${NORAD}: slot err ${best.err.toFixed(3)} deg, az ${rae0.az.toFixed(2)} el ${rae0.el.toFixed(2)} rng ${rae0.rng.toFixed(0)}`);
console.log(best.tle1);
console.log(best.tle2);
const later = best.sat.rae(stationGO, new Date(START + 3 * 3600e3));
console.log(`T+3h az ${later.az.toFixed(2)} el ${later.el.toFixed(2)}`);

const set = JSON.parse(gunzipSync(readFileSync('public/assets/tle-sets/starlink-2026-11/starlink-2026-11.json.gz')));
const sats = set.members.map((m) => ({ norad: m.noradId, name: m.name, sat: new Satellite({ tle1: m.tle1, tle2: m.tle2 }) }));
const toVec = (az, el) => {
  const a = (az * Math.PI) / 180;
  const e = (el * Math.PI) / 180;
  return [Math.cos(e) * Math.sin(a), Math.cos(e) * Math.cos(a), Math.sin(e)];
};
const bore = toVec(rae0.az, rae0.el);
const STEP = 15e3;
const events = new Map();
for (let t = 0; t < 3 * 3600e3; t += STEP) {
  const d = new Date(START + t);
  for (const s of sats) {
    let r;
    try {
      r = s.sat.rae(stationGO, d);
    } catch {
      continue;
    }
    if (!r || r.el < 0) continue;
    const v = toVec(r.az, r.el);
    const ang = (Math.acos(Math.min(1, bore[0] * v[0] + bore[1] * v[1] + bore[2] * v[2])) * 180) / Math.PI;
    if (ang < 10) {
      const e = events.get(s.norad) ?? { name: s.name, min: 99, tMin: 0 };
      if (ang < e.min) {
        e.min = ang;
        e.tMin = t;
      }
      events.set(s.norad, e);
    }
  }
}
const list = [...events.entries()].sort((a, b) => a[1].tMin - b[1].tMin);
console.log(`members within 10 deg of boresight in 3 h: ${list.length}`);
for (const [n, e] of list.slice(0, 400)) console.log(`${String(Math.round(e.tMin / 60e3)).padStart(4)} min  ${n}  ${e.name}  closest ${e.min.toFixed(2)} deg`);
console.log('in-beam (<1.5 deg):', list.filter(([, e]) => e.min < 1.5).length, ' <5 deg:', list.filter(([, e]) => e.min < 5).length);
