#!/usr/bin/env node
/**
 * Create a parallel work lane: a git worktree at ../sr-lanes/<name> on branch lane/<name>, with its own
 * e2e port. Usage: node scripts/lanes/new-lane.mjs <name> <port>
 */
import fs from 'node:fs';
import path from 'node:path';
import { git, gitTry, laneDir, lanesDir, portListening, readLanes, repoRoot, run, validName } from './lib.mjs';

const [name, portArg] = process.argv.slice(2);
const port = Number(portArg);
const fail = (msg) => {
  console.error(`[lane:new] ${msg}`);
  process.exit(1);
};

if (!validName(name) || !Number.isInteger(port)) fail('usage: new-lane.mjs <name> <port>   (name: a-z 0-9 -)');
if (port === 3000) fail('port 3000 is reserved for the main checkout dev server');
if (port < 1024 || port > 65535) fail('port must be 1024-65535');
const clash = readLanes().find((l) => l.port === port || l.name === name);
if (clash) fail(`lane "${clash.name}" already uses port ${clash.port} / that name`);
if (await portListening(port)) fail(`port ${port} is already listening`);
const branch = `lane/${name}`;
if (fs.existsSync(laneDir(name))) fail(`${laneDir(name)} already exists`);
if (gitTry(repoRoot, 'rev-parse', '--verify', '--quiet', branch) !== null) fail(`branch ${branch} already exists`);

const t0 = Date.now();
const lap = (label) => console.log(`[lane:new] ${label} done (${((Date.now() - t0) / 1000).toFixed(0)}s elapsed)`);
fs.mkdirSync(lanesDir, { recursive: true });
const dir = laneDir(name);
git(repoRoot, 'worktree', 'add', '-b', branch, dir, 'HEAD');
lap('worktree');

// The private submodule is multi-GB; borrow objects from the main checkout's clone instead of re-downloading.
const refGit = path.join(repoRoot, '.git', 'modules', 'src', 'private');
const subArgs = ['submodule', 'update', '--init'];
if (fs.existsSync(refGit)) subArgs.push('--reference', refGit);
if (run('git', [...subArgs, 'src/private'], dir) !== 0) {
  console.log('[lane:new] note: src/private could not be initialised (no access?); continuing without private content');
}
lap('submodule');

if (run('pnpm', ['install', '--frozen-lockfile', '--prefer-offline'], dir) !== 0) fail('pnpm install failed');
lap('install');
if (run('pnpm', ['run', 'build:e2e'], dir) !== 0) fail('build:e2e failed');
lap('build:e2e');

fs.writeFileSync(path.join(dir, '.lane.json'), `${JSON.stringify({ name, port, branch, created: new Date().toISOString() }, null, 2)}\n`);
// keep the marker out of git status without touching the tracked .gitignore
const exclude = gitTry(dir, 'rev-parse', '--git-path', 'info/exclude');
if (exclude) {
  const file = path.resolve(dir, exclude);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, '\n.lane.json\n');
}
console.log(`\n[lane:new] lane "${name}" ready at ${dir} (branch ${branch}, port ${port})`);
console.log(`cd "${dir}" && E2E_STATIC=1 SR_DEV_PORT=${port} pnpm exec playwright test <specs> --reporter=line`);
