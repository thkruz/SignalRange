import { existsSync } from 'node:fs';
import { builtinIds } from './builtin-ids';
import { readLockfile } from './lockfile';
import { pluginDir } from './paths';
import { readManifest } from './plugin-meta';

/**
 * Every id already claimed by a built-in plugin or an installed external
 * plugin, excluding `excludeName` (so re-validating a plugin doesn't collide with
 * itself). Used by `add`/`doctor` to reject duplicate ids before install.
 */
export function existingIds(excludeName?: string): Set<string> {
  const ids = new Set(builtinIds());
  const lock = readLockfile();

  for (const name of Object.keys(lock.plugins)) {
    if (name === excludeName || !existsSync(pluginDir(name))) {
      continue;
    }

    try {
      for (const p of readManifest(pluginDir(name)).plugins) {
        ids.add(p.id);
      }
    } catch {
      // A malformed installed manifest is surfaced elsewhere; don't block here.
    }
  }

  return ids;
}
