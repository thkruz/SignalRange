import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE_EXT = /\.(?:[cm]?[jt]sx?)$/u;

/** Every source file under `root`, recursively (node_modules skipped). */
function sourceFiles(root: string): string[] {
  if (!existsSync(root)) {
    return [];
  }

  const out: string[] = [];
  const stack = [root];

  while (stack.length > 0) {
    const dir = stack.pop() as string;

    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name.startsWith('.')) {
        continue;
      }
      const abs = join(dir, name);

      if (statSync(abs).isDirectory()) {
        stack.push(abs);
      } else if (SOURCE_EXT.test(name)) {
        out.push(abs);
      }
    }
  }

  return out;
}

function escapeRegExp(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

/**
 * `provides.antennas` is informational, but an id that never appears as a
 * string literal under `src/` is almost certainly a typo. Returns the ids that
 * were not found.
 */
export function findUndeclaredAntennas(dir: string, antennas: readonly string[]): string[] {
  if (antennas.length === 0) {
    return [];
  }

  const sources = sourceFiles(join(dir, 'src')).map((file) => readFileSync(file, 'utf8'));

  return antennas.filter((id) => {
    const literal = new RegExp(`['"\`]${escapeRegExp(id)}['"\`]`, 'u');

    return !sources.some((src) => literal.test(src));
  });
}
