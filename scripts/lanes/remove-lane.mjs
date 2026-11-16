#!/usr/bin/env node
/** Remove a lane. Usage: node scripts/lanes/remove-lane.mjs <name> [--force] */
import fs from 'node:fs';
import { git, gitTry, killTree, laneDir, laneState, listeningPids, readLanes, repoRoot, validName } from './lib.mjs';

const args = process.argv.slice(2);
const force = args.includes('--force');
const name = args.find((a) => !a.startsWith('--'));
const fail = (msg) => {
  console.error(`[lane:rm] ${msg}`);
  process.exit(1);
};

if (!validName(name)) fail('usage: remove-lane.mjs <name> [--force]');
const lane = readLanes().find((l) => l.name === name);
if (!lane) fail(`no lane named "${name}" (missing .lane.json under ${laneDir(name)})`);

const st = laneState(lane);
if (!force) {
  if (st.dirty !== false) fail('lane has uncommitted changes (or state unreadable); commit them or pass --force');
  if (st.ahead !== 0) fail(`lane branch has ${st.ahead} commit(s) not in dev; merge them or pass --force`);
}

for (const pid of listeningPids(lane.port)) {
  console.log(`[lane:rm] killing pid ${pid} listening on ${lane.port}`);
  killTree(pid);
}

try {
  // a worktree with an initialised submodule needs --force even when clean; cleanliness was checked above
  git(repoRoot, 'worktree', 'remove', '--force', lane.dir);
} catch (e) {
  if (fs.existsSync(lane.dir)) fail(`git worktree remove failed: ${String(e.stderr || e.message).trim()}`);
}
git(repoRoot, 'worktree', 'prune');
const merged = gitTry(repoRoot, 'branch', '--merged', 'dev', '--list', lane.branch);
if (merged) {
  git(repoRoot, 'branch', '-d', lane.branch);
  console.log(`[lane:rm] removed lane "${name}" and merged branch ${lane.branch}`);
} else {
  console.log(`[lane:rm] removed lane "${name}"; branch ${lane.branch} kept (not merged into dev)`);
}
