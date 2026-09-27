#!/usr/bin/env node
/**
 * Phase 19.1 calibration diff: compare the ledger in test/calibration/ (the
 * working tree, as just written by the snapshot) against a committed version,
 * and list authored thresholds the engine no longer meets.
 *
 *   node scripts/calibration/diff.mjs              # working tree vs HEAD
 *   node scripts/calibration/diff.mjs <git-ref>    # working tree vs <git-ref>
 *   node scripts/calibration/diff.mjs --margins    # current best-case margins only
 *
 * A change is reported when a number moves by at least 0.1 (dB, dBm, K,
 * dB/K). Margins are best case: the highest C/N (or IF power) any carrier
 * reaches at the objective's station on the flown passes, clear sky, against
 * the authored minimum. A negative margin means no clear-sky pass in the
 * ledger can satisfy that condition; it is the list a track's PR must answer.
 *
 * Not covered (reported as n/a, never as a failure): a station that receives
 * no carrier in its authored start state (a fault the player is meant to find,
 * a carrier the player must uplink) and scripted interference events, which
 * only the scenario's InterferenceManager radiates.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const DIR = join(ROOT, 'test/calibration');
const THRESHOLD = 0.1;
const FIELDS = ['peakCnDb', 'medianCnDb', 'peakRxIfDbm', 'noiseIfDbm'];
const PEAK_FIELDS = ['gainDbi', 'gOverTDbPerK', 'tsysK'];

const args = process.argv.slice(2);
const marginsOnly = args.includes('--margins');
const ref = args.find((a) => !a.startsWith('--')) ?? 'HEAD';

function committed(file) {
  try {
    return JSON.parse(execFileSync('git', ['show', `${ref}:test/calibration/${file}`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  } catch {
    return null;
  }
}

/** Flatten a ledger entry to "station/antenna/satellite/signal" -> carrier (+ peak metrics) */
function carriersOf(entry) {
  const out = new Map();
  for (const station of entry?.stations ?? []) {
    for (const link of station.links) {
      const base = `${station.stationId}#${station.antennaIndex}/${link.satellite}`;
      if (link.atPeak) out.set(`${base}/@peak`, link.atPeak);
      for (const carrier of link.carriers) out.set(`${base}/${carrier.signalId}`, carrier);
    }
  }
  return out;
}

/** Best-case margin of each authored threshold against its station */
function margins(entry) {
  const rows = [];
  for (const t of entry?.authored?.thresholds ?? []) {
    const stations = (entry.stations ?? []).filter((s) => !t.groundStation || s.stationId === t.groundStation);
    const carriers = stations.flatMap((s) => s.links.flatMap((l) => l.carriers));
    const payload = carriers.filter((c) => c.bandwidthMHz > 0 && c.peakCnDb !== null);
    if (t.params.minCNRatio !== undefined) {
      const best = Math.max(...payload.map((c) => c.peakCnDb), -Infinity);
      rows.push({ objectiveId: t.objectiveId, what: `C/N >= ${t.params.minCNRatio} dB`, margin: best - t.params.minCNRatio, covered: payload.length > 0 });
    }
    if (t.params.minPower !== undefined) {
      const heard = carriers.filter((c) => c.peakRxIfDbm !== null);
      const best = Math.max(...heard.map((c) => c.peakRxIfDbm), -Infinity);
      rows.push({ objectiveId: t.objectiveId, what: `IF power >= ${t.params.minPower} dBm`, margin: best - t.params.minPower, covered: heard.length > 0 });
    }
  }
  return rows;
}

const fmt = (x) => (Number.isFinite(x) ? x.toFixed(2) : String(x));

if (!existsSync(DIR)) {
  console.error('No ledger at test/calibration/. Run: npx vitest run --config vitest.calibration.config.mts');
  process.exit(1);
}

let changed = 0;
let failing = 0;
let uncovered = 0;
for (const file of readdirSync(DIR).filter((f) => f.endsWith('.json')).sort()) {
  const now = JSON.parse(readFileSync(join(DIR, file), 'utf8'));
  const lines = [];

  if (now.error) lines.push(`  ERROR ${now.error}`);

  if (!marginsOnly) {
    const before = committed(file);
    if (!before) {
      lines.push('  (new in the ledger)');
    } else {
      const a = carriersOf(before);
      const b = carriersOf(now);
      for (const [key, next] of b) {
        const prev = a.get(key);
        if (!prev) {
          lines.push(`  + ${key}`);
          continue;
        }
        for (const field of key.endsWith('/@peak') ? PEAK_FIELDS : FIELDS) {
          const d = (next[field] ?? Number.NaN) - (prev[field] ?? Number.NaN);
          if (Math.abs(d) >= THRESHOLD) lines.push(`  ${key} ${field}: ${fmt(prev[field])} -> ${fmt(next[field])} (${d > 0 ? '+' : ''}${fmt(d)})`);
        }
      }
      for (const key of a.keys()) if (!b.has(key)) lines.push(`  - ${key}`);
      const wasFailing = new Set(margins(before).filter((m) => m.covered && m.margin < 0).map((m) => `${m.objectiveId} ${m.what}`));
      for (const m of margins(now).filter((m) => m.covered && m.margin < 0 && !wasFailing.has(`${m.objectiveId} ${m.what}`))) {
        lines.push(`  NOW FAILS ${m.objectiveId}: ${m.what} (best ${fmt(m.margin)} dB short)`);
      }
    }
  }

  for (const m of margins(now)) {
    if (!m.covered) {
      uncovered++;
      if (marginsOnly) lines.push(`  ${m.objectiveId}: ${m.what}, n/a (no carrier at the station in its authored start state)`);
    } else if (m.margin < 0) {
      failing++;
      if (marginsOnly) lines.push(`  ${m.objectiveId}: ${m.what}, best-case margin ${fmt(m.margin)}`);
    }
  }

  if (lines.length > 0) {
    changed++;
    console.log(`${now.scenarioId}`);
    for (const line of lines) console.log(line);
  }
}

console.log(`\n${changed} scenario(s) listed; ${failing} authored threshold(s) with a negative best-case margin; ${uncovered} not covered by the ledger.`);
