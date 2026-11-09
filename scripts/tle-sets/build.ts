/**
 * Build (and optionally publish) sr-tle-set/1 files.
 *
 *   pnpm run tle-set:build -- [--set starlink|geo|all] [--month 2026-11] [--source keeptrack|celestrak|file]
 *                              [--input catalog.json] [--out tle-sets-out] [--publish] [--dry-run]
 *
 * Ids are `starlink-<month>` and `geo-belt-<month>` (month defaults to the current UTC month).
 *
 * Sources:
 *  - keeptrack (default): the KeepTrack catalog export, https://api.keeptrack.space/v4/sats/brief.
 *    Needs KEEPTRACK_API_KEY (run with `node --env-file=<keeptrack .env>` or export it).
 *  - celestrak: CelesTrak GP data (fallback; used automatically if the KeepTrack request fails).
 *  - file: a saved catalog JSON array via --input.
 *
 * --publish uploads <out>/<id>.json.gz to the private R2 bucket keeptrack-embed under
 * sr-tle-sets/<id>/<id>.json.gz with wrangler (local `wrangler login`), refuses to overwrite an
 * existing key, verifies by downloading it back, and rewrites tle-sets.lock.json.
 * --dry-run builds and reports but uploads nothing and leaves the lock untouched.
 *
 * Requests carry only the generic User-Agent `ai-broker/1.0`.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import type { TleSet } from '../../src/tle-sets/tle-set-types';
import { type BuildOptions, buildGeoSet, buildStarlinkSet, type CatalogRecord } from './build-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const lockPath = path.join(root, 'tle-sets.lock.json');
const BUCKET = 'keeptrack-embed';
const USER_AGENT = 'ai-broker/1.0';
const KEEPTRACK_URL = 'https://api.keeptrack.space/v4/sats/brief';

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];

    if (!a.startsWith('--')) {
      continue;
    }
    const key = a.slice(2);
    const next = argv[i + 1];

    if (next !== undefined && !next.startsWith('--')) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }

  return out;
}

async function fetchKeepTrack(): Promise<CatalogRecord[]> {
  const key = process.env.KEEPTRACK_API_KEY;

  if (!key) {
    throw new Error('KEEPTRACK_API_KEY is not set');
  }
  const res = await fetch(KEEPTRACK_URL, { headers: { 'x-api-key': key, 'User-Agent': USER_AGENT } });

  if (!res.ok) {
    throw new Error(`KeepTrack catalog export returned ${res.status}`);
  }

  return (await res.json()) as CatalogRecord[];
}

/** CelesTrak GP fallback: active Starlink plus the GEO group, as 3-line TLE text. */
async function fetchCelesTrak(): Promise<CatalogRecord[]> {
  const out: CatalogRecord[] = [];

  for (const [group, type] of [['starlink', 1], ['geo', 1]] as const) {
    const res = await fetch(`https://celestrak.org/NORAD/elements/gp.php?GROUP=${group}&FORMAT=tle`, { headers: { 'User-Agent': USER_AGENT } });

    if (!res.ok) {
      throw new Error(`CelesTrak ${group} returned ${res.status}`);
    }
    const lines = (await res.text()).split(/\r?\n/u).filter((l) => l.trim() !== '');

    for (let i = 0; i + 2 < lines.length; i += 3) {
      out.push({ name: lines[i].trim(), tle1: lines[i + 1], tle2: lines[i + 2], type });
    }
  }

  return out;
}

async function loadCatalog(args: Record<string, string | boolean>): Promise<{ records: CatalogRecord[]; source: string }> {
  const src = String(args.source ?? (args.input ? 'file' : 'keeptrack'));

  if (src === 'file') {
    const records = JSON.parse(fs.readFileSync(String(args.input), 'utf8')) as CatalogRecord[];

    return { records, source: 'KeepTrack catalog export (saved file)' };
  }
  if (src === 'keeptrack') {
    try {
      return { records: await fetchKeepTrack(), source: 'KeepTrack catalog export' };
    } catch (err) {
      console.warn(`[tle-set] KeepTrack source failed (${(err as Error).message}); falling back to CelesTrak GP.`);
    }
  }

  return { records: await fetchCelesTrak(), source: 'CelesTrak GP' };
}

