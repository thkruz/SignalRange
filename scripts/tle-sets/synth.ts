/**
 * Deterministic synthetic TLE generator for Phase 3 perf work (P3-WP0).
 *
 * Produces Walker-style LEO shells (Starlink-like 53 deg / 550 km and friends)
 * plus a GEO belt slice, with valid checksums. Pure TypeScript with no Node or
 * DOM imports so both the dev perf scenario and a CLI can use it. The same
 * (count, seed, epoch) always yields byte-identical output.
 *
 * These are NOT real objects: the elements are idealised (near-circular, tiny
 * seeded jitter) and only meant to load the simulator realistically.
 */

export interface SynthShell {
  /** Relative weight when splitting N across shells */
  weight: number;
  inclinationDeg: number;
  altitudeKm: number;
  /** Walker planes (P) */
  planes: number;
  /** Walker phasing factor (F) */
  phasing: number;
}

export interface SynthOptions {
  /** Total number of elements to generate */
  count: number;
  /** PRNG seed (default 1) */
  seed?: number;
  /** Epoch as YYYY-MM-DD, 00:00 UTC (default 2026-11-09) */
  epoch?: string;
  /** First NORAD id (default 70000); ids are sequential */
  firstNoradId?: number;
  /** Fraction of N placed in the GEO belt slice (default 0.04; none when count < 10) */
  geoFraction?: number;
  /** LEO shells (default STARLINK_LIKE_SHELLS) */
  shells?: SynthShell[];
}

export interface SynthTle {
  name: string;
  noradId: number;
  tle1: string;
  tle2: string;
  shell: string;
}

export const STARLINK_LIKE_SHELLS: SynthShell[] = [
  { weight: 0.55, inclinationDeg: 53.0, altitudeKm: 550, planes: 72, phasing: 1 },
  { weight: 0.2, inclinationDeg: 53.2, altitudeKm: 540, planes: 72, phasing: 1 },
  { weight: 0.15, inclinationDeg: 70.0, altitudeKm: 570, planes: 36, phasing: 1 },
  { weight: 0.1, inclinationDeg: 97.6, altitudeKm: 560, planes: 6, phasing: 1 },
];

const MU_KM3_S2 = 398600.4418;
const EARTH_RADIUS_KM = 6378.137;
const SIDEREAL_DAY_S = 86164.0905;

/** mulberry32: small, fast, deterministic PRNG returning [0, 1) */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** TLE modulo-10 checksum over the first 68 columns ('-' counts 1, digits their value). */
export function tleChecksum(line68: string): number {
  let sum = 0;
  for (const ch of line68.slice(0, 68)) {
    if (ch >= '0' && ch <= '9') sum += ch.charCodeAt(0) - 48;
    else if (ch === '-') sum += 1;
  }
  return sum % 10;
}

/** Mean motion in revolutions per day for a circular orbit at the given altitude. */
export function meanMotionRevPerDay(altitudeKm: number): number {
  const a = EARTH_RADIUS_KM + altitudeKm;
  const radPerSec = Math.sqrt(MU_KM3_S2 / (a * a * a));
  return (radPerSec * 86400) / (2 * Math.PI);
}

function epochField(epoch: string): { yy: string; dayOfYear: number } {
  const [y, m, d] = epoch.split('-').map(Number);
  const start = Date.UTC(y, 0, 1);
  const dayOfYear = (Date.UTC(y, m - 1, d) - start) / 86400000 + 1;
  return { yy: String(y % 100).padStart(2, '0'), dayOfYear };
}

/** TLE implied-decimal exponent field, e.g. 1.2e-4 -> " 12000-4" */
function fmtBstar(value: number): string {
  if (value === 0) return ' 00000-0';
  const exp = Math.floor(Math.log10(Math.abs(value))) + 1;
  const mant = Math.round((Math.abs(value) / 10 ** exp) * 1e5);
  const sign = value < 0 ? '-' : ' ';
  const expSign = exp < 0 ? '-' : '+';
  return `${sign}${String(mant).padStart(5, '0')}${expSign}${Math.abs(exp)}`;
}

interface TleFields {
  noradId: number;
  intl: string;
  epoch: { yy: string; dayOfYear: number };
  bstar: number;
  elementSet: number;
  inclinationDeg: number;
  raanDeg: number;
  ecc: number;
  argPerigeeDeg: number;
  meanAnomalyDeg: number;
  meanMotion: number;
  revNumber: number;
}

