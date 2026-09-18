import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { builtinIds } from './builtin-ids';
import { readLockfile } from './lockfile';
import { CliError } from './log';
import { EXTERNAL_DIR, pluginDir } from './paths';
import { readManifest } from './plugin-meta';
import type { SignalRangePluginManifest } from './types';

export interface ResolvedExternal {
  readonly kind: 'external';
  readonly name: string;
  readonly dir: string;
  readonly manifest: SignalRangePluginManifest;
  /** The id the user asked for (or the first one in the manifest). */
  readonly id: string;
  /** Dependencies of the matched plugin entry. */
  readonly dependencies: readonly string[];
}

export interface ResolvedBuiltin {
  readonly kind: 'builtin';
  readonly id: string;
}

export type ResolvedPlugin = ResolvedExternal | ResolvedBuiltin;

/** All installed external-plugin directory names (lockfile ∪ disk). */
export function installedNames(): string[] {
  const fromLock = Object.keys(readLockfile().plugins);
  const fromDisk = existsSync(EXTERNAL_DIR) ? readdirSync(EXTERNAL_DIR).filter((n) => !n.startsWith('.') && statSync(join(EXTERNAL_DIR, n)).isDirectory()) : [];

  return [...new Set([...fromLock, ...fromDisk])];
}

/**
 * Resolve a user-supplied name (an external package dir name, any external
 * plugin id, or a built-in id) to a concrete target for dev / doctor / test.
 */
export function resolvePlugin(name: string): ResolvedPlugin {
  for (const pkg of installedNames()) {
    const dir = pluginDir(pkg);

    if (!existsSync(dir)) {
      continue;
    }

    let manifest: SignalRangePluginManifest;

    try {
      manifest = readManifest(dir);
    } catch {
      continue;
    }

    const plugins = Array.isArray(manifest.plugins) ? manifest.plugins : [];
    const entry = plugins.find((p) => p.id === name);

    if (pkg === name || entry) {
      const matched = entry ?? plugins[0];

      if (!matched) {
        throw new CliError(`"${pkg}" declares no plugins in its manifest.`);
      }

      return { kind: 'external', name: pkg, dir, manifest, id: matched.id, dependencies: matched.dependencies ?? [] };
    }
  }

  if (builtinIds().has(name)) {
    return { kind: 'builtin', id: name };
  }

  throw new CliError(`Unknown plugin "${name}".\n${suggest(name)}`);
}

function suggest(name: string): string {
  const candidates = [...builtinIds(), ...installedNames()];
  const lower = name.toLowerCase();
  const near = candidates.filter((c) => c.toLowerCase().includes(lower) || lower.includes(c.toLowerCase())).slice(0, 5);

  return near.length > 0 ? `Did you mean: ${near.join(', ')}?` : 'Run "pnpm run plugin -- list" to see installed plugins.';
}
