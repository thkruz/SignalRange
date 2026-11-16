// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const script = path.resolve(__dirname, '..', '..', 'scripts', 'fetch-tle-sets.mjs');
let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fetch-tle-sets-test-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function setup(sha?: string): { buf: Buffer; lock: string; out: string; source: string } {
  const buf = gzipSync(Buffer.from(JSON.stringify({ hello: 'world' })));
  const source = path.join(dir, 'r2');
  const key = 'sr-tle-sets/demo/demo.json.gz';

  fs.mkdirSync(path.dirname(path.join(source, key)), { recursive: true });
  fs.writeFileSync(path.join(source, key), buf);
  const lock = path.join(dir, 'lock.json');

  fs.writeFileSync(
    lock,
    JSON.stringify({ sets: { demo: { id: 'demo', r2Bucket: 'b', r2Key: key, sha256: sha ?? createHash('sha256').update(buf).digest('hex'), sizeBytes: buf.length } } })
  );

  return { buf, lock, out: path.join(dir, 'out'), source };
}

const run = (env: Record<string, string>) => spawnSync(process.execPath, [script], { encoding: 'utf8', env: { ...process.env, CI: '', CLOUDFLARE_API_TOKEN: '', ...env } });

describe('fetch-tle-sets.mjs', () => {
  it('places a file whose sha256 matches, then skips it on the next run', () => {
    const { lock, out, source, buf } = setup();
    const env = { TLE_SETS_LOCK: lock, TLE_SETS_OUT: out, TLE_SETS_SOURCE_DIR: source };
    const first = run(env);

    expect(first.status).toBe(0);
    expect(fs.readFileSync(path.join(out, 'demo', 'demo.json.gz')).equals(buf)).toBe(true);
    expect(run(env).stdout).toMatch(/already present/u);
  });

  it('fails hard on a sha256 mismatch and writes nothing', () => {
    const { lock, out, source } = setup('0'.repeat(64));
    const res = run({ TLE_SETS_LOCK: lock, TLE_SETS_OUT: out, TLE_SETS_SOURCE_DIR: source });

    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/mismatch/u);
    expect(fs.existsSync(path.join(out, 'demo'))).toBe(false);
  });

  it('warns and continues in CI without credentials', () => {
    const { lock, out } = setup();
    const res = run({ TLE_SETS_LOCK: lock, TLE_SETS_OUT: out, CI: 'true' });

    expect(res.status).toBe(0);
    expect(res.stderr).toMatch(/WARNING/u);
  });

  it('warns and continues when the lock file is missing', () => {
    const res = run({ TLE_SETS_LOCK: path.join(dir, 'none.json'), TLE_SETS_OUT: path.join(dir, 'o') });

    expect(res.status).toBe(0);
    expect(res.stderr).toMatch(/not found/u);
  });
});
