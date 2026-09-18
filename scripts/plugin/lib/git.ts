import { spawnSync } from 'node:child_process';
import { CliError } from './log';

interface GitResult {
  readonly ok: boolean;
  readonly stdout: string;
  readonly stderr: string;
}

interface GitOptions {
  readonly cwd?: string;
  /** Stream output to the terminal (clone/fetch progress) instead of capturing it. */
  readonly inherit?: boolean;
  /** Return `ok: false` instead of throwing on a non-zero exit. */
  readonly allowFail?: boolean;
}

/**
 * Run a git command. `git.exe` is a real executable on every platform, so no
 * shell is involved (which also keeps Node 24's DEP0190 warning quiet).
 * Captures output by default; pass `inherit: true` to stream progress.
 */
export function git(args: string[], opts: GitOptions = {}): GitResult {
  const res = spawnSync('git', args, {
    cwd: opts.cwd,
    encoding: 'utf8',
    stdio: opts.inherit ? ['ignore', 'inherit', 'inherit'] : 'pipe',
  });

  const ok = res.status === 0;

  if (!ok && !opts.allowFail) {
    const spawnFailure = res.error ? `: ${res.error.message}` : '';
    const detail = opts.inherit ? spawnFailure : `: ${(res.stderr || res.stdout || spawnFailure.slice(2) || '').trim()}`;

    throw new CliError(`git ${args.join(' ')} failed${detail}`);
  }

  return { ok, stdout: (res.stdout ?? '').trim(), stderr: (res.stderr ?? '').trim() };
}

/** Clone a repo into `dest`, streaming progress. */
export function clone(url: string, dest: string): void {
  git(['clone', url, dest], { inherit: true });
}

/** Check out a specific ref (branch, tag, or SHA) in `cwd`. */
export function checkout(cwd: string, ref: string): void {
  git(['checkout', ref], { cwd, inherit: true });
}

/** Resolve the current HEAD commit SHA in `cwd`. */
export function headCommit(cwd: string): string {
  return git(['rev-parse', 'HEAD'], { cwd }).stdout;
}

/** Fetch all refs + tags. */
export function fetch(cwd: string): void {
  git(['fetch', '--tags', '--prune', 'origin'], { cwd, inherit: true });
}

/** Fast-forward the current branch to origin/<ref>; throws if not fast-forwardable. */
export function fastForward(cwd: string, ref: string): void {
  git(['merge', '--ff-only', `origin/${ref}`], { cwd, inherit: true });
}

/** The remote's default branch name (e.g. "main"), falling back to "main". */
export function remoteDefaultBranch(cwd: string): string {
  const res = git(['rev-parse', '--abbrev-ref', 'origin/HEAD'], { cwd, allowFail: true });
  const match = /^origin\/(.+)$/u.exec(res.stdout);

  return match ? match[1] : 'main';
}

/** Initialize a new git repo in `cwd` (used by the scaffolder). */
export function init(cwd: string): void {
  git(['init'], { cwd });
}
