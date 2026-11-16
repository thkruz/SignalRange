#!/usr/bin/env node
/**
 * Targeted regression selector (issue #278).
 *
 * Maps changed paths to the vitest files and e2e specs worth running.
 *   node scripts/ci/select-tests.mjs [--json] [--root <dir>] (--base <ref> | <path>...)
 * Output: "FULL" when the whole suite must run, nothing when no tests apply,
 * otherwise one path per line (vitest files then e2e specs).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const norm = (p) => p.replace(/\\/gu, '/').replace(/^\.\//u, '');

const listDirs = (dir) =>
  existsSync(dir) ? readdirSync(dir).filter((n) => statSync(path.join(dir, n)).isDirectory()) : [];

const walk = (dir, out = []) => {
  if (!existsSync(dir)) return out;
  for (const n of readdirSync(dir)) {
    const full = path.join(dir, n);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
};

const rel = (root, p) => norm(path.relative(root, p));

const LEGACY_NATS_SPEC = /^scenario\d+-.*\.spec\.ts$/u;

/** Derive campaigns from src/campaigns dirs and the e2e/test file names that exist. */
export function discoverCampaigns(root) {
  const dirs = listDirs(path.join(root, 'src/campaigns'));
  const specs = existsSync(path.join(root, 'e2e/specs'))
    ? readdirSync(path.join(root, 'e2e/specs')).filter((n) => n.endsWith('.spec.ts'))
    : [];
  const campaigns = dirs.map((dir) => {
    const prefixes = [dir];
    if (!specs.some((s) => s.startsWith(`${dir}-`))) {
      // e.g. src/campaigns/ham-sdr/tech is exercised by ham-tech-* specs
      const head = dir.split('-')[0];
      for (const sub of listDirs(path.join(root, 'src/campaigns', dir))) prefixes.push(`${head}-${sub}`);
    }
    return { dir, prefixes };
  });
  // A file belongs to the campaign with the longest matching prefix (nats vs nats-eu).
  // Campaign 1 predates the prefix convention: its specs are named scenarioN-*.spec.ts.
  const owner = (name) => {
    if (LEGACY_NATS_SPEC.test(name) && dirs.includes('nats')) return 'nats';
    let best = null;
    let bestLen = -1;
    for (const c of campaigns) {
      for (const p of c.prefixes) {
        if (name.startsWith(`${p}-`) && p.length > bestLen) {
          best = c.dir;
          bestLen = p.length;
        }
      }
    }
    return best;
  };
  return { campaigns, owner };
}

/** Files for one campaign. */
export function campaignTests(root, dir, discovered = discoverCampaigns(root)) {
  const { campaigns, owner } = discovered;
  const camp = campaigns.find((c) => c.dir === dir);
  const vitest = new Set();
  const e2e = new Set();
  if (!camp) return { vitest: [], e2e: [] };
  const specDir = path.join(root, 'e2e/specs');
  if (existsSync(specDir)) {
    for (const n of readdirSync(specDir)) {
      if (n.endsWith('.spec.ts') && n.includes('full-completion') && owner(n) === dir) e2e.add(`e2e/specs/${n}`);
    }
  }
  for (const f of walk(path.join(root, 'test/campaigns'))) {
    const r = rel(root, f);
    if (!/\.test\.[cm]?[jt]sx?$/u.test(r)) continue;
    const within = r.slice('test/campaigns/'.length);
    const top = within.split('/')[0];
    const mine = within.includes('/') ? camp.prefixes.includes(top) : owner(within) === dir;
    if (mine) vitest.add(r);
  }
  return { vitest: [...vitest].sort(), e2e: [...e2e].sort() };
}

/**
 * Tests that read src/campaigns from disk (readFileSync/readdirSync) instead of importing it, so the
 * import graph (`vitest related`) cannot see them. Any src/campaigns/<dir>/ change selects all of them.
 */
