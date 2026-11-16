import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { devServerEnv } from '../../e2e/utils/build-flags';

describe('devServerEnv (mirrors rspack.config.mts env loading)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sr-flags-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('reads flags that exist only in .env or .env.production', () => {
    writeFileSync(join(dir, '.env'), 'KT_EMBED_LICENSE=abc\n');
    writeFileSync(join(dir, '.env.production'), 'PUBLIC_FEEDBACK_EDGE_LIVE=true\n');
    const env = devServerEnv({}, dir);
    expect(env.KT_EMBED_LICENSE).toBe('abc');
    expect(env.PUBLIC_FEEDBACK_EDGE_LIVE).toBe('true');
  });

  it('first source wins: process.env, then .env, then .env.production', () => {
    writeFileSync(join(dir, '.env'), 'A=env\nB=env\n');
    writeFileSync(join(dir, '.env.production'), 'A=prod\nB=prod\nC=prod\n');
    const env = devServerEnv({ A: 'shell' }, dir);
    expect(env.A).toBe('shell');
    expect(env.B).toBe('env');
    expect(env.C).toBe('prod');
  });

  it('tolerates missing files', () => {
    expect(devServerEnv({ X: '1' }, dir)).toEqual({ X: '1' });
  });
});
