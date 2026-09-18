import { existsSync, rmSync } from 'node:fs';
import { writeGeneratedManifest } from '../lib/codegen';
import { readLockfile, writeLockfile } from '../lib/lockfile';
import { CliError, log } from '../lib/log';
import { pluginDir } from '../lib/paths';
import type { Flags } from '../lib/types';

export function removeCommand(positionals: string[], flags: Flags): number {
  const name = positionals[0];

  if (!name) {
    throw new CliError('Usage: pnpm run plugin -- remove <name> [--keep-files]');
  }

  const lock = readLockfile();
  const dir = pluginDir(name);

  if (!lock.plugins[name] && !existsSync(dir)) {
    throw new CliError(`"${name}" is not installed.`);
  }

  if (!flags['keep-files'] && existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
    log.step(`Removed src/plugins-external/${name}`);
  }

  delete lock.plugins[name];
  writeLockfile(lock);
  writeGeneratedManifest();

  log.success(`Removed ${name}. Rebuild to apply.`);

  return 0;
}
