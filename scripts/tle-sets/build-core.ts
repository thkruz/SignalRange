/**
 * Pure builder logic for sr-tle-set/1 documents (no network, no filesystem), shared by
 * scripts/tle-sets/build.ts and the unit tests.
 */
import { TLE_SET_FORMAT, type TleSet, type TleSetMember } from '../../src/tle-sets/tle-set-types';
import { isValidTleLine, parseNoradId, tleEpochDate } from '../../src/tle-sets/tle-set-validate';

/** One catalog record as served by the KeepTrack catalog export (extra fields are ignored). */
export interface CatalogRecord {
  tle1: string;
  tle2: string;
  name?: string;
  /** KeepTrack object type: 1 payload, 2 rocket body, 3 debris */
  type?: number;
  status?: string;
}

export interface BuildOptions {
  id: string;
  title: string;
  source: string;
  snapshotUtc: string;
}

export interface BuildReport {
  input: number;
  matched: number;
  droppedInvalid: number;
  droppedStale: number;
  droppedOffOrbit: number;
}

export interface Elements {
  inclinationDeg: number;
  raanDeg: number;
  eccentricity: number;
  meanMotionRevPerDay: number;
  altitudeKm: number;
}

const MU_KM3_S2 = 398600.4418;
const EARTH_RADIUS_KM = 6378.137;

/** Shell clustering parameters. */
const SHELL_BIN_KM = 5;
const SHELL_CAPTURE_KM = 12.5;
const MIN_SHELL_MEMBERS = 100;
const PLANE_WIDTH_DEG = 5;
/** An element set older than this before the snapshot is a decayed or abandoned object. */
const MAX_AGE_DAYS = 30;

export function parseElements(tle2: string): Elements {
  const n = Number(tle2.slice(52, 63));
  const a = Math.cbrt(MU_KM3_S2 / ((n * 2 * Math.PI) / 86400) ** 2);

  return {
    inclinationDeg: Number(tle2.slice(8, 16)),
    raanDeg: Number(tle2.slice(17, 25)),
    eccentricity: Number(`0.${tle2.slice(26, 33).trim()}`),
    meanMotionRevPerDay: n,
    altitudeKm: a - EARTH_RADIUS_KM,
  };
}

function usable_(r: CatalogRecord): boolean {
  return Boolean(r?.tle1 && r.tle2) && isValidTleLine(r.tle1, 1) && isValidTleLine(r.tle2, 2) && Number.isFinite(parseNoradId(r.tle1));
}

/** Keep the record with the newest epoch per NORAD id, sorted by NORAD id. */
function dedupe_(records: CatalogRecord[]): CatalogRecord[] {
  const best = new Map<number, CatalogRecord>();

  for (const r of records) {
    const id = parseNoradId(r.tle1);
    const prev = best.get(id);

    if (!prev || tleEpochDate(r.tle1) > tleEpochDate(prev.tle1)) {
      best.set(id, r);
    }
  }

  return [...best.values()].sort((a, b) => parseNoradId(a.tle1) - parseNoradId(b.tle1));
}

function newReport_(input: number): BuildReport {
  return { input, matched: 0, droppedInvalid: 0, droppedStale: 0, droppedOffOrbit: 0 };
}

function isStale_(rec: CatalogRecord, opts: BuildOptions): boolean {
  return Date.parse(opts.snapshotUtc) - tleEpochDate(rec.tle1).getTime() > MAX_AGE_DAYS * 86_400_000;
}

function finish_(opts: BuildOptions, members: TleSetMember[], groupLabels: Map<string, string>, rfTemplate: string): TleSet {
  const counts = new Map<string, number>();

  for (const m of members) {
    counts.set(m.group, (counts.get(m.group) ?? 0) + 1);
  }
  const groups = [...groupLabels.entries()].filter(([gid]) => counts.has(gid)).map(([gid, label]) => ({ id: gid, label, count: counts.get(gid) ?? 0, rfTemplate }));
  const epochs = members.map((m) => tleEpochDate(m.tle1).getTime()).sort((a, b) => a - b);
  const median = epochs[Math.floor(epochs.length / 2)] ?? Date.parse(opts.snapshotUtc);

  return {
    format: TLE_SET_FORMAT,
    id: opts.id,
    title: opts.title,
    snapshotUtc: opts.snapshotUtc,
    epoch: new Date(median).toISOString(),
    epochRangeUtc: [new Date(epochs[0] ?? median).toISOString(), new Date(epochs[epochs.length - 1] ?? median).toISOString()],
    source: opts.source,
    count: members.length,
    groups,
    members,
  };
}

interface Candidate {
  rec: CatalogRecord;
  el: Elements;
}

/**
 * Starlink: every payload whose name starts with STARLINK and that is still on orbit (mean motion
 * below 17.5 rev/day, element set no older than 30 days).
 *
 * Shells: members are bucketed by integer inclination; within each inclination the densest 5 km
 * altitude bin claims every member within 12.5 km as a shell (repeat while a claim has >= 100
 * members). The rest of that inclination goes to `transfer-<inc>` (orbit raising, lowering,
 * deorbit). `plane` is the 5-degree RAAN sector (0..71) for shell members; transfer members get
 * none because their RAAN is still drifting.
 */