function wrangler(wArgs: string[]): { ok: boolean; out: string } {
  const r = spawnSync(process.execPath, [path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js'), ...wArgs], { cwd: root, encoding: 'utf8' });

  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

interface LockEntry {
  id: string;
  r2Bucket: string;
  r2Key: string;
  sha256: string;
  sizeBytes: number;
  rawBytes: number;
  epoch: string;
  count: number;
  publishedAt: string;
}

function readLock(): { format: string; sets: Record<string, LockEntry> } {
  return JSON.parse(fs.readFileSync(lockPath, 'utf8'));
}

function publish(set: TleSet, file: string, gz: Buffer, sha: string, rawBytes: number): LockEntry {
  const lock = readLock();
  const r2Key = `sr-tle-sets/${set.id}/${set.id}.json.gz`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-tle-'));

  try {
    if (lock.sets[set.id]) {
      throw new Error(`${set.id} is already in tle-sets.lock.json; a new snapshot needs a new id.`);
    }
    if (!/logged in/iu.test(wrangler(['whoami']).out)) {
      throw new Error('wrangler is not authenticated; run `npx wrangler login` first.');
    }
    if (wrangler(['r2', 'object', 'get', `${BUCKET}/${r2Key}`, '--remote', '--file', path.join(tmp, 'probe')]).ok) {
      throw new Error(`${BUCKET}/${r2Key} already exists in R2; refusing to overwrite.`);
    }
    const put = wrangler(['r2', 'object', 'put', `${BUCKET}/${r2Key}`, '--file', file, '--content-type', 'application/gzip', '--remote']);

    if (!put.ok) {
      throw new Error(`upload failed: ${put.out.split('\n').slice(-5).join(' | ')}`);
    }
    const back = path.join(tmp, 'back.gz');

    if (!wrangler(['r2', 'object', 'get', `${BUCKET}/${r2Key}`, '--remote', '--file', back]).ok) {
      throw new Error('could not download the object back to verify it');
    }
    const backSha = createHash('sha256').update(fs.readFileSync(back)).digest('hex');

    if (backSha !== sha) {
      throw new Error(`verification failed: uploaded sha ${backSha} != ${sha}`);
    }
    const entry: LockEntry = { id: set.id, r2Bucket: BUCKET, r2Key, sha256: sha, sizeBytes: gz.length, rawBytes, epoch: set.epoch, count: set.members.length, publishedAt: new Date().toISOString() };

    lock.sets[set.id] = entry;
    fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
    console.log(`[tle-set] uploaded ${BUCKET}/${r2Key} (verified), lock updated.`);

    return entry;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const which = String(args.set ?? 'all');
  const month = String(args.month ?? new Date().toISOString().slice(0, 7));
  const outDir = path.resolve(root, String(args.out ?? 'tle-sets-out'));
  const dry = Boolean(args['dry-run']);
  const doPublish = Boolean(args.publish);

  const { records, source } = await loadCatalog(args);
  const snapshotUtc = new Date().toISOString();

  console.log(`[tle-set] catalog: ${records.length} records from ${source}`);
  fs.mkdirSync(outDir, { recursive: true });

  const jobs: { set: TleSet; report: unknown }[] = [];
  const base = (id: string, title: string): BuildOptions => ({ id, title, source, snapshotUtc });

  if (which === 'starlink' || which === 'all') {
    jobs.push(buildStarlinkSet(records, base(`starlink-${month}`, `Starlink, all shells, ${month} snapshot`)));
  }
  if (which === 'geo' || which === 'all') {
    jobs.push(buildGeoSet(records, base(`geo-belt-${month}`, `GEO belt, ${month} snapshot`)));
  }

  for (const { set, report } of jobs) {
    const raw = Buffer.from(JSON.stringify(set));
    const gz = gzipSync(raw, { level: 9 });
    const sha = createHash('sha256').update(gz).digest('hex');
    const file = path.join(outDir, `${set.id}.json.gz`);

    fs.writeFileSync(file, gz);
    console.log(`[tle-set] ${set.id}: ${set.members.length} members, ${set.groups.length} groups, raw ${raw.length} B, gzip ${gz.length} B, sha256 ${sha}`);
    console.log(`          report ${JSON.stringify(report)}`);
    console.log(`          groups ${set.groups.map((g) => `${g.id}=${g.count}`).join(' ')}`);
    if (doPublish) {
      if (dry) {
        console.log(`[tle-set] DRY RUN: would upload ${BUCKET}/sr-tle-sets/${set.id}/${set.id}.json.gz and write the lock.`);
      } else {
        publish(set, file, gz, sha, raw.length);
      }
    }
  }
}

main().catch((err) => {
  console.error(`[tle-set] ERROR: ${(err as Error).message}`);
  process.exit(1);
});
