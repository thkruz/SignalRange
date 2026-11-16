import lock from '../../tle-sets.lock.json';
import type { TleSet } from './tle-set-types';
import { validateTleSet } from './tle-set-validate';

interface LockEntry {
  id: string;
  sha256: string;
  sizeBytes: number;
}

/** Same-origin folder the fetch script fills (scripts/fetch-tle-sets.mjs). */
const DEFAULT_BASE_URL = '/assets/tle-sets/';

let baseUrl_ = DEFAULT_BASE_URL;
const cache_ = new Map<string, Promise<TleSet>>();

/** Override where sets are served from (tests, previews). */
export function setTleSetBaseUrl(url: string): void {
  baseUrl_ = url.endsWith('/') ? url : `${url}/`;
}

/** Drop every cached set (tests). */
export function clearTleSetCache(): void {
  cache_.clear();
}

export function tleSetUrl(id: string): string {
  return `${baseUrl_}${id}/${id}.json.gz`;
}

function lockEntry_(id: string): LockEntry | undefined {
  const sets = (lock as { sets?: Record<string, LockEntry> }).sets ?? {};

  return sets[id];
}

async function sha256Hex_(bytes: Uint8Array): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;

  if (!subtle) {
    return null;
  }
  const digest = await subtle.digest('SHA-256', bytes as BufferSource);

  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function gunzip_(bytes: Uint8Array): Promise<string> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));

  return new Response(stream).text();
}

/**
 * Turn the bytes of a set file into a validated TleSet. Accepts gzip (magic 1f 8b) or plain JSON
 * text, since a server or dev proxy may already have decoded the content. When `expectedSha256` is
 * given and the bytes are gzip, the hash of the compressed bytes must match.
 */
export async function decodeTleSetBytes(bytes: Uint8Array, id: string, expectedSha256?: string): Promise<TleSet> {
  const isGzip = bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;

  if (isGzip && expectedSha256) {
    const actual = await sha256Hex_(bytes);

    if (actual !== null && actual !== expectedSha256) {
      throw new Error(`TLE set "${id}" failed its checksum (sha256 ${actual}, expected ${expectedSha256}).`);
    }
  }
  const text = isGzip ? await gunzip_(bytes) : new TextDecoder().decode(bytes);

  return validateTleSet(JSON.parse(text), id);
}

async function fetchSet_(id: string): Promise<TleSet> {
  const url = tleSetUrl(id);
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`TLE set "${id}" not available (${res.status} for ${url}). Run \`pnpm run fetch:tle-sets\` with R2 credentials.`);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());

  return decodeTleSetBytes(bytes, id, lockEntry_(id)?.sha256);
}

/** Fetch, decompress, validate and memoise a TLE set by id. Failed loads are not cached. */
export function loadTleSet(id: string): Promise<TleSet> {
  let pending = cache_.get(id);

  if (!pending) {
    pending = fetchSet_(id);
    cache_.set(id, pending);
    pending.catch(() => cache_.delete(id));
  }

  return pending;
}