export function buildStarlinkSet(records: CatalogRecord[], opts: BuildOptions): { set: TleSet; report: BuildReport } {
  const report = newReport_(records.length);
  const named = records.filter((r) => /^STARLINK/iu.test(r?.name ?? '') && (r.type === undefined || r.type === 1));
  const valid = named.filter((r) => usable_(r));

  report.droppedInvalid = named.length - valid.length;
  const kept: Candidate[] = [];

  for (const rec of dedupe_(valid)) {
    const el = parseElements(rec.tle2);

    if (!(el.meanMotionRevPerDay > 0 && el.meanMotionRevPerDay < 17.5 && el.altitudeKm > 150)) {
      report.droppedOffOrbit++;
    } else if (isStale_(rec, opts)) {
      report.droppedStale++;
    } else {
      kept.push({ rec, el });
    }
  }
  report.matched = kept.length;

  const byInc = new Map<number, Candidate[]>();

  for (const k of kept) {
    const inc = Math.round(k.el.inclinationDeg);
    const list = byInc.get(inc) ?? [];

    list.push(k);
    byInc.set(inc, list);
  }

  const assignment = new Map<CatalogRecord, { group: string; plane?: number }>();
  const labels = new Map<string, string>();

  for (const [inc, list] of byInc) {
    const left = new Set(list);

    for (;;) {
      const bins = new Map<number, number>();

      for (const k of left) {
        const b = Math.round(k.el.altitudeKm / SHELL_BIN_KM) * SHELL_BIN_KM;

        bins.set(b, (bins.get(b) ?? 0) + 1);
      }
      let peak = Number.NaN;
      let peakCount = 0;

      for (const [b, c] of [...bins.entries()].sort((a, z) => a[0] - z[0])) {
        if (c > peakCount) {
          peak = b;
          peakCount = c;
        }
      }
      const claimed = [...left].filter((k) => Math.abs(k.el.altitudeKm - peak) <= SHELL_CAPTURE_KM);

      if (claimed.length < MIN_SHELL_MEMBERS) {
        break;
      }
      const alts = claimed.map((k) => k.el.altitudeKm).sort((a, z) => a - z);
      const medianAlt = Math.round((alts[Math.floor(alts.length / 2)] ?? peak) / 5) * 5;
      const gid = `shell-${inc}-${medianAlt}`;
      const meanInc = claimed.reduce((s, k) => s + k.el.inclinationDeg, 0) / claimed.length;

      labels.set(gid, `${meanInc.toFixed(1)} deg / ${medianAlt} km`);
      for (const k of claimed) {
        left.delete(k);
        assignment.set(k.rec, { group: gid, plane: Math.floor((((k.el.raanDeg % 360) + 360) % 360) / PLANE_WIDTH_DEG) });
      }
    }
    if (left.size > 0) {
      const gid = `transfer-${inc}`;

      labels.set(gid, `${inc} deg, orbit raising / lowering`);
      for (const k of left) {
        assignment.set(k.rec, { group: gid });
      }
    }
  }

  const members: TleSetMember[] = kept.map(({ rec }) => {
    const a = assignment.get(rec);
    const m: TleSetMember = { noradId: parseNoradId(rec.tle1), name: (rec.name ?? '').trim(), tle1: rec.tle1, tle2: rec.tle2, group: a?.group ?? 'transfer' };

    if (a?.plane !== undefined) {
      m.plane = a.plane;
    }

    return m;
  });

  // Shells first, transfer groups last.
  const ordered = new Map<string, string>(
    [...labels.entries()].sort((a, z) => {
      const ta = a[0].startsWith('transfer') ? 1 : 0;
      const tz = z[0].startsWith('transfer') ? 1 : 0;

      return ta - tz || a[0].localeCompare(z[0], 'en', { numeric: true });
    }),
  );

  return { set: finish_(opts, members, ordered, 'starlink-ku-user-dl'), report };
}

const GEO_GROUPS: [string, string][] = [
  ['geo-payload', 'GEO payloads'],
  ['geo-rocket-body', 'GEO rocket bodies'],
  ['geo-debris', 'GEO debris'],
  ['geo-unknown', 'GEO unclassified'],
];

/**
 * GEO belt: mean motion 0.99 to 1.01 rev/day, eccentricity < 0.01, inclination < 15 deg, element
 * set no older than 30 days. Grouped by KeepTrack object type (payload, rocket body, debris,
 * unclassified).
 */
export function buildGeoSet(records: CatalogRecord[], opts: BuildOptions): { set: TleSet; report: BuildReport } {
  const report = newReport_(records.length);
  const valid = records.filter((r) => usable_(r));

  report.droppedInvalid = records.length - valid.length;
  const members: TleSetMember[] = [];

  for (const rec of dedupe_(valid)) {
    const el = parseElements(rec.tle2);

    if (!(el.meanMotionRevPerDay >= 0.99 && el.meanMotionRevPerDay <= 1.01 && el.eccentricity < 0.01 && el.inclinationDeg < 15)) {
      report.droppedOffOrbit++;
      continue;
    }
    if (isStale_(rec, opts)) {
      report.droppedStale++;
      continue;
    }
    const group = rec.type === 1 ? 'geo-payload' : rec.type === 2 ? 'geo-rocket-body' : rec.type === 3 ? 'geo-debris' : 'geo-unknown';
    const noradId = parseNoradId(rec.tle1);

    members.push({ noradId, name: (rec.name ?? '').trim() || `OBJECT ${noradId}`, tle1: rec.tle1, tle2: rec.tle2, group });
  }
  report.matched = members.length;

  return { set: finish_(opts, members, new Map(GEO_GROUPS), 'geo-c-ku-generic'), report };
}
