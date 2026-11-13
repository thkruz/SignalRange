import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs script without types
import { formatText, select } from '../../scripts/ci/select-tests.mjs';

type Result = { full: boolean; vitest: string[]; e2e: string[]; reasons: string[] };

let root: string;
const touch = (rel: string) => {
  const f = path.join(root, rel);
  mkdirSync(path.dirname(f), { recursive: true });
  writeFileSync(f, '');
};

beforeAll(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'select-tests-'));
  for (const d of ['nats', 'nats-eu', 'ham-sdr/tech', 'ccs', 'signal-hunter', 'frontline']) {
    mkdirSync(path.join(root, 'src/campaigns', d), { recursive: true });
  }
  for (const s of [
    'scenario1-full-completion',
    'nats-eu-scenario1-full-completion',
    'ham-tech-s01-full-completion',
    'ham-tech-s11-missed-pass',
    'ccs-scenario2-full-completion',
    'signal-hunter-scenario1-full-completion',
    'signal-hunter-geolocation',
    'frontline-scenario1-full-completion',
  ]) {
    touch(`e2e/specs/${s}.spec.ts`);
  }
  for (const t of [
    'nats-s3-stow-agc',
    'nats-eu-density',
    'ccs-scenario2-validation',
    'frontline-s01-completion',
    'signal-hunter-scenario1-validation',
    'ham-tech/s01',
    'nats-eu/sub',
  ]) {
    touch(`test/campaigns/${t}.test.ts`);
  }
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

const run = (...paths: string[]): Result => select(root, paths);

describe('select-tests', () => {
  it('every full-completion spec in the real repo belongs to a campaign', () => {
    const real = path.resolve(__dirname, '../..');
    const all = ['nats', 'nats-eu', 'ham-sdr', 'ccs', 'signal-hunter', 'frontline'].flatMap((c) => (select(real, [`src/campaigns/${c}/x.ts`]) as Result).e2e);
    const onDisk = readdirSync(path.join(real, 'e2e/specs')).filter((n) => n.includes('full-completion'));
    expect(new Set(all).size).toBe(onDisk.length);
  });

  it('nats change selects nats specs/tests and not nats-eu (prefix collision)', () => {
    const r = run('src/campaigns/nats/scenario1.ts');
    expect(r.full).toBe(false);
    expect(r.e2e).toEqual(['e2e/specs/scenario1-full-completion.spec.ts']);
    expect(r.vitest).toEqual(['test/campaigns/nats-s3-stow-agc.test.ts']);
  });

  it('nats-eu change selects only nats-eu', () => {
    const r = run('src/campaigns/nats-eu/scenario5.ts');
    expect(r.e2e).toEqual(['e2e/specs/nats-eu-scenario1-full-completion.spec.ts']);
    expect(r.vitest).toEqual(['test/campaigns/nats-eu-density.test.ts', 'test/campaigns/nats-eu/sub.test.ts']);
  });

  it('ham-sdr maps to ham-tech specs and test dir, full-completion only for e2e', () => {
    const r = run('src/campaigns/ham-sdr/tech/s01.ts');
    expect(r.e2e).toEqual(['e2e/specs/ham-tech-s01-full-completion.spec.ts']);
    expect(r.vitest).toEqual(['test/campaigns/ham-tech/s01.test.ts']);
  });

  it('ccs, signal-hunter and frontline map to their own sets', () => {
    expect(run('src/campaigns/ccs/x.ts').e2e).toEqual(['e2e/specs/ccs-scenario2-full-completion.spec.ts']);
    expect(run('src/campaigns/signal-hunter/x.ts').e2e).toEqual(['e2e/specs/signal-hunter-scenario1-full-completion.spec.ts']);
    expect(run('src/campaigns/frontline/x.ts').vitest).toEqual(['test/campaigns/frontline-s01-completion.test.ts']);
  });

  it('multiple campaigns union their sets', () => {
    const r = run('src/campaigns/ccs/a.ts', 'src/campaigns/nats/b.ts');
    expect(r.e2e).toHaveLength(2);
  });

  it.each([
    'src/equipment/rf-front-end/x.ts',
    'src/simulation/sim.ts',
    'src/scenarios/scenario-data.ts',
    'src/sync/sync.ts',
    'src/pages/base-page.ts',
    'src/engine/core.ts',
    'src/campaigns/campaign-manager.ts',
    'package.json',
    'pnpm-lock.yaml',
    'rspack.config.mts',
    'vitest.config.mts',
    'e2e/helpers/clock.ts',
  ])('shared path %s selects FULL', (p) => {
    const r = run(p);
    expect(r.full).toBe(true);
    expect(r.vitest).toEqual([]);
    expect(formatText(r)).toBe('FULL');
  });

  it('FULL wins over campaign selections', () => {
    expect(run('src/campaigns/nats/a.ts', 'src/equipment/x.ts').full).toBe(true);
  });

  it('docs-only changes select nothing', () => {
    const r = run('README.md', 'docs/guide.mdx', 'src/private/plans/x.md');
    expect(r.full).toBe(false);
    expect(r.vitest).toEqual([]);
    expect(r.e2e).toEqual([]);
    expect(formatText(r)).toBe('');
  });

  it('a changed test or spec selects itself', () => {
    const r = run('test/campaigns/nats-s3-stow-agc.test.ts', 'e2e/specs/ham-tech-s11-missed-pass.spec.ts');
    expect(r.vitest).toEqual(['test/campaigns/nats-s3-stow-agc.test.ts']);
    expect(r.e2e).toEqual(['e2e/specs/ham-tech-s11-missed-pass.spec.ts']);
  });

  it('normalises backslashes', () => {
    expect(run('src\\campaigns\\ccs\\x.ts').e2e).toHaveLength(1);
  });
});
