import { isGeneratedManifestInSync, writeGeneratedManifest } from '../lib/codegen';
import { log } from '../lib/log';
import type { Flags } from '../lib/types';
import { restoreMissing } from './restore';

export interface SyncOptions {
  /** Compare only; exit 1 on drift, write nothing. */
  readonly check?: boolean;
  /** Skip cloning missing plugins (used when the caller already restored). */
  readonly skipRestore?: boolean;
}

/**
 * The single reconciliation entry point: restore missing clones and regenerate
 * the committed manifest from disk. Idempotent and deterministic; a clean tree
 * regenerates a byte-identical file. Called by prebuild/predev and after every
 * add/remove/update.
 */
export function runSync(opts: SyncOptions = {}): number {
  if (opts.check) {
    if (isGeneratedManifestInSync()) {
      log.success('plugin-manifest.external.generated.ts is in sync.');

      return 0;
    }
    log.error('plugin-manifest.external.generated.ts is out of sync; run "pnpm run plugin -- sync".');

    return 1;
  }

  if (!opts.skipRestore) {
    restoreMissing();
  }

  const report = writeGeneratedManifest();

  for (const { name, reason } of report.invalid) {
    log.warn(`Skipped invalid plugin "${name}": ${reason}`);
  }
  for (const name of report.missing) {
    log.warn(`Plugin "${name}" is in the lockfile but not on disk; excluded from the build. Run "pnpm run plugin -- restore".`);
  }
  for (const { id, engine } of report.incompatible) {
    log.warn(`Plugin "${id}" declares engine ${engine}, which does not satisfy the host version; it may fail to build.`);
  }

  if (report.included.length > 0) {
    log.success(`Wired ${report.included.length} external plugin(s): ${report.included.join(', ')}`);
  } else {
    log.step('No external plugins installed.');
  }

  return 0;
}

export function syncCommand(flags: Flags): number {
  return runSync({ check: Boolean(flags.check) });
}
