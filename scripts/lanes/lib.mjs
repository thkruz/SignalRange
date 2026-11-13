/** Shared helpers for the lane scripts. Node built-ins only. */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const lanesDir = path.resolve(repoRoot, '..', 'sr-lanes');
export const laneDir = (name) => path.join(lanesDir, name);

export function validName(name) {
  return typeof name === 'string' && /^[a-z0-9][a-z0-9-]{0,40}$/u.test(name);
}

export function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

export function gitTry(cwd, ...args) {
  try {
    return git(cwd, ...args);
  } catch {
    return null;
  }
}

/** Run a command inheriting stdio; returns the exit status. */
export function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  return r.status ?? 1;
}

export function readLanes() {
  if (!fs.existsSync(lanesDir)) return [];
  const out = [];
  for (const name of fs.readdirSync(lanesDir)) {
    const f = path.join(laneDir(name), '.lane.json');
    if (!fs.existsSync(f)) continue;
    try {
      out.push({ ...JSON.parse(fs.readFileSync(f, 'utf8')), dir: laneDir(name) });
    } catch {
      /* ignore unreadable lane file */
    }
  }
  return out;
}

function probe(host, port) {
  return new Promise((resolve) => {
    const s = net.connect({ host, port });
    s.setTimeout(500);
    s.once('connect', () => {
      s.destroy();
      resolve(true);
    });
    s.once('timeout', () => {
      s.destroy();
      resolve(false);
    });
    s.once('error', () => resolve(false));
  });
}

export async function portListening(port) {
  return (await probe('127.0.0.1', port)) || (await probe('::1', port));
}

/** PIDs listening on a TCP port. */
export function listeningPids(port) {
  const pids = new Set();
  try {
    if (process.platform === 'win32') {
      const txt = execFileSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf8' });
      const re = new RegExp(`:${port}\\s+\\S+\\s+LISTENING\\s+(\\d+)`, 'u');
      for (const line of txt.split(/\r?\n/u)) {
        const m = re.exec(line);
        if (m && Number(m[1]) > 0) pids.add(Number(m[1]));
      }
    } else {
      const txt = execFileSync('lsof', ['-t', `-iTCP:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' });
      for (const p of txt.split(/\s+/u)) if (p) pids.add(Number(p));
    }
  } catch {
    /* none listening or tool missing */
  }
  return [...pids];
}

export function killTree(pid) {
  try {
    if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    else process.kill(pid, 'SIGKILL');
    return true;
  } catch {
    return false;
  }
}

export function laneState(lane) {
  const dirty = gitTry(lane.dir, 'status', '--porcelain', '--ignore-submodules=dirty');
  const counts = gitTry(lane.dir, 'rev-list', '--left-right', '--count', `dev...${lane.branch}`);
  const [behind, ahead] = counts ? counts.split(/\s+/u).map(Number) : [Number.NaN, Number.NaN];
  return { dirty: dirty === null ? null : dirty.length > 0, ahead, behind };
}

/**
 * Hard-link (copy as fallback) every file under `src` that is missing in `dest`. Existing files are never touched, so
 * tracked files in the lane stay as git checked them out. Returns the number of files added.
 */
function mirrorMissing(src, dest) {
  let added = 0;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      added += mirrorMissing(from, to);
    } else if (!fs.existsSync(to)) {
      try {
        fs.linkSync(from, to);
      } catch {
        fs.copyFileSync(from, to);
      }
      added += 1;
    }
  }
  return added;
}

/**
 * Give a lane what git does not carry, so it runs the same tests as the main tree:
 *  1. the gitignored campaign assets (mp3/webp/png, R2-backed), hard-linked from the main checkout. Hard links, not a
 *     directory junction, because the tracked READMEs/.gitkeep live in the same directories (a junction would hide them
 *     and show as deletions) and the build and tests only read these files, so sharing the bytes is safe and costs
 *     no disk. Falls back to copying across volumes.
 *  2. the private app's node_modules (ts-morph etc.) when src/private/app exists; skipped for OSS checkouts.
 */
export function syncLaneExtras(dir) {
  const srcAssets = path.join(repoRoot, 'public', 'assets', 'campaigns');
  if (fs.existsSync(srcAssets)) {
    const n = mirrorMissing(srcAssets, path.join(dir, 'public', 'assets', 'campaigns'));
    console.log(`[lane] campaign assets: ${n} file(s) linked from the main checkout`);
  } else {
    console.log('[lane] no public/assets/campaigns in the main checkout; skipping asset link');
  }
  const appDir = path.join(dir, 'src', 'private', 'app');
  if (fs.existsSync(path.join(appDir, 'package.json'))) {
    if (fs.existsSync(path.join(appDir, 'node_modules', 'ts-morph'))) {
      console.log('[lane] private app dependencies already installed');
    } else {
      const lock = fs.existsSync(path.join(appDir, 'package-lock.json'));
      const status = run('npm', [lock ? 'ci' : 'install', '--no-audit', '--no-fund'], appDir);
      if (status !== 0) console.log('[lane] warning: private app install failed; private app tests will fail in this lane');
    }
  } else {
    console.log('[lane] no src/private/app; skipping private app install');
  }
}
