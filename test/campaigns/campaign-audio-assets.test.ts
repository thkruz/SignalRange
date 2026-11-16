/**
 * Audio reference audit (#211, #282; parent audit #281).
 * Every non-empty audio path authored in src/campaigns/** must resolve to a file
 * under public/ (the folder the build copies to the asset host). An empty
 * audioUrl is a text-only clip and is allowed. The scan covers every campaign,
 * so a new clip pointing at a missing mp3 fails here, not in the player's ears.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const CAMPAIGNS_DIR = join(ROOT, 'src', 'campaigns');
const PUBLIC_DIR = join(ROOT, 'public');
const AUDIO_REF = /['"`](\/assets\/[^'"`]+\.(?:mp3|ogg|wav|m4a))['"`]/gu;

function listTs(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listTs(full));
    else if (name.endsWith('.ts')) out.push(full);
  }

  return out;
}

/** Audio references on non-comment lines, as `file:line path`. */
function collectRefs(): Array<{ where: string; path: string }> {
  const refs: Array<{ where: string; path: string }> = [];
  for (const file of listTs(CAMPAIGNS_DIR)) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (/^\s*(\/\/|\*|\/\*)/u.test(line)) return;
      for (const m of line.matchAll(AUDIO_REF)) {
        refs.push({ where: relative(ROOT, file).split(sep).join('/') + ':' + String(i + 1), path: m[1] });
      }
    });
  }

  return refs;
}

// Campaign media is gitignored (synced from R2), so CI checkouts have none: the on-disk checks run only where it exists.
const hasAudio = existsSync(join(PUBLIC_DIR, 'assets/campaigns/nats'));

describe('campaign audio references', () => {
  const refs = collectRefs();

  it('finds the authored clips', () => {
    expect(refs.length).toBeGreaterThan(100);
  });

  it.skipIf(!hasAudio)('every audio path in src/campaigns resolves to a file on disk', () => {
    const missing = refs.filter((r) => !existsSync(join(PUBLIC_DIR, r.path))).map((r) => `${r.where} ${r.path}`);

    expect(missing).toEqual([]);
  });

  it('nats scenario 21 verify-data-layer and scenario 23 NOC no-power-cycle notice clips are text-only or resolve', () => {
    for (const [file, id] of [
      ['scenario21.ts', 'verify-data-layer'],
      ['scenario23.ts', 'confirm-fault-dashboard'],
    ]) {
      const text = readFileSync(join(CAMPAIGNS_DIR, 'nats', file), 'utf8');
      const at = text.indexOf(`'${id}': {`);
      expect(at, `${file} has ${id}`).toBeGreaterThan(-1);
      const block = text.slice(at, at + 3000);
      const clip = /audioUrl:\s*(?:getAssetUrl\('([^']*)'\)|'([^']*)')/u.exec(block);
      const path = clip?.[1] ?? clip?.[2] ?? '';

      expect(path === '' || !hasAudio || existsSync(join(PUBLIC_DIR, path))).toBe(true);
    }
  });
});
