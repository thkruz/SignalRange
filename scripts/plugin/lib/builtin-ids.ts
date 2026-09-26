import { readFileSync } from 'node:fs';
import { BUILTIN_MANIFEST_PATH } from './paths';

let cached: Set<string> | null = null;

/**
 * Extract every built-in plugin `id` by regex-scanning plugin-manifest.ts.
 *
 * Deliberately does NOT import the manifest module: it pulls in browser-only
 * engine code and the `__IS_PRIVATE__` DefinePlugin constant, neither of which
 * resolves under a plain tsx/Node CLI.
 */
export function builtinIds(): Set<string> {
  if (cached) {
    return cached;
  }

  const src = readFileSync(BUILTIN_MANIFEST_PATH, 'utf8');
  const ids = new Set<string>();
  const re = /id:\s*'([^']+)'/gu;
  let m: RegExpExecArray | null = re.exec(src);

  while (m !== null) {
    ids.add(m[1]);
    m = re.exec(src);
  }

  cached = ids;

  return ids;
}