function buildTle(f: TleFields): { tle1: string; tle2: string } {
  const id = String(f.noradId).padStart(5, '0');
  const epochStr = `${f.epoch.yy}${f.epoch.dayOfYear.toFixed(8).padStart(12, '0')}`;
  const l1 = `1 ${id}U ${f.intl.padEnd(8, ' ')} ${epochStr} +.00000000 +00000-0 ${fmtBstar(f.bstar)} 0 ${String(f.elementSet).padStart(4, ' ')}`;
  const eccStr = Math.round(f.ecc * 1e7)
    .toString()
    .padStart(7, '0');
  const l2 =
    `2 ${id} ${f.inclinationDeg.toFixed(4).padStart(8, ' ')} ${f.raanDeg.toFixed(4).padStart(8, ' ')} ${eccStr} ` +
    `${f.argPerigeeDeg.toFixed(4).padStart(8, ' ')} ${f.meanAnomalyDeg.toFixed(4).padStart(8, ' ')} ` +
    `${f.meanMotion.toFixed(8).padStart(11, ' ')}${String(f.revNumber).padStart(5, ' ')}`;
  return { tle1: `${l1}${tleChecksum(l1)}`, tle2: `${l2}${tleChecksum(l2)}` };
}

/** Generate `count` synthetic element sets: Walker LEO shells plus a GEO belt slice. */
export function generateSyntheticTles(options: SynthOptions): SynthTle[] {
  const count = Math.max(0, Math.floor(options.count));
  const rand = mulberry32(options.seed ?? 1);
  const epoch = epochField(options.epoch ?? '2026-11-09');
  const firstId = options.firstNoradId ?? 70000;
  const shells = options.shells ?? STARLINK_LIKE_SHELLS;
  const geoFraction = options.geoFraction ?? 0.04;
  const geoCount = count >= 10 ? Math.max(1, Math.round(count * geoFraction)) : 0;
  const leoCount = count - geoCount;
  const out: SynthTle[] = [];

  const totalWeight = shells.reduce((s, sh) => s + sh.weight, 0);
  let assigned = 0;
  shells.forEach((shell, si) => {
    const n = si === shells.length - 1 ? leoCount - assigned : Math.round((leoCount * shell.weight) / totalWeight);
    assigned += n;
    const planes = Math.max(1, Math.min(shell.planes, n));
    const perPlane = Math.max(1, Math.ceil(n / planes));
    const nom = meanMotionRevPerDay(shell.altitudeKm);
    for (let k = 0; k < n; k++) {
      const plane = k % planes;
      const slot = Math.floor(k / planes);
      const raan = (360 * plane) / planes;
      const ma = ((360 * slot) / perPlane + (360 * shell.phasing * plane) / (planes * perPlane) + rand() * 0.5) % 360;
      const noradId = firstId + out.length;
      const { tle1, tle2 } = buildTle({
        noradId,
        intl: `26${String(100 + si).padStart(3, '0')}${String.fromCharCode(65 + (k % 26))}`,
        epoch,
        bstar: 1e-4 * (0.5 + rand()),
        elementSet: 999,
        inclinationDeg: shell.inclinationDeg + (rand() - 0.5) * 0.02,
        raanDeg: (raan + rand() * 0.2) % 360,
        ecc: 0.0001 + rand() * 0.0004,
        argPerigeeDeg: rand() * 360,
        meanAnomalyDeg: ma,
        meanMotion: nom * (1 + (rand() - 0.5) * 2e-4),
        revNumber: 1000 + Math.floor(rand() * 8000),
      });
      out.push({ name: `SYNTH-LEO-${noradId}`, noradId, tle1, tle2, shell: `leo-${shell.inclinationDeg}-${shell.altitudeKm}` });
    }
  });

  // GEO belt slice: near-zero inclination, spread around the belt by mean anomaly
  const geoNm = 86400 / SIDEREAL_DAY_S;
  for (let g = 0; g < geoCount; g++) {
    const noradId = firstId + out.length;
    const { tle1, tle2 } = buildTle({
      noradId,
      intl: `26900${String.fromCharCode(65 + (g % 26))}`,
      epoch,
      bstar: 0,
      elementSet: 999,
      inclinationDeg: rand() * 0.1,
      raanDeg: 0,
      ecc: 0.0001 + rand() * 0.0002,
      argPerigeeDeg: 0,
      meanAnomalyDeg: (360 * g) / geoCount,
      meanMotion: geoNm,
      revNumber: 100 + Math.floor(rand() * 900),
    });
    out.push({ name: `SYNTH-GEO-${noradId}`, noradId, tle1, tle2, shell: 'geo' });
  }
  return out;
}

/** Render as classic 3-line TLE text (name, line 1, line 2). */
export function toThreeLineText(tles: SynthTle[]): string {
  return `${tles.map((t) => `${t.name}\n${t.tle1}\n${t.tle2}`).join('\n')}\n`;
}
