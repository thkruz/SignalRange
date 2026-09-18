import { type ChildProcess, type SpawnOptions, type SpawnSyncOptions, type SpawnSyncReturns, spawn, spawnSync } from 'node:child_process';

const IS_WIN = process.platform === 'win32';

function quoteArg(arg: string): string {
  return /[\s"]/u.test(arg) ? `"${arg.replaceAll('"', '\\"')}"` : arg;
}

/**
 * Run a package-manager shim (`npx`, `pnpm`). On Windows those are .cmd files
 * that only a shell can start; passing one pre-joined command string (instead
 * of an args array with `shell: true`) keeps Node 24's DEP0190 warning quiet.
 * Real executables (git, taskkill) do not need this and should use spawn directly.
 */
export function runShimSync(cmd: string, args: readonly string[], opts: SpawnSyncOptions): SpawnSyncReturns<string | Buffer> {
  return IS_WIN ? spawnSync([cmd, ...args].map(quoteArg).join(' '), { ...opts, shell: true }) : spawnSync(cmd, [...args], opts);
}

/** Async twin of {@link runShimSync} for long-running processes (the dev server). */
export function runShim(cmd: string, args: readonly string[], opts: SpawnOptions): ChildProcess {
  return IS_WIN ? spawn([cmd, ...args].map(quoteArg).join(' '), { ...opts, shell: true }) : spawn(cmd, [...args], opts);
}
