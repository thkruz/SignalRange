import { existsSync, rmSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { writeGeneratedManifest } from '../lib/codegen';
import { confirm } from '../lib/confirm';
import { checkout, clone, headCommit } from '../lib/git';
import { assertNameAvailable, deriveName, enforceEngineCompat, isGitUrl, isInsideExternalDir, validatePluginStrict } from '../lib/install-helpers';
import { readLockfile, writeLockfile } from '../lib/lockfile';
import { CliError, log } from '../lib/log';
import { EXTERNAL_DIR, pluginDir } from '../lib/paths';
import { readManifest } from '../lib/plugin-meta';
import type { Flags, LockEntry } from '../lib/types';

export function addCommand(positionals: string[], flags: Flags): Promise<number> {
  const source = positionals[0];

  if (!source) {
    throw new CliError('Usage: pnpm run plugin -- add <git-url|local-path> [--ref <ref>] [--name <name>] [--force] [--yes]');
  }

  const force = Boolean(flags.force);
  const assumeYes = Boolean(flags.yes);

  if (isGitUrl(source)) {
    return addFromGit(source, flags, force, assumeYes);
  }

  return Promise.resolve(addFromLocal(source, flags, force));
}

async function addFromGit(url: string, flags: Flags, force: boolean, assumeYes: boolean): Promise<number> {
  const name = (typeof flags.name === 'string' && flags.name) || deriveName(url);
  const ref = typeof flags.ref === 'string' ? flags.ref : '';

  assertNameAvailable(name);

  log.warn(`Installing "${name}" runs third-party code in your build and bundle. Only install plugins you trust.`);
  if (!(await confirm(`Install ${name} from ${url}?`, assumeYes))) {
    log.info('Aborted.');

    return 1;
  }

  const dir = pluginDir(name);

  try {
    log.step(`Cloning ${url}`);
    clone(url, dir);
    if (ref) {
      checkout(dir, ref);
    }
    const commit = headCommit(dir);

    validatePluginStrict(dir, name);
    enforceEngineCompat(readManifest(dir).engine, force);

    recordAndFinalize(name, { url, ref: ref || '(default)', commit, installedAt: new Date().toISOString() });
  } catch (e) {
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
    }
    throw e instanceof CliError ? e : new CliError((e as Error).message);
  }

  return 0;
}

function addFromLocal(source: string, flags: Flags, force: boolean): number {
  const abs = resolve(source);

  if (!existsSync(abs)) {
    throw new CliError(`Local path not found: ${source}`);
  }
  if (!isInsideExternalDir(abs)) {
    throw new CliError(
      `Local installs must already live under src/plugins-external/. Move the folder there first, or use "create".\n  Got: ${abs}\n  Expected under: ${EXTERNAL_DIR}`
    );
  }

  const name = (typeof flags.name === 'string' && flags.name) || basename(abs);
  const existing = readLockfile().plugins[name];

  // Local re-add is idempotent (used by CI + after `create`): refresh, don't
  // reject. The folder has to exist for a local install, so only the lockfile
  // can say the name is taken, and only by a git install.
  if (existing && !existing.local) {
    throw new CliError(`"${name}" is installed from ${existing.url}. Remove it first, or use --name.`);
  }

  validatePluginStrict(abs, name);
  enforceEngineCompat(readManifest(abs).engine, force);

  let commit = 'local';

  // Only a plugin that is its own git repo has a commit of its own; without
  // the check rev-parse would report the host engine's HEAD instead.
  if (existsSync(resolve(abs, '.git'))) {
    try {
      commit = headCommit(abs);
    } catch {
      // Initialised but no commits yet; that's fine for a local entry.
    }
  }

  recordAndFinalize(name, { url: abs, ref: 'local', commit, installedAt: new Date().toISOString(), local: true });

  return 0;
}

/** Write the lockfile entry, regenerate the manifest, and print a summary. */
function recordAndFinalize(name: string, entry: LockEntry): void {
  const lock = readLockfile();

  lock.plugins[name] = entry;
  writeLockfile(lock);

  const manifest = readManifest(pluginDir(name));
  const report = writeGeneratedManifest();
  const ids = manifest.plugins.map((p) => p.id).join(', ');

  log.success(`Installed ${name}@${manifest.version} (${ids}).`);
  if (report.incompatible.some((i) => manifest.plugins.some((p) => p.id === i.id))) {
    log.warn('This plugin may be incompatible with the current host version; see "pnpm run plugin -- list".');
  }
  log.info('Run "pnpm run build" (or restart "pnpm run dev") to include it.');
}
