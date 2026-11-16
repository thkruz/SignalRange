#!/usr/bin/env node
/**
 * Kill every SignalRange dev/e2e server still running on this machine: `rspack serve` (pnpm run dev) and
 * `scripts/e2e/serve-dist.mjs`, from the main checkout, agent worktrees (.claude/worktrees) and lanes (../sr-lanes).
 * A server counts when its command line mentions a path under the folder that holds this checkout, so other
 * projects' rspack servers are left alone. Launcher parents (cross-env, pnpm/npm run dev, npx rspack, cmd /c) are
 * killed with their server so nothing respawns or lingers.
 *
 * Usage: pnpm run die-sr-die [--dry-run]
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dryRun = process.argv.includes('--dry-run');
const isWindows = process.platform === 'win32';
const norm = (s) => s.replaceAll('\\', '/').toLowerCase();

// <project>/signal-range/scripts/die-sr-die.mjs -> <project>: covers the checkout, its worktrees and ../sr-lanes.
const projectRoot = norm(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..'));

// cmd.exe escapes quotes as ^^^", so allow quotes and carets between "rspack" and "serve".
const SERVER_RE = /rspack(?:\.js)?[\s"'^]+serve\b|serve-dist\.mjs/u;
const LAUNCHER_RE = /rspack(?:\.js)?[\s"'^]+serve\b|serve-dist\.mjs|cross-env|\brun\s+dev\b/u;

/** @returns {{pid: number, ppid: number, cmd: string}[]} */
function listProcesses() {
  if (isWindows) {
    const out = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress',
      ],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    );
    return JSON.parse(out).map((p) => ({ pid: p.ProcessId, ppid: p.ParentProcessId, cmd: p.CommandLine ?? '' }));
  }
  const out = execFileSync('ps', ['-eo', 'pid=,ppid=,args='], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return out
    .split('\n')
    .map((line) => /^\s*(\d+)\s+(\d+)\s+(.*)$/u.exec(line))
    .filter(Boolean)
    .map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), cmd: m[3] }));
}

const procs = listProcesses();
const byPid = new Map(procs.map((p) => [p.pid, p]));

// Never touch this script or the pnpm/shell chain that launched it.
const self = new Set();
for (let p = byPid.get(process.pid); p && !self.has(p.pid); p = byPid.get(p.ppid)) self.add(p.pid);

const servers = procs.filter((p) => !self.has(p.pid) && SERVER_RE.test(p.cmd) && norm(p.cmd).includes(projectRoot));

// Climb from each server to its topmost launcher so the whole chain goes.
const tops = new Map();
for (const server of servers) {
  let top = server;
  for (let parent = byPid.get(top.ppid); parent && !self.has(parent.pid) && LAUNCHER_RE.test(parent.cmd); parent = byPid.get(parent.ppid)) {
    top = parent;
  }
  tops.set(top.pid, top);
}

// Drop any top that sits inside another top's tree; killing the outer tree already takes it.
for (const top of [...tops.values()]) {
  for (let p = byPid.get(top.ppid); p; p = byPid.get(p.ppid)) {
    if (tops.has(p.pid)) {
      tops.delete(top.pid);
      break;
    }
    if (p.ppid === p.pid) break;
  }
}

if (tops.size === 0) {
  console.log('No SignalRange servers running.');
  process.exit(0);
}

const short = (cmd) => (cmd.length > 140 ? `${cmd.slice(0, 137)}...` : cmd);
let failed = 0;
for (const top of tops.values()) {
  console.log(`${dryRun ? 'would kill' : 'killing'} ${top.pid}  ${short(top.cmd)}`);
  if (dryRun) continue;
  try {
    if (isWindows) {
      execFileSync('taskkill', ['/PID', String(top.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      // Kill descendants first, then the launcher.
      const tree = [top.pid];
      for (let i = 0; i < tree.length; i++) for (const p of procs) if (p.ppid === tree[i]) tree.push(p.pid);
      for (const pid of tree.reverse()) {
        try {
          process.kill(pid, 'SIGTERM');
        } catch {
          // already gone
        }
      }
    }
  } catch (err) {
    failed++;
    console.error(`  failed: ${err.message}`);
  }
}

console.log(dryRun ? `${tops.size} server(s) found (dry run).` : `${tops.size - failed} of ${tops.size} server(s) killed.`);
process.exit(failed ? 1 : 0);
