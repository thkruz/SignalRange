/**
 * Collects the literal clock times in every nats-eu scenario string (tokens
 * removed first). Shared by the lint and by whoever regenerates the allowlist.
 */

const modules = import.meta.glob('../../../src/campaigns/nats-eu/scenario*.ts', { eager: true }) as Record<string, Record<string, unknown>>;

const TIME = /(?<![\d.:])(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?(?![\d:])/gu;

function collectStrings(value: unknown, out: string[], seen: Set<object>): void {
  if (typeof value === 'string') {
    out.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out, seen);
  } else if (value && typeof value === 'object') {
    if (seen.has(value)) return;
    seen.add(value);
    for (const item of Object.values(value)) collectStrings(item, out, seen);
  }
}

/** Sorted literal times per scenario file, tokens stripped first. */
export function literalTimesByScenario(): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [path, mod] of Object.entries(modules)) {
    const name = /scenario(\d+)\.ts$/u.exec(path)?.[1];
    if (!name) continue;
    const strings: string[] = [];
    collectStrings(mod, strings, new Set());
    const times: string[] = [];
    for (const s of strings) {
      // Drop the token syntax entirely (a fallback is the filed record, not a literal claim)
      const plain = s.replace(/\{\{[^}]*\}\}/gu, '');
      for (const m of plain.matchAll(TIME)) times.push(m[0]);
    }
    result[`s${name}`] = times.sort();
  }

  return result;
}