export const CAMPAIGN_WIDE = [
  'test/campaigns/campaign-audio-assets.test.ts',
  'test/campaigns/campaign-registry.test.ts',
  'test/campaigns/nice-coverage.test.ts',
  'test/campaigns/range-watch-reports.test.ts',
  'test/campaigns/range-watch-validation.test.ts',
  'test/scenarios/campaign-continuity.test.ts',
  'test/physical/closeup-tools.test.ts',
  'test/physical/physical-plant-engine.test.ts',
];

// JSON is in the import graph too (quiz pools, campaign data), so `vitest related` can trace it.
const SOURCE_FILE = /^(src|scripts|e2e)\/.*\.(?:[cm]?[jt]s|json)$/u;

const DOC_ONLY = [/^docs\//u, /\.mdx?$/u, /^src\/private\//u, /^art-review\//u, /^\.claude\//u, /^LICENSE/u, /^\.vscode\//u];
const TEST_FILE = /^test\/.*\.test\.[cm]?[jt]sx?$/u;
const SPEC_FILE = /^e2e\/specs\/.*\.spec\.[cm]?[jt]sx?$/u;

/**
 * Pure selector. Returns { full, vitest, related, e2e, reasons }.
 * vitest: explicit test files (run directly). related: changed source files for `vitest related`.
 */
export function select(root, changed) {
  const discovered = discoverCampaigns(root);
  const vitest = new Set();
  const e2e = new Set();
  const related = new Set();
  const reasons = [];
  let full = false;
  const campaignDirs = new Set(discovered.campaigns.map((c) => c.dir));

  for (const raw of changed) {
    const p = norm(raw.trim());
    if (!p) continue;
    if (DOC_ONLY.some((re) => re.test(p))) continue;

    const m = /^src\/campaigns\/([^/]+)\/(.+)$/u.exec(p);
    if (m && campaignDirs.has(m[1])) {
      const t = campaignTests(root, m[1], discovered);
      for (const f of t.vitest) vitest.add(f);
      for (const f of t.e2e) e2e.add(f);
      for (const f of CAMPAIGN_WIDE) if (existsSync(path.join(root, f))) vitest.add(f);
      if (SOURCE_FILE.test(p) && !TEST_FILE.test(p) && !SPEC_FILE.test(p)) related.add(p);
      reasons.push(`${p} -> campaign ${m[1]}`);
      continue;
    }
    if (SPEC_FILE.test(p)) {
      e2e.add(p);
      reasons.push(`${p} -> changed spec`);
      continue;
    }
    if (TEST_FILE.test(p)) {
      vitest.add(p);
      reasons.push(`${p} -> changed test`);
      continue;
    }
    // Everything else (equipment, simulation, scenarios, sync, pages, engine, shared
    // campaign files, e2e helpers, package.json, configs, unknown) is shared: FULL.
    full = true;
    reasons.push(`${p} -> FULL`);
  }
  if (full) return { full: true, vitest: [], related: [], e2e: [], reasons };
  return { full: false, vitest: [...vitest].sort(), related: [...related].sort(), e2e: [...e2e].sort(), reasons };
}

export function formatText(r) {
  if (r.full) return 'FULL';
  return [...r.vitest, ...(r.related ?? []), ...r.e2e].join('\n');
}

function main(argv) {
  let json = false;
  let base = null;
  let root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const paths = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') json = true;
    else if (a === '--base') base = argv[++i];
    else if (a === '--root') root = path.resolve(argv[++i]);
    else paths.push(a);
  }
  let changed = paths;
  if (base) {
    const out = execFileSync('git', ['diff', '--name-only', '--diff-filter=d', `${base}...HEAD`], { cwd: root, encoding: 'utf8' });
    changed = out.split(/\r?\n/u).filter(Boolean);
  }
  const r = select(root, changed);
  const text = json ? JSON.stringify(r, null, 2) : formatText(r);
  if (text) process.stdout.write(`${text}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
