// @vitest-environment node
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearTleSetCache, decodeTleSetBytes, loadTleSet, setTleSetBaseUrl, tleSetUrl } from '../../src/tle-sets/tle-set-loader';
import type { TleSet } from '../../src/tle-sets/tle-set-types';

const fixture = (name: string): TleSet => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'));
const gz = (set: unknown): Uint8Array => new Uint8Array(gzipSync(Buffer.from(JSON.stringify(set))));

afterEach(() => {
  vi.unstubAllGlobals();
  clearTleSetCache();
  setTleSetBaseUrl('/assets/tle-sets/');
});

describe('decodeTleSetBytes', () => {
  it('decodes and validates a gzip set', async () => {
    const set = await decodeTleSetBytes(gz(fixture('starlink-mini.json')), 'starlink-mini');

    expect(set.members).toHaveLength(200);
    expect(set.format).toBe('sr-tle-set/1');
  });

  it('accepts plain JSON when the server already decoded it', async () => {
    const set = await decodeTleSetBytes(new TextEncoder().encode(JSON.stringify(fixture('geo-mini.json'))), 'geo-mini');

    expect(set.members).toHaveLength(50);
  });

  it('checks the sha256 of gzip bytes', async () => {
    const bytes = gz(fixture('geo-mini.json'));
    const sha = createHash('sha256').update(bytes).digest('hex');

    await expect(decodeTleSetBytes(bytes, 'geo-mini', sha)).resolves.toBeDefined();
    await expect(decodeTleSetBytes(bytes, 'geo-mini', 'f'.repeat(64))).rejects.toThrow(/checksum/u);
  });

  it('rejects a wrong format tag, id mismatch, bad TLE checksum, duplicate ids, unknown group and bad counts', async () => {
    const good = fixture('geo-mini.json');

    await expect(decodeTleSetBytes(gz({ ...good, format: 'sr-tle-set/2' }), 'geo-mini')).rejects.toThrow(/format/u);
    await expect(decodeTleSetBytes(gz(good), 'other-id')).rejects.toThrow(/id mismatch/u);

    const badLine = structuredClone(good);

    badLine.members[0].tle1 = `${badLine.members[0].tle1.slice(0, 68)}${(Number(badLine.members[0].tle1[68]) + 1) % 10}`;
    await expect(decodeTleSetBytes(gz(badLine), 'geo-mini')).rejects.toThrow(/checksum/u);

    const dup = structuredClone(good);

    dup.members[1] = { ...dup.members[0] };
    await expect(decodeTleSetBytes(gz(dup), 'geo-mini')).rejects.toThrow(/duplicate/u);

    const badGroup = structuredClone(good);

    badGroup.members[0].group = 'nope';
    await expect(decodeTleSetBytes(gz(badGroup), 'geo-mini')).rejects.toThrow(/unknown group/u);

    const badCount = structuredClone(good);

    badCount.groups[0].count += 1;
    await expect(decodeTleSetBytes(gz(badCount), 'geo-mini')).rejects.toThrow(/declares/u);
  });
});

describe('loadTleSet', () => {
  it('fetches once and serves later calls from memory', async () => {
    const bytes = gz(fixture('starlink-mini.json'));
    const fetchMock = vi.fn(async () => new Response(bytes, { status: 200 }));

    vi.stubGlobal('fetch', fetchMock);
    setTleSetBaseUrl('/x');
    const [a, b] = await Promise.all([loadTleSet('starlink-mini'), loadTleSet('starlink-mini')]);

    expect(a).toBe(b);
    expect(await loadTleSet('starlink-mini')).toBe(a);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/x/starlink-mini/starlink-mini.json.gz');
    expect(tleSetUrl('starlink-mini')).toBe('/x/starlink-mini/starlink-mini.json.gz');
  });

  it('reports a missing set and does not cache the failure', async () => {
    const fetchMock = vi.fn(async () => new Response('nope', { status: 404 }));

    vi.stubGlobal('fetch', fetchMock);
    await expect(loadTleSet('missing')).rejects.toThrow(/not available/u);
    await expect(loadTleSet('missing')).rejects.toThrow(/not available/u);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
